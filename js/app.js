/**
 * StreamMarket — noyau applicatif (prototype LocalStorage).
 * Cette authentification et ces paiements sont simulés, non adaptés à la production.
 */
(function (window) {
  const KEYS = {
    users: "sm_users",
    services: "sm_services",
    cart: "sm_cart",
    orders: "sm_orders",
    session: "sm_session",
    seeded: "sm_seeded_v2"
  };

  const DURATION_FACTORS = { 1: 1, 3: 2.7, 6: 5.1, 12: 9.6 };

  const CATEGORIES = [
    "Streaming",
    "Musique",
    "Stockage",
    "Productivité",
    "Design",
    "Logiciels"
  ];

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  const cache = { user: null, services: [], orders: [], users: [], stats: null, ready: false, notifications: [] };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function api(path, options) {
    options = options || {};
    const res = await fetch("/api" + path, {
      method: options.method || "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.error || "Erreur serveur (" + res.status + ")");
    return data;
  }

  async function boot() {
    try {
      const me = await api("/me");
      cache.user = me.user;
      const sh = await api("/shop").catch(function () { return { shop: {} }; });
      cache.shop = sh.shop || {};
      const sv = await api("/services");
      cache.services = sv.services || [];
      if (cache.user) {
        const od = await api("/orders");
        cache.orders = od.orders || [];
        const nt = await api("/notifications").catch(function () { return { notifications: [] }; });
        cache.notifications = nt.notifications || [];
      } else {
        cache.orders = [];
        cache.notifications = [];
      }
      cache.ready = true;
    } catch (e) {
      cache.ready = false;
      toast("Démarrez le serveur : npm start dans le dossier streammarket", "error");
    }
    return cache.user;
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function priceForDuration(basePrice, months) {
    return Math.round(basePrice * (DURATION_FACTORS[months] || months));
  }

  function statusLabel(status) {
    return {
      pending: "En attente",
      paid: "Payée",
      processing: "En traitement",
      done: "Terminée",
      cancelled: "Annulée"
    }[status] || status;
  }

  function statusClass(status) {
    return {
      pending: "badge-pending",
      paid: "badge-paid",
      processing: "badge-processing",
      done: "badge-done",
      cancelled: "badge-cancelled"
    }[status] || "badge-inactive";
  }

  function demoServices() {
    const legal =
      "Offre commercialisée légalement via des canaux autorisés. Aucun identifiant, mot de passe ou compte partagé n'est fourni.";
    const base = [
      {
        id: "svc-stream",
        name: "Streaming Premium",
        category: "Streaming",
        description: "Accès à une offre streaming premium légale, livrée selon les conditions du vendeur vérifié.",
        price: 3500,
        duration: 1,
        image: "play",
        color: "#e50914",
        status: "active",
        rating: 4.8,
        ordersCount: 128,
        includes: ["Accès streaming HD", "Support client StreamMarket", "Renouvellement facilité"],
        conditions: "Service destiné à un usage personnel. Respectez les CGU de l'éditeur.",
        info: legal
      },
      {
        id: "svc-music",
        name: "Musique Premium",
        category: "Musique",
        description: "Abonnement musique en ligne sans publicité, proposé via une offre légale.",
        price: 2500,
        duration: 1,
        image: "music",
        color: "#1db954",
        status: "active",
        rating: 4.7,
        ordersCount: 96,
        includes: ["Écoute illimitée", "Mode hors-ligne selon l'offre", "Support"],
        conditions: "Usage individuel. Pas de revente de comptes.",
        info: legal
      },
      {
        id: "svc-design",
        name: "Design Pro",
        category: "Design",
        description: "Outils de création graphique pour particuliers et indépendants.",
        price: 5000,
        duration: 1,
        image: "pen",
        color: "#00c4cc",
        status: "active",
        rating: 4.6,
        ordersCount: 74,
        includes: ["Modèles premium", "Export haute qualité", "Assistance à l'activation"],
        conditions: "Licence selon l'éditeur. Pas de partage de session.",
        info: legal
      },
      {
        id: "svc-cloud",
        name: "Cloud Storage",
        category: "Stockage",
        description: "Espace de stockage cloud pour sauvegarder photos et documents.",
        price: 3000,
        duration: 1,
        image: "cloud",
        color: "#4285f4",
        status: "active",
        rating: 4.5,
        ordersCount: 61,
        includes: ["Stockage sécurisé", "Partage de fichiers", "Support"],
        conditions: "Capacité selon le forfait choisi.",
        info: legal
      },
      {
        id: "svc-prod",
        name: "Productivity Pro",
        category: "Productivité",
        description: "Suite bureautique et collaboration pour le travail quotidien.",
        price: 4500,
        duration: 1,
        image: "briefcase",
        color: "#d83b01",
        status: "active",
        rating: 4.9,
        ordersCount: 112,
        includes: ["Documents et tableurs", "Messagerie collaborative", "Support"],
        conditions: "Licence nominative lorsque requis par l'éditeur.",
        info: legal
      },
      {
        id: "svc-netflix",
        name: "Netflix",
        category: "Streaming",
        description: "Offre d'abonnement streaming Netflix commercialisée légalement (pas de comptes partagés).",
        price: 4500,
        duration: 1,
        image: "tv",
        color: "#b81d24",
        status: "active",
        rating: 4.8,
        ordersCount: 210,
        includes: ["Catalogue films & séries", "Profils selon l'offre", "Assistance commande"],
        conditions: "Marque citée à titre d'offre catalogue. StreamMarket n'est pas l'éditeur.",
        info: legal
      },
      {
        id: "svc-prime",
        name: "Prime Video",
        category: "Streaming",
        description: "Offre Prime Video proposée via un circuit commercial autorisé.",
        price: 3000,
        duration: 1,
        image: "film",
        color: "#00a8e1",
        status: "active",
        rating: 4.4,
        ordersCount: 88,
        includes: ["Streaming à la demande", "Support commande"],
        conditions: "Usage conforme aux règles Amazon Prime Video.",
        info: legal
      },
      {
        id: "svc-spotify",
        name: "Spotify",
        category: "Musique",
        description: "Abonnement Spotify Premium via une offre légale, sans identifiants revendus.",
        price: 2800,
        duration: 1,
        image: "headphones",
        color: "#1db954",
        status: "active",
        rating: 4.7,
        ordersCount: 154,
        includes: ["Sans publicité", "Qualité élevée"],
        conditions: "Compte personnel. Aucun mot de passe n'est demandé ni fourni par la plateforme.",
        info: legal
      },
      {
        id: "svc-canva",
        name: "Canva",
        category: "Design",
        description: "Canva Pro pour créer des visuels professionnels.",
        price: 4200,
        duration: 1,
        image: "palette",
        color: "#00c4cc",
        status: "active",
        rating: 4.6,
        ordersCount: 67,
        includes: ["Éléments Pro", "Brand Kit selon l'offre"],
        conditions: "Licence Canva applicable.",
        info: legal
      },
      {
        id: "svc-m365",
        name: "Microsoft 365",
        category: "Productivité",
        description: "Microsoft 365 (Word, Excel, PowerPoint, OneDrive) en offre légale.",
        price: 6500,
        duration: 1,
        image: "windows",
        color: "#0f6cbd",
        status: "active",
        rating: 4.9,
        ordersCount: 143,
        includes: ["Apps Office", "Stockage OneDrive selon plan"],
        conditions: "Licence Microsoft. Activation officielle uniquement.",
        info: legal
      },
      {
        id: "svc-gone",
        name: "Google One",
        category: "Stockage",
        description: "Forfait Google One pour étendre le stockage Drive, Gmail et Photos.",
        price: 2200,
        duration: 1,
        image: "google",
        color: "#4285f4",
        status: "active",
        rating: 4.5,
        ordersCount: 52,
        includes: ["Stockage cloud", "Sauvegarde"],
        conditions: "Compte Google personnel requis côté client, jamais collecté ici.",
        info: legal
      },
      {
        id: "svc-adobe",
        name: "Adobe Creative Cloud",
        category: "Logiciels",
        description: "Suite Creative Cloud (Photoshop, Illustrator, etc.) via abonnement légal.",
        price: 18000,
        duration: 1,
        image: "adobe",
        color: "#ff0000",
        status: "active",
        rating: 4.8,
        ordersCount: 39,
        includes: ["Apps Creative Cloud selon plan", "Mises à jour"],
        conditions: "Adobe ID du client. StreamMarket ne stocke aucun mot de passe Adobe.",
        info: legal
      }
    ];
    return base;
  }

  function seed() {}

  function users() {
    return cache.users;
  }
  function services() {
    return cache.services;
  }
  function cart() {
    return read(KEYS.cart, []);
  }
  function saveCart(list) {
    write(KEYS.cart, list);
    updateCartBadge();
  }
  function orders() {
    return cache.orders;
  }

  function currentUser() {
    return cache.user;
  }
  function requireAuth(role) {
    const user = currentUser();
    if (!user) {
      location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop());
      return null;
    }
    if (user.status !== "active") {
      toast("Compte désactivé. Contactez le support.", "error");
      logout();
      return null;
    }
    if (role && user.role !== role && !(role === "STAFF" && (user.role === "ADMIN" || user.role === "SELLER"))) {
      location.href = "dashboard.html";
      return null;
    }
    return user;
  }

  function logout() {
    api("/logout", { method: "POST" }).catch(function () {}).finally(function () {
      cache.user = null;
      location.href = "index.html";
    });
  }

  function cartCount() {
    return cart().reduce(function (n, i) {
      return n + (i.quantity || 1);
    }, 0);
  }

  function addToCart(serviceId, months, qty) {
    const svc = services().find(function (s) {
      return s.id === serviceId;
    });
    if (!svc || svc.status !== "active") {
      toast("Cette offre n'est plus disponible.", "error");
      return;
    }
    const list = cart();
    const existing = list.find(function (i) {
      return i.serviceId === serviceId && i.months === months;
    });
    if (existing) existing.quantity += qty || 1;
    else {
      list.push({
        id: uid("cart"),
        serviceId: serviceId,
        months: months,
        quantity: qty || 1
      });
    }
    saveCart(list);
    toast("Service ajouté au panier.");
  }

  function cartTotal() {
    return cart().reduce(function (sum, item) {
      const svc = services().find(function (s) {
        return s.id === item.serviceId;
      });
      if (!svc) return sum;
      return sum + priceForDuration(svc.price, item.months) * item.quantity;
    }, 0);
  }

  function toast(message, type) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    if (type === "error") el.style.background = "#991b1b";
    wrap.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 2800);
  }

  function confirmModal(title, text, onYes) {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML =
      '<div class="modal"><h3>' +
      title +
      "</h3><p class='muted'>" +
      text +
      '</p><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button class="btn btn-ghost" data-no>Annuler</button><button class="btn btn-danger" data-yes>Confirmer</button></div></div>';
    document.body.appendChild(back);
    back.querySelector("[data-no]").onclick = function () {
      back.remove();
    };
    back.querySelector("[data-yes]").onclick = function () {
      back.remove();
      onYes();
    };
  }

  function showModal(html) {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = '<div class="modal">' + html + "</div>";
    back.addEventListener("click", function (e) {
      if (e.target === back) back.remove();
    });
    document.body.appendChild(back);
    return back;
  }

  function showLoading(on) {
    let el = document.querySelector(".overlay");
    if (on) {
      if (!el) {
        el = document.createElement("div");
        el.className = "overlay";
        el.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(el);
      }
    } else if (el) el.remove();
  }

  function iconFor(key) {
    const map = {
      play: "▶",
      music: "♫",
      pen: "✎",
      cloud: "☁",
      briefcase: "▣",
      tv: "▢",
      film: "▶",
      headphones: "♫",
      palette: "◐",
      windows: "⊞",
      google: "G",
      adobe: "Ae",
      cube: "◆"
    };
    return map[key] || "◆";
  }

  function logoFor(service) {
    const catalog = {
      "svc-netflix": { src: "img/logos/netflix.svg", bg: "#0b0b0b" },
      "svc-prime": { src: "img/logos/primevideo.svg", bg: "#0f171e" },
      "svc-spotify": { src: "img/logos/spotify.svg", bg: "#1db954" },
      "svc-canva": { src: "img/logos/canva.svg", bg: "#00c4cc" },
      "svc-m365": { src: "img/logos/microsoft.svg", bg: "#0f6cbd" },
      "svc-gone": { src: "img/logos/google.svg", bg: "#f8fafc" },
      "svc-adobe": { src: "img/logos/adobecreativecloud.svg", bg: "#2c0614" },
      "svc-stream": { src: "img/logos/netflix.svg", bg: "#1a0507" },
      "svc-music": { src: "img/logos/spotify.svg", bg: "#0d2818" },
      "svc-design": { src: "img/logos/canva.svg", bg: "#043c40" },
      "svc-cloud": { src: "img/logos/icloud.svg", bg: "#1d4ed8" },
      "svc-prod": { src: "img/logos/microsoft.svg", bg: "#111827" }
    };
    if (service && catalog[service.id]) return catalog[service.id];
    const byCat = {
      Streaming: catalog["svc-stream"],
      Musique: catalog["svc-music"],
      Design: catalog["svc-design"],
      Stockage: catalog["svc-cloud"],
      Productivité: catalog["svc-prod"],
      Logiciels: catalog["svc-adobe"]
    };
    return (service && byCat[service.category]) || { src: "img/logos/microsoft.svg", bg: service && service.color ? service.color : "#5347ff" };
  }

  function coverFor(service) {
    return logoFor(service).src;
  }

  function coverHtml(service, variant) {
    const logo = logoFor(service);
    const alt = ((service && service.name) || "Offre") + " — logo";
    const extra = logo.src.indexOf("google.svg") !== -1 ? " logo-tile-light" : "";
    return (
      '<div class="logo-tile' +
      extra +
      (variant === "hero" ? " logo-hero" : "") +
      '" style="background:' +
      logo.bg +
      '"><img src="' +
      logo.src +
      '" alt="' +
      alt.replace(/"/g, "") +
      '"></div>'
    );
  }

  function updateCartBadge() {
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = cartCount();
    });
  }

  function navHtml() {
    const user = currentUser();
    const page = (location.pathname.split("/").pop() || "index.html") || "index.html";
    const shop = cache.shop || {};
    const shopName = shop.name || "Kiffer Entreprise";
    const mark = (shopName.charAt(0) || "K").toUpperCase();
    document.title = shopName;
    const links = [
      ["index.html", "Accueil"],
      ["services.html", "Services"],
      ["orders.html", "Mes commandes"]
    ];
    const nav = links
      .map(function (l) {
        return '<a href="' + l[0] + '" class="' + (page === l[0] ? "active" : "") + '">' + l[1] + "</a>";
      })
      .join("");
    const unread = (cache.notifications || []).filter(function (n) { return !n.read; }).length;
    const bell = user
      ? '<button class="btn btn-ghost btn-sm cart-link" id="notif-btn" type="button" aria-label="Notifications">🔔' +
        (unread ? '<span class="cart-count">' + unread + "</span>" : "") +
        "</button>"
      : "";
    const auth = user
      ? '<a class="btn btn-ghost btn-sm hide-sm" href="dashboard.html">' +
        user.name +
        "</a>" +
        '<button class="btn btn-ghost btn-sm hide-sm" id="logout-btn">Déconnexion</button>'
      : '<a class="btn btn-ghost btn-sm hide-sm" href="login.html">Connexion</a><a class="btn btn-primary btn-sm hide-sm" href="register.html">Créer un compte</a>';
    return (
      '<header class="navbar"><div class="container navbar-inner">' +
      '<a class="brand" href="index.html"><span class="brand-mark">' +
      mark +
      '</span><span class="brand-name">' +
      shopName +
      "</span></a>" +
      '<nav class="nav-links" id="nav-links">' +
      nav +
      (user
        ? '<a href="dashboard.html">Espace</a><a href="#" id="logout-link">Déconnexion</a>'
        : '<a href="login.html">Connexion</a><a class="only-sm" href="register.html">Créer un compte</a>') +
      "</nav>" +
      '<div class="nav-actions">' +
      '<button class="btn btn-ghost btn-sm menu-toggle" id="menu-toggle" aria-label="Menu">☰</button>' +
      bell +
      '<a class="btn btn-ghost btn-sm cart-link" href="cart.html">Panier<span class="cart-count" data-cart-count>' +
      cartCount() +
      "</span></a>" +
      auth +
      "</div></div></header>"
    );
  }

  function footerHtml() {
    const shop = cache.shop || {};
    const shopName = shop.name || "Kiffer Entreprise";
    const w = String(shop.whatsapp || "").replace(/\D/g, "");
    return (
      '<footer class="footer"><div class="container footer-inner">' +
      "<div><strong>" +
      shopName +
      "</strong><div class='muted'>" +
      (shop.owner ? "Comptes Netflix de " + shop.owner : "Création de comptes Netflix") +
      (shop.city ? " · " + shop.city : "") +
      "</div></div>" +
      "<div>" +
      (w ? '<a href="https://wa.me/' + w + '">WhatsApp</a> · ' : "") +
      "<a href='cgu.html'>CGU</a> · <a href='confidentialite.html'>Confidentialité</a><div class='muted'>" +
      (shop.rule || "Pas de mots de passe d'éditeurs.") +
      "</div></div>" +
      "</div></footer>"
    );
  }

  function sidebarHtml(active) {
    const user = currentUser();
    if (!user) return "";
    const clientLinks = [
      ["dashboard.html", "fa-gauge-high", "Tableau de bord"],
      ["orders.html", "fa-receipt", "Mes commandes"],
      ["profile.html", "", "Mon profil"],
      ["services.html", "fa-tv", "Netflix"],
      ["cart.html", "fa-bag-shopping", "Panier"]
    ];
    const adminLinks = [
      ["dashboard.html", "fa-chart-line", "Vue d'ensemble"],
      ["admin-services.html", "fa-tv", "Offre Netflix"],
      ["admin-orders.html", "fa-clipboard-list", "Commandes"],
      ["vend.html", "", "Téléphone"],
      ["admin-users.html", "fa-users", "Mes clients"],
      ["admin-shop.html", "", "Ma boutique"],
      ["profile.html", "", "Mon profil"]
    ];
    const links =
      user.role === "ADMIN"
        ? adminLinks
        : user.role === "SELLER"
          ? [
              ["dashboard.html", "", "Tableau de bord"],
              ["admin-services.html", "", "Mes offres"],
              ["profile.html", "", "Mon profil"],
              ["orders.html", "", "Mes commandes"],
              ["services.html", "", "Marketplace"]
            ]
          : clientLinks;
    return (
      '<aside class="sidebar" id="sidebar"><h4>' +
      (user.role === "ADMIN" ? "Administration" : user.role === "SELLER" ? "Espace vendeur" : "Espace client") +
      "</h4>" +
      links
        .map(function (l) {
          return (
            '<a href="' +
            l[0] +
            '" class="' +
            (active === l[0] ? "active" : "") +
            '">' +
            l[2] +
            "</a>"
          );
        })
        .join("") +
      "</aside>"
    );
  }

  function bindChrome() {
    const toggle = document.getElementById("menu-toggle");
    const links = document.getElementById("nav-links");
    if (toggle && links) {
      toggle.onclick = function () {
        links.classList.toggle("open");
        const side = document.getElementById("sidebar");
        if (side) side.classList.toggle("open");
      };
    }
    const bellBtn = document.getElementById("notif-btn");
    if (bellBtn) {
      bellBtn.onclick = function () {
        const list = cache.notifications || [];
        const html =
          "<h3>Notifications</h3>" +
          (list.length
            ? "<ul>" +
              list
                .slice(0, 12)
                .map(function (n) {
                  return "<li>" + n.message + "<div class='muted'>" + formatDate(n.createdAt) + "</div></li>";
                })
                .join("") +
              "</ul>"
            : "<p class='muted'>Aucune notification.</p>") +
          '<button class="btn btn-ghost btn-sm" id="mark-read">Tout marquer lu</button>';
        const back = showModal(html);
        const mk = back.querySelector("#mark-read");
        if (mk) {
          mk.onclick = function () {
            api("/notifications/read", { method: "POST" }).then(function () {
              cache.notifications.forEach(function (n) { n.read = true; });
              back.remove();
              toast("Notifications lues.");
            });
          };
        }
      };
    }
    const out = document.getElementById("logout-btn");
    if (out) out.onclick = logout;
    const outLink = document.getElementById("logout-link");
    if (outLink) {
      outLink.onclick = function (e) {
        e.preventDefault();
        logout();
      };
    }
  }

  function ensureFonts() {
    if (document.getElementById("sm-font-link")) return;
    const g = document.createElement("link");
    g.rel = "preconnect";
    g.href = "https://fonts.googleapis.com";
    document.head.appendChild(g);
    const s = document.createElement("link");
    s.rel = "preconnect";
    s.href = "https://fonts.gstatic.com";
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
    const f = document.createElement("link");
    f.id = "sm-font-link";
    f.rel = "stylesheet";
    f.href =
      "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap";
    document.head.appendChild(f);
  }

  function initLayout(options) {
    ensureFonts();
    seed();
    options = options || {};
    const mount = document.getElementById("app-shell");
    if (mount && !mount.dataset.ready) {
      mount.dataset.ready = "1";
      const inner = mount.innerHTML;
      const page = options.page || "";
      if (options.dashboard) {
        mount.innerHTML =
          navHtml() +
          '<div class="layout">' +
          sidebarHtml(page) +
          '<main class="content">' +
          inner +
          "</main></div>" +
          footerHtml();
      } else {
        mount.innerHTML = navHtml() + "<main>" + inner + "</main>" + footerHtml();
      }
    }
    bindChrome();
    updateCartBadge();
    bindAuthForms();
  }

  function bindAuthForms() {
    const login = document.getElementById("login-form");
    if (login) {
      login.addEventListener("submit", function (e) {
        e.preventDefault();
        const email = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("password").value;
        const err = document.getElementById("auth-error");
        showLoading(true);
        api("/login", { method: "POST", body: { email: email, password: password } })
          .then(function (data) {
            cache.user = data.user;
            toast("Connexion réussie.");
            const next = new URLSearchParams(location.search).get("next") || "dashboard.html";
            location.href = next;
          })
          .catch(function (ex) {
            if (err) err.textContent = ex.message;
            toast(ex.message, "error");
          })
          .finally(function () {
            showLoading(false);
          });
      });
    }
    const register = document.getElementById("register-form");
    if (register) {
      register.addEventListener("submit", function (e) {
        e.preventDefault();
        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("password").value;
        const roleEl = document.getElementById("role");
        const role = roleEl && roleEl.checked ? "SELLER" : "CLIENT";
        const err = document.getElementById("auth-error");
        if (password.length < 6) {
          if (err) err.textContent = "Mot de passe trop court (min. 6 caractères).";
          return;
        }
        showLoading(true);
        api("/register", { method: "POST", body: { name: name, email: email, password: password, role: role } })
          .then(function (data) {
            cache.user = data.user;
            toast("Compte créé. Mot de passe stocké de façon hashée côté serveur.");
            location.href = "dashboard.html";
          })
          .catch(function (ex) {
            if (err) err.textContent = ex.message;
            toast(ex.message, "error");
          })
          .finally(function () {
            showLoading(false);
          });
      });
    }
  }

  window.SM = {
    KEYS: KEYS,
    CATEGORIES: CATEGORIES,
    uid: uid,
    boot: boot,
    api: api,
    users: users,
    services: services,
    cart: cart,
    saveCart: saveCart,
    orders: orders,
    currentUser: currentUser,
    requireAuth: requireAuth,
    logout: logout,
    formatMoney: formatMoney,
    formatDate: formatDate,
    priceForDuration: priceForDuration,
    statusLabel: statusLabel,
    statusClass: statusClass,
    addToCart: addToCart,
    cartTotal: cartTotal,
    toast: toast,
    confirm: confirmModal,
    showModal: showModal,
    showLoading: showLoading,
    iconFor: iconFor,
    coverFor: coverFor,
    coverHtml: coverHtml,
    initLayout: initLayout,
    cache: cache,
    shop: function () { return cache.shop || {}; },
    waLink: function (text) {
      const n = String((cache.shop && cache.shop.whatsapp) || "").replace(/\D/g, "");
      if (!n) return "";
      return "https://wa.me/" + n + (text ? "?text=" + encodeURIComponent(text) : "");
    }
  };
})(window);
