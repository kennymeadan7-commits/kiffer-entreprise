document.addEventListener("DOMContentLoaded", async function () {
  await SM.boot();
  SM.initLayout();
  renderCart();
});

function renderCart() {
  const root = document.getElementById("cart-root");
  if (!root) return;
  const items = SM.cart();
  if (!items.length) {
    root.innerHTML =
      '<div class="empty"><h3>Votre panier est vide</h3><p>Explorez le catalogue pour ajouter une offre légale.</p>' +
      '<a class="btn btn-primary" href="services.html">Continuer les achats</a></div>';
    return;
  }
  let rows = "";
  items.forEach(function (item) {
    const s = SM.services().find(function (x) { return x.id === item.serviceId; });
    if (!s) return;
    const unit = SM.priceForDuration(s.price, item.months);
    const sub = unit * item.quantity;
    rows +=
      "<tr>" +
      "<td><strong>" + s.name + "</strong><div class='muted'>" + s.category + "</div></td>" +
      "<td>" + item.months + " mois</td>" +
      "<td>" + SM.formatMoney(unit) + "</td>" +
      '<td><div class="qty"><button data-qty="' + item.id + '" data-d="-1">-</button>' +
      item.quantity +
      '<button data-qty="' + item.id + '" data-d="1">+</button></div></td>' +
      "<td>" + SM.formatMoney(sub) + "</td>" +
      '<td><button class="btn btn-ghost btn-sm" data-del="' + item.id + '">Supprimer</button></td></tr>';
  });
  root.innerHTML =
    '<div class="table-wrap"><table><thead><tr><th>Service</th><th>Durée</th><th>Prix unitaire</th><th>Quantité</th><th>Sous-total</th><th></th></tr></thead><tbody>' +
    rows +
    "</tbody></table></div>" +
    '<div class="grid cart-layout" style="margin-top:18px">' +
    '<div><a class="btn btn-ghost" href="services.html">Continuer les achats</a></div>' +
    '<div class="card"><div class="muted">Total</div><div class="price" style="font-size:28px">' +
    SM.formatMoney(SM.cartTotal()) +
    '</div><p class="notice">Votre commande est sécurisée.</p>' +
    '<a class="btn btn-primary btn-block" href="checkout.html">Passer au paiement</a></div></div>';

  root.querySelectorAll("[data-del]").forEach(function (btn) {
    btn.onclick = function () {
      SM.confirm("Supprimer cet article ?", "Cette action retire l'offre du panier.", function () {
        SM.saveCart(
          SM.cart().filter(function (i) {
            return i.id !== btn.getAttribute("data-del");
          })
        );
        SM.toast("Article retiré du panier.");
        renderCart();
      });
    };
  });
  root.querySelectorAll("[data-qty]").forEach(function (btn) {
    btn.onclick = function () {
      const id = btn.getAttribute("data-qty");
      const d = Number(btn.getAttribute("data-d"));
      const list = SM.cart().map(function (i) {
        if (i.id === id) i.quantity = Math.max(1, i.quantity + d);
        return i;
      });
      SM.saveCart(list);
      renderCart();
    };
  });
}
