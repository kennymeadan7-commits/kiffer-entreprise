document.addEventListener("DOMContentLoaded", async function () {
  await SM.boot();
  SM.initLayout();

  const grid = document.getElementById("services-grid");
  if (grid) renderCatalog();

  const detail = document.getElementById("service-detail");
  if (detail) renderDetail();

  const popular = document.getElementById("popular-home");
  if (popular) renderHomeCategories();
  applyShopHome();
});

function applyShopHome() {
  const shop = SM.shop();
  if (!shop) return;
  const h = document.getElementById("shop-headline");
  const l = document.getElementById("shop-lead");
  const r = document.getElementById("shop-rule");
  const k = document.getElementById("shop-kicker");
  if (h && shop.headline) h.textContent = shop.headline;
  if (l && shop.tagline) l.textContent = shop.tagline;
  if (r && shop.rule) r.textContent = shop.rule;
  if (k && shop.owner) k.textContent = shop.owner + (shop.city ? " · " + shop.city : "");
  const wa = document.getElementById("shop-wa");
  const link = SM.waLink("Bonjour, je voudrais un abonnement.");
  if (wa && link) {
    wa.href = link;
    wa.style.display = "inline-flex";
    wa.textContent = "WhatsApp";
  }
}

function getFilters() {
  return {
    q: (document.getElementById("q") && document.getElementById("q").value) || "",
    cat: (document.getElementById("cat") && document.getElementById("cat").value) || "",
    max: (document.getElementById("max") && document.getElementById("max").value) || "",
    sort: (document.getElementById("sort") && document.getElementById("sort").value) || "pop"
  };
}

function filteredServices() {
  const f = getFilters();
  let list = SM.services().filter(function (s) {
    return s.status === "active";
  });
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(function (s) {
      return (s.name + " " + s.description + " " + s.category).toLowerCase().indexOf(q) !== -1;
    });
  }
  if (f.cat) list = list.filter(function (s) { return s.category === f.cat; });
  if (f.max) list = list.filter(function (s) { return s.price <= Number(f.max); });
  if (f.sort === "pop") list.sort(function (a, b) { return b.ordersCount - a.ordersCount; });
  if (f.sort === "price-asc") list.sort(function (a, b) { return a.price - b.price; });
  if (f.sort === "price-desc") list.sort(function (a, b) { return b.price - a.price; });
  return list;
}

function serviceCard(s) {
  return (
    '<article class="card card-media">' +
    SM.coverHtml(s) +
    '<div class="card-body">' +
    "<h3>" + s.name + "</h3>" +
    '<div class="muted">' + s.category + " · ★ " + s.rating + " · " + s.ordersCount + " commandes</div>" +
    "<p class='excerpt'>" + s.description + "</p>" +
    '<div class="price">À partir de ' + SM.formatMoney(s.price) + " / " + s.duration + " mois</div>" +
    '<a class="btn btn-primary" href="service-details.html?id=' + encodeURIComponent(s.id) + '">Voir l\'offre</a>' +
    "</div></article>"
  );
}

function renderCatalog() {
  const cat = document.getElementById("cat");
  if (cat && !cat.dataset.ready) {
    cat.dataset.ready = "1";
    SM.CATEGORIES.forEach(function (c) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      cat.appendChild(o);
    });
    ["q", "cat", "max", "sort"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", function () { window._smPage = 1; renderCatalog(); });
      if (el) el.addEventListener("change", function () { window._smPage = 1; renderCatalog(); });
    });
    const params = new URLSearchParams(location.search);
    if (params.get("cat")) cat.value = params.get("cat");
    if (params.get("q") && document.getElementById("q")) document.getElementById("q").value = params.get("q");
  }
  const list = filteredServices();
  const grid = document.getElementById("services-grid");
  const pager = document.getElementById("services-pager");
  if (!list.length) {
    grid.innerHTML = '<div class="empty"><p>Aucun service ne correspond à votre recherche.</p></div>';
    if (pager) pager.innerHTML = "";
    return;
  }
  const size = 6;
  if (typeof window._smPage !== "number") window._smPage = 1;
  const maxPage = Math.max(1, Math.ceil(list.length / size));
  if (window._smPage > maxPage) window._smPage = maxPage;
  const start = (window._smPage - 1) * size;
  const slice = list.slice(start, start + size);
  grid.innerHTML = slice.map(serviceCard).join("");
  if (pager) {
    pager.innerHTML =
      '<button class="btn btn-ghost btn-sm" id="pg-prev"' + (window._smPage <= 1 ? " disabled" : "") + ">Précédent</button>" +
      "<span class='muted'>Page " + window._smPage + " / " + maxPage + "</span>" +
      '<button class="btn btn-ghost btn-sm" id="pg-next"' + (window._smPage >= maxPage ? " disabled" : "") + ">Suivant</button>";
    const prev = document.getElementById("pg-prev");
    const next = document.getElementById("pg-next");
    if (prev) prev.onclick = function () { window._smPage -= 1; renderCatalog(); };
    if (next) next.onclick = function () { window._smPage += 1; renderCatalog(); };
  }
}

function renderHomeCategories() {
  const root = document.getElementById("popular-home");
  const list = SM.services().filter(function (s) { return s.status === "active"; });
  if (!list.length) {
    root.innerHTML = '<div class="empty">Aucune offre pour le moment.</div>';
    return;
  }
  root.innerHTML = list.map(serviceCard).join("");
}

function renderDetail() {
  const id = new URLSearchParams(location.search).get("id");
  const s = SM.services().find(function (x) { return x.id === id; });
  const root = document.getElementById("service-detail");
  if (!s) {
    root.innerHTML = '<div class="empty">Offre introuvable. <a href="services.html">Retour aux services</a></div>';
    return;
  }
  let months = 1;
  function price() {
    return SM.priceForDuration(s.price, months);
  }
  function paint() {
    root.innerHTML =
      '<div class="container">' +
      '<div class="breadcrumbs"><a href="index.html">Accueil</a><span>/</span><a href="services.html">Services</a><span>/</span><span>' + s.name + "</span></div>" +
      '<a class="btn btn-ghost btn-sm" href="services.html">← Retour</a>' +
      '<div class="grid offer-layout" style="margin-top:16px">' +
      '<article class="card card-media">' +
      SM.coverHtml(s, "hero") +
      '<div class="card-body">' +
      "<h1>" + s.name + "</h1>" +
      '<div class="muted">' + s.category + " · ★ " + s.rating + " · " + s.ordersCount + " commandes</div>" +
      "<p>" + s.description + "</p>" +
      "<h3>Ce qui est inclus</h3><ul>" + s.includes.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>" +
      "<h3>Conditions</h3><p>" + s.conditions + "</p>" +
      '<div class="legal-box"><strong>Informations importantes.</strong> ' + s.info + "</div>" +
      "<h3>Avis clients</h3>" +
      '<div class="card" style="box-shadow:none">« Offre claire, commande simple. » — Koffi</div>' +
      '<div class="card" style="box-shadow:none">« Le vendeur a bien précisé qu\'aucun mot de passe n\'était demandé. » — Marie</div>' +
      "</div></article>" +
      '<aside class="card"><h3>Choisir la durée</h3>' +
      '<div class="duration-pills" id="pills"></div>' +
      '<p class="price" id="dyn-price" style="font-size:28px;margin:16px 0">' + SM.formatMoney(price()) + "</p>" +
      '<button class="btn btn-primary btn-block" id="buy-now">Commander maintenant</button>' +
      '<button class="btn btn-ghost btn-block" id="add-cart" style="margin-top:8px">Ajouter au panier</button>' +
      '<p class="muted">Sans créer de compte : nom + WhatsApp. Aucun mot de passe Netflix.</p>' +
      "</aside></div></div>";
    const pills = document.getElementById("pills");
    [1, 3, 6, 12].forEach(function (m) {
      const b = document.createElement("button");
      b.className = "pill" + (m === months ? " active" : "");
      b.textContent = m + " mois · " + SM.formatMoney(SM.priceForDuration(s.price, m));
      b.onclick = function () {
        months = m;
        paint();
      };
      pills.appendChild(b);
    });
    document.getElementById("add-cart").onclick = function () {
      SM.addToCart(s.id, months, 1);
    };
    document.getElementById("buy-now").onclick = function () {
      SM.addToCart(s.id, months, 1);
      location.href = "checkout.html";
    };
  }
  paint();
}
