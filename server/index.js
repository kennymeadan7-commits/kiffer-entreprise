/**
 * StreamMarket API — Node 22 + SQLite intégré.
 * Mots de passe hashés (scrypt). Sessions cookie httpOnly.
 * Aucun mot de passe éditeur / client n'est stocké hors compte plateforme.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const IN_PROD = !!(process.env.NODE_ENV === "production" || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT);
const SESSION_DAYS = 7;
const DURATION_FACTORS = { 1: 1, 3: 2.7, 6: 5.1, 12: 9.6 };

const SHOP_FILE = path.join(DATA_DIR, "shop.json");
const DEFAULT_SHOP = {
  name: "Kiffer Entreprise",
  owner: "Kiffer Entreprise",
  city: "",
  whatsapp: "22965481284",
  momoMtn: "65 48 12 84",
  momoMoov: "65 48 12 84",
  headline: "Kiffer Entreprise — création de comptes Netflix.",
  tagline:
    "Un seul service : la création de votre compte Netflix. Vous commandez, vous payez au 65 48 12 84, le compte est ouvert pour vous — sans jamais demander votre mot de passe.",
  rule: "Uniquement la création de comptes Netflix. Pas de comptes partagés, pas de mots de passe stockés. Activation via un canal officiel."
};

function readShop() {
  try {
    return Object.assign({}, DEFAULT_SHOP, JSON.parse(fs.readFileSync(SHOP_FILE, "utf8")));
  } catch (e) {
    return Object.assign({}, DEFAULT_SHOP);
  }
}

function writeShop(data) {
  fs.writeFileSync(SHOP_FILE, JSON.stringify(data, null, 2));
}
const db = new DatabaseSync(path.join(DATA_DIR, "streammarket.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    seller_id TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    price INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    image TEXT,
    color TEXT,
    status TEXT NOT NULL,
    rating REAL,
    orders_count INTEGER NOT NULL DEFAULT 0,
    includes_json TEXT,
    conditions TEXT,
    info TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    customer_json TEXT NOT NULL,
    items_json TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL,
    payment_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    read_flag INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

(function migrate() {
  const cols = db.prepare("PRAGMA table_info(orders)").all();
  if (!cols.some(function (c) { return c.name === "delivery_note"; })) {
    db.exec("ALTER TABLE orders ADD COLUMN delivery_note TEXT");
  }
  if (!cols.some(function (c) { return c.name === "proof_path"; })) {
    db.exec("ALTER TABLE orders ADD COLUMN proof_path TEXT");
  }
})();

const UPLOADS = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS, { recursive: true });

(function setAdminPasswordOnce() {
  const f = path.join(DATA_DIR, "admin-password.txt");
  if (fs.existsSync(f)) return;
  const pw = "Kiffer" + crypto.randomInt(100000, 999999);
  db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(
    hashPassword(pw),
    "admin@streammarket.com"
  );
  fs.writeFileSync(f, pw, "utf8");
  console.log("Nouveau mot de passe admin enregistré dans data/admin-password.txt");
})();

function uid(prefix) {
  return prefix + "-" + crypto.randomBytes(6).toString("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2) return false;
  const hash = crypto.scryptSync(password, parts[0], 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(parts[1], "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapService(row) {
  if (!row) return null;
  let includes = [];
  try {
    includes = JSON.parse(row.includes_json || "[]");
  } catch (e) {
    includes = [];
  }
  return {
    id: row.id,
    sellerId: row.seller_id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: row.price,
    duration: row.duration,
    image: row.image,
    color: row.color,
    status: row.status,
    rating: row.rating,
    ordersCount: row.orders_count,
    includes: includes,
    conditions: row.conditions,
    info: row.info
  };
}

function mapOrder(row) {
  return {
    id: row.id,
    userId: row.user_id,
    customer: JSON.parse(row.customer_json),
    items: JSON.parse(row.items_json),
    total: row.total,
    status: row.status,
    payment: JSON.parse(row.payment_json),
    createdAt: row.created_at,
    deliveryNote: row.delivery_note || "",
    hasProof: !!row.proof_path
  };
}

function seed() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get();
  if (count.n > 0) return;
  const legal =
    "Offre commercialisée légalement via des canaux autorisés. Aucun identifiant, mot de passe ou compte partagé n'est fourni.";
  const adminId = "usr-admin";
  const clientId = "usr-client";
  const sellerId = "usr-seller";
  const insU = db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const now = new Date().toISOString();
  insU.run(adminId, "Administrateur", "admin@streammarket.com", hashPassword("admin123"), "ADMIN", "active", now);
  insU.run(clientId, "Awa Diallo", "client@streammarket.com", hashPassword("client123"), "CLIENT", "active", now);
  insU.run(sellerId, "Koffi Mensah", "vendeur@streammarket.com", hashPassword("seller123"), "SELLER", "active", now);

  const services = [
    ["svc-netflix", "Création de compte Netflix", "Streaming", "Ouverture d'un compte Netflix pour un client. Activation officielle, sans mot de passe stocké ici.", 4500, "tv", "#b81d24", 4.8, 0, ["Compte Netflix créé pour le client", "Suivi de la commande"], "Un compte par client. Aucun mot de passe Netflix n'est enregistré."]
  ];
  const insS = db.prepare(
    `INSERT INTO services (id, seller_id, name, category, description, price, duration, image, color, status, rating, orders_count, includes_json, conditions, info)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'active', ?, ?, ?, ?, ?)`
  );
  services.forEach(function (s) {
    insS.run(s[0], sellerId, s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], JSON.stringify(s[9]), s[10], legal);
  });
}

seed();

function ensureNetflixOnly() {
  db.prepare("UPDATE services SET status = 'inactive' WHERE id != 'svc-netflix'").run();
  const existing = db.prepare("SELECT id FROM services WHERE id = 'svc-netflix'").get();
  const owner = db.prepare("SELECT id FROM users WHERE role IN ('ADMIN', 'SELLER') ORDER BY role LIMIT 1").get();
  if (!existing && owner) {
    db.prepare(
      `INSERT INTO services (id, seller_id, name, category, description, price, duration, image, color, status, rating, orders_count, includes_json, conditions, info)
       VALUES ('svc-netflix', ?, 'Création de compte Netflix', 'Streaming', ?, 4500, 1, 'tv', '#b81d24', 'active', 4.8, 0, ?, ?, ?)`
    ).run(
      owner.id,
      "Ouverture d'un compte Netflix pour un client. Activation officielle, sans mot de passe stocké ici.",
      JSON.stringify(["Compte Netflix créé pour le client", "Suivi de la commande"]),
      "Un compte par client. Aucun mot de passe Netflix n'est enregistré.",
      "Offre commercialisée légalement via des canaux autorisés. Aucun identifiant, mot de passe ou compte partagé n'est fourni."
    );
  } else if (existing) {
    db.prepare(
      "UPDATE services SET name = 'Création de compte Netflix', category = 'Streaming', status = 'active', description = ? WHERE id = 'svc-netflix'"
    ).run("Ouverture d'un compte Netflix pour un client. Activation officielle, sans mot de passe stocké ici.");
  }
}
ensureNetflixOnly();

function notify(userId, message) {
  db.prepare(
    "INSERT INTO notifications (id, user_id, message, read_flag, created_at) VALUES (?, ?, ?, 0, ?)"
  ).run(uid("ntf"), userId, message, new Date().toISOString());
}

function looksLikeSecret(text) {
  const t = String(text || "").toLowerCase();
  return /\b(password|mot de passe|mdp|passwd)\b/.test(t);
}

const loginHits = new Map();
function tooManyLogins(req) {
  const ip = String(req.socket.remoteAddress || "x");
  const now = Date.now();
  const arr = (loginHits.get(ip) || []).filter(function (t) { return now - t < 60000; });
  arr.push(now);
  loginHits.set(ip, arr);
  return arr.length > 12;
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "")
    .split(";")
    .forEach(function (part) {
      const i = part.indexOf("=");
      if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
  return out;
}

function currentUser(req) {
  const token = parseCookies(req).sm_sid;
  if (!token) return null;
  const sess = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!sess || sess.expires_at < Date.now()) return null;
  return db.prepare("SELECT * FROM users WHERE id = ?").get(sess.user_id);
}

function createSession(userId, resHeaders) {
  const token = crypto.randomBytes(24).toString("hex");
  const expires = Date.now() + SESSION_DAYS * 86400000;
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires);
  resHeaders.push(
    "Set-Cookie: sm_sid=" +
      token +
      "; HttpOnly; Path=/; SameSite=Lax; Max-Age=" +
      SESSION_DAYS * 86400 +
      (IN_PROD ? "; Secure" : "")
  );
}

function clearSession(req, resHeaders) {
  const token = parseCookies(req).sm_sid;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  resHeaders.push("Set-Cookie: sm_sid=; HttpOnly; Path=/; Max-Age=0");
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let raw = "";
    req.on("data", function (c) {
      raw += c;
      if (raw.length > 2.5e6) reject(new Error("payload"));
    });
    req.on("end", function () {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function send(res, status, body, extraHeaders) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function cookieFromExtra(extra) {
  const line = extra[0] || "";
  return line.replace(/^Set-Cookie:\s*/i, "");
}

function priceForDuration(base, months) {
  return Math.round(base * (DURATION_FACTORS[months] || months));
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function findOrCreateGuest(name, phone) {
  const digits = normalizePhone(phone);
  if (digits.length < 8) return null;
  const email = "tel-" + digits + "@guest.local";
  let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) {
    const id = uid("usr");
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, 'CLIENT', 'active', ?)"
    ).run(id, name, email, hashPassword(crypto.randomBytes(16).toString("hex")), new Date().toISOString());
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  } else if (name && user.name !== name) {
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id);
    user.name = name;
  }
  return user;
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    send(res, 401, { error: "Connexion requise." });
    return null;
  }
  if (user.status !== "active") {
    send(res, 403, { error: "Compte désactivé." });
    return null;
  }
  return user;
}

function requireRoles(user, res, roles) {
  if (!roles.includes(user.role)) {
    send(res, 403, { error: "Accès refusé." });
    return false;
  }
  return true;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

async function handleApi(req, res, url) {
  const method = req.method;
  const p = url.pathname;
  const extra = [];

  if (method === "GET" && p === "/api/health") {
    return send(res, 200, { ok: true });
  }

  if (method === "GET" && p === "/api/shop") {
    return send(res, 200, { shop: readShop() });
  }

  if (method === "PUT" && p === "/api/shop") {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["ADMIN"])) return;
    const b = await readBody(req);
    const next = Object.assign({}, readShop(), {
      name: String(b.name || DEFAULT_SHOP.name).trim().slice(0, 80),
      owner: String(b.owner || "").trim().slice(0, 80),
      city: String(b.city || "").trim().slice(0, 80),
      whatsapp: String(b.whatsapp || "").replace(/[^\d+]/g, "").slice(0, 20),
      momoMtn: String(b.momoMtn || "").trim().slice(0, 30),
      momoMoov: String(b.momoMoov || "").trim().slice(0, 30),
      headline: String(b.headline || DEFAULT_SHOP.headline).trim().slice(0, 160),
      tagline: String(b.tagline || DEFAULT_SHOP.tagline).trim().slice(0, 400),
      rule: String(b.rule || DEFAULT_SHOP.rule).trim().slice(0, 300)
    });
    writeShop(next);
    return send(res, 200, { shop: next });
  }

  if (method === "GET" && p === "/api/me") {
    return send(res, 200, { user: publicUser(currentUser(req)) });
  }

  if (method === "POST" && p === "/api/register") {
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = body.role === "SELLER" ? "SELLER" : "CLIENT";
    if (!name || !email || password.length < 6) {
      return send(res, 400, { error: "Nom, email et mot de passe (6+ caractères) requis." });
    }
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
      return send(res, 409, { error: "Un compte existe déjà avec cet email." });
    }
    const id = uid("usr");
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)"
    ).run(id, name, email, hashPassword(password), role, new Date().toISOString());
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    createSession(id, extra);
    return send(res, 201, { user: publicUser(user) }, { "Set-Cookie": cookieFromExtra(extra) });
  }

  if (method === "POST" && p === "/api/login") {
    if (tooManyLogins(req)) return send(res, 429, { error: "Trop de tentatives. Réessayez dans une minute." });
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return send(res, 401, { error: "Email ou mot de passe incorrect." });
    }
    if (user.status !== "active") return send(res, 403, { error: "Ce compte est désactivé." });
    createSession(user.id, extra);
    return send(res, 200, { user: publicUser(user) }, { "Set-Cookie": cookieFromExtra(extra) });
  }

  if (method === "PATCH" && p === "/api/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (name.length < 2) return send(res, 400, { error: "Nom trop court." });
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id);
    return send(res, 200, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) });
  }

  if (method === "PATCH" && p === "/api/me/password") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    if (!verifyPassword(String(body.current || ""), user.password_hash)) {
      return send(res, 401, { error: "Mot de passe actuel incorrect." });
    }
    if (String(body.next || "").length < 6) return send(res, 400, { error: "Nouveau mot de passe trop court." });
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(body.next), user.id);
    return send(res, 200, { ok: true });
  }

  if (method === "GET" && p === "/api/notifications") {
    const user = requireUser(req, res);
    if (!user) return;
    const rows = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").all(user.id);
    return send(res, 200, {
      notifications: rows.map(function (n) {
        return { id: n.id, message: n.message, read: !!n.read_flag, createdAt: n.created_at };
      })
    });
  }

  if (method === "POST" && p === "/api/notifications/read") {
    const user = requireUser(req, res);
    if (!user) return;
    db.prepare("UPDATE notifications SET read_flag = 1 WHERE user_id = ?").run(user.id);
    return send(res, 200, { ok: true });
  }

  if (method === "GET" && p === "/api/seller/stats") {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["SELLER", "ADMIN"])) return;
    const sellerId = user.role === "ADMIN" ? user.id : user.id;
    const mine = db.prepare("SELECT * FROM services WHERE seller_id = ?").all(user.id).map(mapService);
    const ids = mine.map(function (s) { return s.id; });
    const orders = db.prepare("SELECT * FROM orders").all().map(mapOrder);
    let related = 0;
    let revenue = 0;
    orders.forEach(function (o) {
      const hit = o.items.some(function (it) { return ids.indexOf(it.serviceId) !== -1; });
      if (hit && o.status !== "cancelled") {
        related += 1;
        revenue += o.total;
      }
    });
    return send(res, 200, {
      offers: mine.length,
      orders: related,
      revenue: revenue,
      active: mine.filter(function (s) { return s.status === "active"; }).length
    });
  }

  if (method === "POST" && p === "/api/logout") {
    clearSession(req, extra);
    return send(res, 200, { ok: true }, { "Set-Cookie": cookieFromExtra(extra) });
  }

  if (method === "GET" && p === "/api/services") {
    const rows = db.prepare("SELECT * FROM services ORDER BY orders_count DESC").all();
    return send(res, 200, { services: rows.map(mapService) });
  }

  if (method === "GET" && p.startsWith("/api/services/") && p.split("/").length === 4) {
    const id = decodeURIComponent(p.split("/")[3]);
    const row = db.prepare("SELECT * FROM services WHERE id = ?").get(id);
    if (!row) return send(res, 404, { error: "Offre introuvable." });
    return send(res, 200, { service: mapService(row) });
  }

  if (method === "GET" && p === "/api/orders") {
    const user = requireUser(req, res);
    if (!user) return;
    const rows =
      user.role === "ADMIN"
        ? db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all()
        : db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
    return send(res, 200, { orders: rows.map(mapOrder) });
  }

  if (method === "POST" && p === "/api/orders") {
    const body = await readBody(req);
    let user = currentUser(req);
    const itemsIn = Array.isArray(body.items) ? body.items : [];
    if (!itemsIn.length) return send(res, 400, { error: "Panier vide." });
    const customer = {
      name: String((body.customer && body.customer.name) || (user && user.name) || "").trim(),
      email: String((body.customer && body.customer.email) || (user && user.email) || "").trim(),
      phone: String((body.customer && body.customer.phone) || "").trim(),
      city: String((body.customer && body.customer.city) || "").trim()
    };
    if (!customer.name || normalizePhone(customer.phone).length < 8) {
      return send(res, 400, { error: "Nom et numéro WhatsApp (8 chiffres minimum) obligatoires." });
    }
    if (!user) {
      user = findOrCreateGuest(customer.name, customer.phone);
      if (!user) return send(res, 400, { error: "Numéro de téléphone invalide." });
    }
    if (!customer.email) customer.email = user.email;
    const methodPay = (body.payment && body.payment.method) || "momo";
    if (!["momo", "card", "manual"].includes(methodPay)) {
      return send(res, 400, { error: "Méthode de paiement invalide." });
    }
    if (body.cardNumber || body.cvv || body.pan) {
      return send(res, 400, { error: "Ne transmettez jamais de numéro de carte." });
    }
    const items = [];
    let total = 0;
    for (let i = 0; i < itemsIn.length; i++) {
      const it = itemsIn[i];
      const svc = db.prepare("SELECT * FROM services WHERE id = ? AND status = 'active'").get(it.serviceId);
      if (!svc) return send(res, 400, { error: "Une offre n'est plus disponible." });
      const months = Number(it.months);
      const qty = Math.max(1, Number(it.quantity) || 1);
      if (![1, 3, 6, 12].includes(months)) return send(res, 400, { error: "Durée invalide." });
      const unit = priceForDuration(svc.price, months);
      items.push({ serviceId: svc.id, name: svc.name, months: months, quantity: qty, unitPrice: unit });
      total += unit * qty;
    }
    const id = "CMD-" + Date.now().toString(36).toUpperCase();
    const status = methodPay === "manual" ? "pending" : "paid";
    const payment = { method: methodPay, provider: body.payment.provider || null, simulated: true };
    db.prepare(
      "INSERT INTO orders (id, user_id, customer_json, items_json, total, status, payment_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, user.id, JSON.stringify(customer), JSON.stringify(items), total, status, JSON.stringify(payment), new Date().toISOString());
    items.forEach(function (it) {
      db.prepare("UPDATE services SET orders_count = orders_count + ? WHERE id = ?").run(it.quantity, it.serviceId);
    });
    const order = mapOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id));
    notify(user.id, "Commande " + id + " créée (" + (status === "paid" ? "payée" : "en attente") + ").");
    const admin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    if (admin && admin.id !== user.id) {
      notify(admin.id, "Nouvelle commande " + id + " — " + customer.name + " (" + customer.phone + ") — " + items[0].name);
    }
    return send(res, 201, { order: order });
  }

  if (method === "POST" && p === "/api/admin/services") {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["ADMIN", "SELLER"])) return;
    await readBody(req);
    return send(res, 400, { error: "Une seule offre : la création de compte Netflix. Modifiez son prix au lieu d'en ajouter une autre." });
  }

  if ((method === "PUT" || method === "PATCH") && p.startsWith("/api/admin/services/")) {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["ADMIN", "SELLER"])) return;
    const id = decodeURIComponent(p.split("/")[4]);
    const existing = db.prepare("SELECT * FROM services WHERE id = ?").get(id);
    if (!existing) return send(res, 404, { error: "Service introuvable." });
    if (user.role === "SELLER" && existing.seller_id !== user.id) return send(res, 403, { error: "Accès refusé." });
    const b = await readBody(req);
    if (id !== "svc-netflix" && (b.status == null || b.status === "active")) {
      return send(res, 400, { error: "Seule la création de compte Netflix peut rester active." });
    }
    const next = {
      name: b.name != null ? String(b.name).trim() : existing.name,
      category: b.category != null ? String(b.category) : existing.category,
      description: b.description != null ? String(b.description).trim() : existing.description,
      price: b.price != null ? Number(b.price) : existing.price,
      duration: b.duration != null ? Number(b.duration) : existing.duration,
      image: b.image != null ? String(b.image) : existing.image,
      status: b.status != null ? String(b.status) : existing.status
    };
    db.prepare(
      "UPDATE services SET name=?, category=?, description=?, price=?, duration=?, image=?, status=? WHERE id=?"
    ).run(next.name, next.category, next.description, next.price, next.duration, next.image, next.status, id);
    return send(res, 200, { service: mapService(db.prepare("SELECT * FROM services WHERE id = ?").get(id)) });
  }

  if (method === "DELETE" && p.startsWith("/api/admin/services/")) {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["ADMIN", "SELLER"])) return;
    const id = decodeURIComponent(p.split("/")[4]);
    const existing = db.prepare("SELECT * FROM services WHERE id = ?").get(id);
    if (!existing) return send(res, 404, { error: "Service introuvable." });
    if (user.role === "SELLER" && existing.seller_id !== user.id) return send(res, 403, { error: "Accès refusé." });
    if (id === "svc-netflix") return send(res, 400, { error: "L'offre Netflix ne peut pas être supprimée." });
    db.prepare("DELETE FROM services WHERE id = ?").run(id);
    return send(res, 200, { ok: true });
  }

  if (method === "PATCH" && p.startsWith("/api/admin/orders/")) {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["ADMIN"])) return;
    const id = decodeURIComponent(p.split("/")[4]);
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    if (!order) return send(res, 404, { error: "Commande introuvable." });
    const body = await readBody(req);
    const allowed = ["pending", "paid", "processing", "done", "cancelled"];
    if (body.status && !allowed.includes(body.status)) return send(res, 400, { error: "Statut invalide." });
    const note = body.deliveryNote != null ? String(body.deliveryNote).trim() : order.delivery_note;
    if (looksLikeSecret(note)) {
      return send(res, 400, { error: "Le livrable ne peut pas contenir de mot de passe. Indiquez un lien d'activation ou une licence officielle." });
    }
    const status = body.status || order.status;
    db.prepare("UPDATE orders SET status = ?, delivery_note = ? WHERE id = ?").run(status, note || "", id);
    const labels = { pending: "en attente", paid: "payée", processing: "en traitement", done: "terminée", cancelled: "annulée" };
    notify(order.user_id, "Votre commande " + id + " est " + (labels[status] || status) + ".");
    if (status === "done" && note) notify(order.user_id, "Livrable disponible pour " + id + " (licence / activation officielle, sans mot de passe).");
    return send(res, 200, { order: mapOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id)) });
  }

  if (method === "GET" && p === "/api/admin/users") {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["ADMIN"])) return;
    const users = db.prepare("SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC").all();
    const orders = db.prepare("SELECT user_id, total, status FROM orders").all();
    const list = users.map(function (u) {
      const mine = orders.filter(function (o) { return o.user_id === u.id; });
      const spent = mine.filter(function (o) { return o.status !== "cancelled"; }).reduce(function (n, o) { return n + o.total; }, 0);
      return Object.assign(publicUser(u), { ordersCount: mine.length, spent: spent });
    });
    return send(res, 200, { users: list });
  }

  if (method === "PATCH" && p.startsWith("/api/admin/users/")) {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["ADMIN"])) return;
    const id = decodeURIComponent(p.split("/")[4]);
    if (id === user.id) return send(res, 400, { error: "Vous ne pouvez pas désactiver votre propre compte." });
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!target) return send(res, 404, { error: "Utilisateur introuvable." });
    const body = await readBody(req);
    const status = body.status === "disabled" ? "disabled" : "active";
    db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, id);
    return send(res, 200, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
  }

  if (method === "GET" && p === "/api/admin/stats") {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["ADMIN"])) return;
    const orders = db.prepare("SELECT * FROM orders").all().map(mapOrder);
    const users = db.prepare("SELECT * FROM users").all().map(publicUser);
    const services = db.prepare("SELECT * FROM services").all().map(mapService);
    const revenue = orders.filter(function (o) { return o.status !== "cancelled"; }).reduce(function (n, o) { return n + o.total; }, 0);
    return send(res, 200, {
      revenue: revenue,
      ordersCount: orders.length,
      clientsCount: users.filter(function (u) { return u.role === "CLIENT"; }).length,
      activeServices: services.filter(function (s) { return s.status === "active"; }).length,
      recentOrders: orders.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 5),
      popularServices: services.slice().sort(function (a, b) { return b.ordersCount - a.ordersCount; }).slice(0, 5),
      lastClients: users.filter(function (u) { return u.role === "CLIENT"; }).slice(0, 5)
    });
  }

  if (method === "POST" && p.match(/^\/api\/orders\/[^/]+\/proof$/)) {
    const id = decodeURIComponent(p.split("/")[3]);
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    if (!order) return send(res, 404, { error: "Commande introuvable." });
    const body = await readBody(req);
    const dataUrl = String(body.image || "");
    const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return send(res, 400, { error: "Envoyez une photo JPG, PNG ou WebP." });
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > 1800000) return send(res, 400, { error: "Image trop lourde (max 1,8 Mo)." });
    const ext = m[2] === "jpeg" ? "jpg" : m[2];
    const safe = id.replace(/[^a-zA-Z0-9-]/g, "") + "." + ext;
    fs.writeFileSync(path.join(UPLOADS, safe), buf);
    db.prepare("UPDATE orders SET proof_path = ? WHERE id = ?").run(safe, id);
    const admin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    if (admin) notify(admin.id, "Preuve de paiement reçue pour " + id);
    return send(res, 200, { ok: true, order: mapOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id)) });
  }

  if (method === "GET" && p.startsWith("/api/proof/")) {
    const user = requireUser(req, res);
    if (!user || !requireRoles(user, res, ["ADMIN"])) return;
    const id = decodeURIComponent(p.slice("/api/proof/".length));
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    if (!order || !order.proof_path) return send(res, 404, { error: "Pas de preuve." });
    const file = path.join(UPLOADS, path.basename(order.proof_path));
    if (!fs.existsSync(file)) return send(res, 404, { error: "Fichier introuvable." });
    const ext = path.extname(file).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.writeHead(200, { "Content-Type": mime });
    return res.end(fs.readFileSync(file));
  }

  send(res, 404, { error: "Route API inconnue." });
}

function serveStatic(req, res, url) {
  let file = decodeURIComponent(url.pathname);
  if (file === "/") file = "/index.html";
  const full = path.normalize(path.join(ROOT, file));
  if (!full.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(full, function (err, data) {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    send(res, 500, { error: "Erreur serveur." });
  }
});

server.listen(PORT, "0.0.0.0", function () {
  console.log("Kiffer Entreprise: http://127.0.0.1:" + PORT);
});
