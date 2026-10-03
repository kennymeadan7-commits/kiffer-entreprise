document.addEventListener("DOMContentLoaded", async function () {
  const page = (location.pathname.split("/").pop() || "");
  await SM.boot();
  SM.initLayout({ dashboard: page === "dashboard.html" || page.indexOf("admin") === 0, page: page || "orders.html" });
  const user = SM.currentUser();
  if (!user && page === "orders.html") {
    document.getElementById("orders-root").innerHTML =
      '<div class="empty"><p>Connectez-vous pour voir vos commandes.</p><a class="btn btn-primary" href="login.html?next=orders.html">Connexion</a></div>';
    return;
  }
  renderOrders();
});

function userOrders(user) {
  return SM.orders();
}

function renderOrders() {
  const root = document.getElementById("orders-root");
  if (!root) return;
  const user = SM.currentUser();
  const list = userOrders(user);
  if (!list.length) {
    root.innerHTML = '<div class="empty"><h3>Aucune commande</h3><p>Vos achats apparaîtront ici.</p><a class="btn btn-primary" href="services.html">Explorer les services</a></div>';
    return;
  }
  root.innerHTML =
    '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Service</th><th>Durée</th><th>Montant</th><th>Date</th><th>Statut</th><th>Action</th></tr></thead><tbody>' +
    list
      .map(function (o) {
        const first = o.items[0];
        return (
          "<tr><td>" +
          o.id +
          "</td><td>" +
          o.items.map(function (i) { return i.name; }).join(", ") +
          "</td><td>" +
          (first ? first.months + " mois" : "-") +
          "</td><td>" +
          SM.formatMoney(o.total) +
          "</td><td>" +
          SM.formatDate(o.createdAt) +
          '</td><td><span class="badge ' +
          SM.statusClass(o.status) +
          '">' +
          SM.statusLabel(o.status) +
          '</span></td><td><button class="btn btn-ghost btn-sm" data-view="' +
          o.id +
          '">Détails</button></td></tr>'
        );
      })
      .join("") +
    "</tbody></table></div>";
  root.querySelectorAll("[data-view]").forEach(function (btn) {
    btn.onclick = function () {
      const o = SM.orders().find(function (x) { return x.id === btn.getAttribute("data-view"); });
      if (!o) return;
      SM.showModal(
        "<h3>Commande " +
          o.id +
          "</h3><p>Statut : <span class='badge " +
          SM.statusClass(o.status) +
          "'>" +
          SM.statusLabel(o.status) +
          "</span></p>" +
          o.items
            .map(function (i) {
              return "<p>" + i.name + " — " + i.months + " mois × " + i.quantity + " — " + SM.formatMoney(i.unitPrice * i.quantity) + "</p>";
            })
            .join("") +
          "<p>Total " +
          SM.formatMoney(o.total) +
          "</p><p class='muted'>Paiement : " +
          (o.payment && o.payment.method) +
          (o.payment && o.payment.simulated ? " (simulé)" : "") +
          "</p>" +
          (o.deliveryNote
            ? "<div class='legal-box'><strong>Livrable officiel</strong><p>" + o.deliveryNote.replace(/</g, "") + "</p><p class='muted'>Aucun mot de passe n'est communiqué.</p></div>"
            : "") +
          '<button class="btn btn-ghost" data-print>Imprimer le reçu</button> ' +
          '<button class="btn btn-ghost" onclick="this.closest(\'.modal-backdrop\').remove()">Fermer</button>'
      );
      const modal = document.querySelector(".modal-backdrop");
      const printBtn = modal && modal.querySelector("[data-print]");
      if (printBtn) {
        printBtn.onclick = function () {
          const w = window.open("", "_blank");
          w.document.write(
            "<html><head><title>Reçu " + o.id + "</title></head><body>" +
              "<h1>" + (SM.shop().name || "Kiffer Entreprise") + "</h1><p>Reçu " + o.id + "</p><p>" + SM.formatDate(o.createdAt) + "</p>" +
              o.items.map(function (i) {
                return "<p>" + i.name + " — " + i.months + " mois × " + i.quantity + " — " + SM.formatMoney(i.unitPrice * i.quantity) + "</p>";
              }).join("") +
              "<p><strong>Total " + SM.formatMoney(o.total) + "</strong></p>" +
              "<p>Paiement simulé. Offre commerciale légale. Aucun identifiant d'éditeur n'est imprimé.</p>" +
              "</body></html>"
          );
          w.document.close();
          w.print();
        };
      }
    };
  });
}
