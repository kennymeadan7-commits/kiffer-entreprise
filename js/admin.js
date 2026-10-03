document.addEventListener("DOMContentLoaded", async function () {
  const page = location.pathname.split("/").pop() || "dashboard.html";
  await SM.boot();
  SM.initLayout({ dashboard: true, page: page });
  const user = SM.requireAuth();
  if (!user) return;

  if (page === "dashboard.html") {
    if (user.role === "ADMIN") renderAdminHome();
    else if (user.role === "SELLER") renderSellerHome(user);
    else renderClientHome(user);
  }
  if (page === "admin-services.html") {
    if (user.role !== "ADMIN" && user.role !== "SELLER") return (location.href = "dashboard.html");
    renderAdminServices();
  }
  if (page === "admin-orders.html") {
    if (user.role !== "ADMIN") return (location.href = "dashboard.html");
    renderAdminOrders();
  }
  if (page === "admin-users.html") {
    if (user.role !== "ADMIN") return (location.href = "dashboard.html");
    renderAdminUsers();
  }
  if (page === "admin-shop.html") {
    if (user.role !== "ADMIN") return (location.href = "dashboard.html");
    renderShopSettings();
  }
});

function renderClientHome(user) {
  const mine = SM.orders().filter(function (o) {
    return o.userId === user.id;
  });
  const done = mine.filter(function (o) { return o.status === "done"; }).length;
  const pending = mine.filter(function (o) { return o.status === "pending"; }).length;
  const spent = mine.filter(function (o) { return o.status !== "cancelled"; }).reduce(function (n, o) { return n + o.total; }, 0);
  const root = document.getElementById("dash-root");
  root.innerHTML =
    "Bonjour, <strong>" + user.name + "</strong>" +
    '<div class="kpi" style="margin:18px 0">' +
    kpi("Commandes", mine.length) +
    kpi("Commandes terminées", done) +
    kpi("Dépenses", SM.formatMoney(spent)) +
    kpi("En attente", pending) +
    "</div>" +
    '<div class="grid grid-3"><div class="card" style="grid-column:span 2"><h3>Dernières commandes</h3>' +
    (mine.length
      ? "<ul>" + mine.slice(0, 5).map(function (o) {
          return "<li>" + o.id + " · " + SM.statusLabel(o.status) + " · " + SM.formatMoney(o.total) + "</li>";
        }).join("") + "</ul>"
      : '<div class="empty">Pas encore de commande.</div>') +
    '</div><div class="card"><h3>Services populaires</h3>' +
    SM.services()
      .filter(function (s) { return s.status === "active"; })
      .sort(function (a, b) { return b.ordersCount - a.ordersCount; })
      .slice(0, 4)
      .map(function (s) { return "<p>" + s.name + "</p>"; })
      .join("") +
    '<a class="btn btn-primary" href="services.html">Explorer les services</a></div></div>';
}

function kpi(label, value) {
  return '<div class="card"><div class="label">' + label + '</div><div class="value">' + value + "</div></div>";
}

function renderSellerHome(user) {
  SM.api("/seller/stats").then(function (st) {
    const root = document.getElementById("dash-root");
    root.innerHTML =
      "Bonjour, <strong>" + user.name + "</strong>" +
      '<p class="muted">Espace vendeur — offres légales uniquement, sans partage de comptes.</p>' +
      '<div class="kpi" style="margin:18px 0">' +
      kpi("Offres", st.offers) +
      kpi("Actives", st.active) +
      kpi("Commandes liées", st.orders) +
      kpi("Volume", SM.formatMoney(st.revenue)) +
      "</div>" +
      '<a class="btn btn-primary" href="admin-services.html">Gérer mes offres</a>';
  }).catch(function (e) { SM.toast(e.message, "error"); });
}

function renderAdminHome() {
  SM.api("/admin/stats").then(function (stats) {
    const root = document.getElementById("dash-root");
    const clients = stats.lastClients || [];
    SM.cache.orders = stats.recentOrders || SM.orders();
    root.innerHTML =
      "<h2>Tableau de bord admin</h2>" +
      '<p class="muted">Données SQLite + sessions httpOnly. Les mots de passe sont hashés.</p>' +
      '<div class="kpi">' +
      kpi("Chiffre d'affaires", SM.formatMoney(stats.revenue)) +
      kpi("Commandes", stats.ordersCount) +
      kpi("Clients", stats.clientsCount) +
      kpi("Services actifs", stats.activeServices) +
      "</div>" +
      '<div class="card" style="margin:18px 0"><h3>Évolution (démo)</h3><canvas id="chart" height="120"></canvas></div>' +
      '<div class="grid grid-3">' +
      '<div class="card"><h3>Commandes récentes</h3>' +
      (stats.recentOrders.length
        ? "<ul>" + stats.recentOrders.map(function (o) { return "<li>" + o.id + " · " + SM.statusLabel(o.status) + "</li>"; }).join("") + "</ul>"
        : '<div class="empty">Aucune commande.</div>') +
      "</div><div class='card'><h3>Services populaires</h3>" +
      stats.popularServices.map(function (s) { return "<p>" + s.name + " · " + s.ordersCount + "</p>"; }).join("") +
      "</div><div class='card'><h3>Derniers clients</h3>" +
      (clients.length ? clients.map(function (c) { return "<p>" + c.name + "</p>"; }).join("") : '<div class="empty">Aucun client.</div>') +
      "</div></div>";
    drawChart();
  }).catch(function (e) {
    SM.toast(e.message, "error");
  });
}

function recentOrders() {
  const list = SM.orders().slice(0, 5);
  if (!list.length) return '<div class="empty">Aucune commande.</div>';
  return "<ul>" + list.map(function (o) { return "<li>" + o.id + " · " + SM.statusLabel(o.status) + "</li>"; }).join("") + "</ul>";
}
function popularSvc() {
  return SM.services()
    .slice()
    .sort(function (a, b) { return b.ordersCount - a.ordersCount; })
    .slice(0, 5)
    .map(function (s) { return "<p>" + s.name + " · " + s.ordersCount + "</p>"; })
    .join("");
}
function lastClients(clients) {
  return clients
    .slice()
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
    .slice(0, 5)
    .map(function (c) { return "<p>" + c.name + "</p>"; })
    .join("") || '<div class="empty">Aucun client.</div>';
}

function drawChart() {
  const c = document.getElementById("chart");
  if (!c) return;
  const ctx = c.getContext("2d");
  c.width = c.parentElement.clientWidth - 20;
  const vals = [2, 4, 3, 6, 5, SM.orders().length || 1, Math.max(2, SM.orders().length)];
  const max = Math.max.apply(null, vals);
  const w = c.width / vals.length;
  ctx.clearRect(0, 0, c.width, c.height);
  vals.forEach(function (v, i) {
    const h = (v / max) * (c.height - 20);
    ctx.fillStyle = i % 2 ? "#7c3aed" : "#5347ff";
    ctx.fillRect(i * w + 8, c.height - h, w - 16, h);
  });
}

function renderAdminServices() {
  const root = document.getElementById("admin-services-root");
  function paint() {
    const me = SM.currentUser();
    const list = SM.services().filter(function (s) {
      return me.role === "ADMIN" || s.sellerId === me.id;
    });
    const rows = list
      .map(function (s) {
        return (
          "<tr><td>" + s.name + "</td><td>" + s.category + "</td><td>" + SM.formatMoney(s.price) + "</td><td>" + s.duration + " mois</td>" +
          '<td><span class="badge ' + (s.status === "active" ? "badge-active" : "badge-inactive") + '">' + (s.status === "active" ? "Actif" : "Inactif") + "</span></td>" +
          '<td><button class="btn btn-ghost btn-sm" data-edit="' + s.id + '">Modifier</button> ' +
          '<button class="btn btn-ghost btn-sm" data-toggle="' + s.id + '">' + (s.status === "active" ? "Désactiver" : "Activer") + "</button> " +
          '<button class="btn btn-danger btn-sm" data-del="' + s.id + '">Supprimer</button></td></tr>'
        );
      })
      .join("");
    root.innerHTML =
      '<div class="page-head"><h2>Services</h2><button class="btn btn-primary" id="add-svc">Ajouter un service</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Nom</th><th>Catégorie</th><th>Prix</th><th>Durée</th><th>Statut</th><th></th></tr></thead><tbody>' +
      rows +
      "</tbody></table></div>";
    document.getElementById("add-svc").onclick = function () { formModal(null); };
    root.querySelectorAll("[data-edit]").forEach(function (b) {
      b.onclick = function () {
        formModal(SM.services().find(function (s) { return s.id === b.getAttribute("data-edit"); }));
      };
    });
    root.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.onclick = function () {
        SM.api("/admin/services/" + b.getAttribute("data-toggle"), {
          method: "PATCH",
          body: { status: SM.services().find(function (s) { return s.id === b.getAttribute("data-toggle"); }).status === "active" ? "inactive" : "active" }
        }).then(function () {
          return SM.api("/services");
        }).then(function (sv) {
          SM.cache.services = sv.services;
          SM.toast("Statut du service mis à jour.");
          paint();
        }).catch(function (e) { SM.toast(e.message, "error"); });
      };
    });
    root.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () {
        SM.confirm("Supprimer ce service ?", "Cette action est irréversible dans le prototype.", function () {
          SM.api("/admin/services/" + b.getAttribute("data-del"), { method: "DELETE" })
            .then(function () { return SM.api("/services"); })
            .then(function (sv) {
              SM.cache.services = sv.services;
              SM.toast("Service supprimé.");
              paint();
            })
            .catch(function (e) { SM.toast(e.message, "error"); });
        });
      };
    });
  }

  function formModal(svc) {
    const back = SM.showModal(
      "<h3>" + (svc ? "Modifier" : "Ajouter") + " un service</h3>" +
        '<input class="input" id="f-name" placeholder="Nom" value="' + (svc ? svc.name : "") + '">' +
        '<select class="select" id="f-cat" style="margin:8px 0"></select>' +
        '<textarea class="input" id="f-desc" rows="3" placeholder="Description">' + (svc ? svc.description : "") + "</textarea>" +
        '<input class="input" id="f-price" type="number" placeholder="Prix" value="' + (svc ? svc.price : "") + '" style="margin:8px 0">' +
        '<input class="input" id="f-dur" type="number" placeholder="Durée (mois)" value="' + (svc ? svc.duration : 1) + '">' +
        '<input class="input" id="f-img" placeholder="Clé icône (play, music, cloud...)" value="' + (svc ? svc.image : "cube") + '" style="margin:8px 0">' +
        '<select class="select" id="f-status"><option value="active">Actif</option><option value="inactive">Inactif</option></select>' +
        '<div style="margin-top:12px"><button class="btn btn-primary" id="f-save">Enregistrer</button></div>'
    );
    SM.CATEGORIES.forEach(function (c) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      if (svc && svc.category === c) o.selected = true;
      back.querySelector("#f-cat").appendChild(o);
    });
    if (svc) back.querySelector("#f-status").value = svc.status;
    back.querySelector("#f-save").onclick = function () {
      const payload = {
        name: back.querySelector("#f-name").value.trim(),
        category: back.querySelector("#f-cat").value,
        description: back.querySelector("#f-desc").value.trim(),
        price: Number(back.querySelector("#f-price").value),
        duration: Number(back.querySelector("#f-dur").value) || 1,
        image: back.querySelector("#f-img").value.trim() || "cube",
        status: back.querySelector("#f-status").value
      };
      if (!payload.name || !payload.price) {
        SM.toast("Nom et prix requis.", "error");
        return;
      }
      const req = svc
        ? SM.api("/admin/services/" + svc.id, { method: "PUT", body: payload })
        : SM.api("/admin/services", { method: "POST", body: payload });
      req.then(function () { return SM.api("/services"); })
        .then(function (sv) {
          SM.cache.services = sv.services;
          SM.toast(svc ? "Service modifié." : "Service ajouté.");
          back.remove();
          paint();
        })
        .catch(function (e) { SM.toast(e.message, "error"); });
    };
  }
  paint();
}

function renderAdminOrders() {
  const root = document.getElementById("admin-orders-root");
  const flow = ["pending", "paid", "processing", "done"];
  function paint() {
    const rows = SM.orders()
      .map(function (o) {
        return (
          "<tr><td>" + o.id + "</td><td>" + o.items.map(function (i) { return i.name; }).join(", ") +
          "</td><td>" + SM.formatMoney(o.total) + "</td><td>" + SM.formatDate(o.createdAt) +
          '</td><td><span class="badge ' + SM.statusClass(o.status) + '">' + SM.statusLabel(o.status) + "</span></td>" +
          "<td>" + (o.hasProof ? "Oui" : "—") + "</td>" +
          '<td><button class="btn btn-ghost btn-sm" data-next="' + o.id + '">Statut suivant</button> ' +
          '<button class="btn btn-danger btn-sm" data-cancel="' + o.id + '">Annuler</button></td></tr>'
        );
      })
      .join("");
    root.innerHTML =
      "<h2>Commandes</h2><p class='muted'><a href='vend.html'>Ouvrir l'écran téléphone</a></p>" +
      (SM.orders().length
        ? '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Services</th><th>Montant</th><th>Date</th><th>Statut</th><th>Preuve</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="empty">Aucune commande pour le moment.</div>');
    root.querySelectorAll("[data-next]").forEach(function (b) {
      b.onclick = function () {
        const o = SM.orders().find(function (x) { return x.id === b.getAttribute("data-next"); });
        if (!o || o.status === "cancelled") return;
        const i = flow.indexOf(o.status);
        if (i < 0 || i >= flow.length - 1) return;
        const nextStatus = flow[i + 1];
        if (nextStatus === "done") {
          const back = SM.showModal(
            "<h3>Terminer la commande</h3><p class='muted'>Indiquez un livrable légal : lien d'activation, code licence officiel. Pas de mot de passe.</p>" +
              '<textarea class="input" id="deliv" rows="4" placeholder="Ex. Lien de souscription officielle ou clé de licence éditeur"></textarea>' +
              '<div style="margin-top:12px"><button class="btn btn-primary" id="go-done">Confirmer</button></div>'
          );
          back.querySelector("#go-done").onclick = function () {
            const note = back.querySelector("#deliv").value;
            SM.api("/admin/orders/" + o.id, { method: "PATCH", body: { status: "done", deliveryNote: note } })
              .then(function () { return SM.api("/orders"); })
              .then(function (od) {
                SM.cache.orders = od.orders;
                SM.toast("Votre commande est terminée.");
                back.remove();
                paint();
              })
              .catch(function (e) { SM.toast(e.message, "error"); });
          };
          return;
        }
        SM.api("/admin/orders/" + o.id, { method: "PATCH", body: { status: nextStatus } })
          .then(function () { return SM.api("/orders"); })
          .then(function (od) {
            SM.cache.orders = od.orders;
            if (nextStatus === "processing") SM.toast("Votre commande est maintenant en traitement.");
            if (nextStatus === "done") SM.toast("Votre commande est terminée.");
            paint();
          })
          .catch(function (e) { SM.toast(e.message, "error"); });
      };
    });
    root.querySelectorAll("[data-cancel]").forEach(function (b) {
      b.onclick = function () {
        SM.confirm("Annuler cette commande ?", "Le statut passera à Annulée.", function () {
          SM.api("/admin/orders/" + b.getAttribute("data-cancel"), { method: "PATCH", body: { status: "cancelled" } })
            .then(function () { return SM.api("/orders"); })
            .then(function (od) {
              SM.cache.orders = od.orders;
              SM.toast("Commande annulée.");
              paint();
            })
            .catch(function (e) { SM.toast(e.message, "error"); });
        });
      };
    });
  }
  paint();
}

function renderAdminUsers() {
  const root = document.getElementById("admin-users-root");
  function paint(list) {
    const rows = list
      .filter(function (u) { return u.role === "CLIENT" || u.role === "SELLER"; })
      .map(function (u) {
        return (
          "<tr><td>" + u.name + "</td><td>" + u.email + "</td><td>" + SM.formatDate(u.createdAt) + "</td><td>" + (u.ordersCount || 0) +
          "</td><td>" + SM.formatMoney(u.spent || 0) + '</td><td><span class="badge ' + (u.status === "active" ? "badge-active" : "badge-inactive") + '">' +
          (u.status === "active" ? "Actif" : "Désactivé") + "</span></td>" +
          '<td><button class="btn btn-ghost btn-sm" data-view="' + u.id + '">Voir</button> ' +
          '<button class="btn btn-ghost btn-sm" data-dis="' + u.id + '">' + (u.status === "active" ? "Désactiver" : "Activer") + "</button></td></tr>"
        );
      })
      .join("");
    root.innerHTML =
      "<h2>Clients & vendeurs</h2>" +
      '<div class="table-wrap"><table><thead><tr><th>Nom</th><th>Email</th><th>Inscription</th><th>Commandes</th><th>Total dépensé</th><th>Statut</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7">Aucun utilisateur</td></tr>') +
      "</tbody></table></div>";
    root.querySelectorAll("[data-view]").forEach(function (b) {
      b.onclick = function () {
        const u = list.find(function (x) { return x.id === b.getAttribute("data-view"); });
        SM.showModal(
          "<h3>" + u.name + "</h3><p>" + u.email + " · " + u.role + "</p><p>" + (u.ordersCount || 0) + " commandes · " + SM.formatMoney(u.spent || 0) +
            "</p><p class='muted'>Les mots de passe hashés ne sont jamais renvoyés par l'API.</p>" +
            '<button class="btn btn-ghost" onclick="this.closest(\'.modal-backdrop\').remove()">Fermer</button>'
        );
      };
    });
    root.querySelectorAll("[data-dis]").forEach(function (b) {
      b.onclick = function () {
        const u = list.find(function (x) { return x.id === b.getAttribute("data-dis"); });
        const next = u.status === "active" ? "disabled" : "active";
        SM.api("/admin/users/" + u.id, { method: "PATCH", body: { status: next } })
          .then(function () { return SM.api("/admin/users"); })
          .then(function (d) {
            SM.toast("Statut mis à jour.");
            paint(d.users);
          })
          .catch(function (e) { SM.toast(e.message, "error"); });
      };
    });
  }
  SM.api("/admin/users").then(function (d) { paint(d.users); }).catch(function (e) { SM.toast(e.message, "error"); });
}

function renderShopSettings() {
  const root = document.getElementById("shop-admin-root");
  if (!root) return;
  const s = SM.shop();
  function field(id, label, val, hint) {
    return "<label>" + label + '</label><input class="input" id="' + id + '" value="' + String(val || "").replace(/"/g, "&quot;") + '">' + (hint ? "<p class='muted'>" + hint + "</p>" : "");
  }
  root.innerHTML =
    "<h2>Ma boutique</h2><p class='muted'>À remplir pour ton frère : nom, WhatsApp, numéros MoMo. Les clients voient ça tout de suite.</p>" +
    '<div class="card">' +
    field("sh-name", "Nom de la boutique", s.name) +
    field("sh-owner", "Nom du vendeur", s.owner) +
    field("sh-city", "Ville", s.city) +
    field("sh-wa", "WhatsApp (indicatif + numéro, ex. 22901XXXXXXX)", s.whatsapp, "Sans espaces. Sert au bouton WhatsApp.") +
    field("sh-mtn", "Numéro MTN MoMo", s.momoMtn) +
    field("sh-moov", "Numéro Moov Money", s.momoMoov) +
    "<label>Accroche</label><input class='input' id='sh-head' value=\"" + String(s.headline || "").replace(/"/g, "&quot;") + '">' +
    "<label>Sous-titre</label><textarea class='input' id='sh-tag' rows='3'>" + (s.tagline || "") + "</textarea>" +
    "<p class='legal-box'>Rappel : ne jamais demander ni coller un mot de passe Netflix / Spotify / Adobe dans une commande.</p>" +
    '<button class="btn btn-primary" id="sh-save">Enregistrer</button></div>';
  document.getElementById("sh-save").onclick = function () {
    SM.api("/shop", {
      method: "PUT",
      body: {
        name: document.getElementById("sh-name").value,
        owner: document.getElementById("sh-owner").value,
        city: document.getElementById("sh-city").value,
        whatsapp: document.getElementById("sh-wa").value,
        momoMtn: document.getElementById("sh-mtn").value,
        momoMoov: document.getElementById("sh-moov").value,
        headline: document.getElementById("sh-head").value,
        tagline: document.getElementById("sh-tag").value
      }
    })
      .then(function (d) {
        SM.cache.shop = d.shop;
        SM.toast("Boutique mise à jour.");
      })
      .catch(function (e) {
        SM.toast(e.message, "error");
      });
  };
}
