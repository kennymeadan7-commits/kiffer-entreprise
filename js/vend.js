document.addEventListener("DOMContentLoaded", async function () {
  await SM.boot();
  SM.initLayout({ dashboard: true, page: "vend.html" });
  const user = SM.requireAuth();
  if (!user) return;
  if (user.role !== "ADMIN") {
    location.href = "dashboard.html";
    return;
  }
  const root = document.getElementById("vend-root");
  const flow = ["pending", "paid", "processing", "done"];

  function load() {
    return SM.api("/orders").then(function (d) {
      SM.cache.orders = d.orders || [];
      paint();
    });
  }

  function actionLabel(status) {
    return {
      pending: "Marquer payée",
      paid: "Mettre en traitement",
      processing: "Terminer",
      done: "Terminée",
      cancelled: "Annulée"
    }[status] || "Suivant";
  }

  function paint() {
    const list = SM.orders().filter(function (o) {
      return o.status !== "cancelled";
    });
    root.innerHTML =
      "<h2>Commandes du jour</h2><p class='muted'>Gros boutons pour le téléphone. Tirez pour actualiser — ou attendez 20 s.</p>" +
      (list.length
        ? list
            .map(function (o) {
              const c = o.customer || {};
              const nextI = flow.indexOf(o.status);
              const canNext = nextI >= 0 && nextI < flow.length - 1;
              return (
                '<article class="card vend-card">' +
                "<div><strong>" +
                o.id +
                '</strong> <span class="badge ' +
                SM.statusClass(o.status) +
                '">' +
                SM.statusLabel(o.status) +
                "</span></div>" +
                "<p>" +
                o.items.map(function (i) {
                  return i.name + " · " + i.months + " mois";
                }).join(", ") +
                "</p>" +
                '<p class="price">' +
                SM.formatMoney(o.total) +
                "</p>" +
                "<p>" +
                (c.name || "") +
                " · " +
                (c.phone || "") +
                "</p>" +
                (o.hasProof
                  ? '<p><img class="proof-thumb" src="/api/proof/' +
                    encodeURIComponent(o.id) +
                    '" alt="Preuve"></p>'
                  : "<p class='muted'>Pas encore de capture MoMo</p>") +
                (canNext
                  ? '<button class="btn btn-primary btn-block btn-lg" data-next="' +
                    o.id +
                    '">' +
                    actionLabel(o.status) +
                    "</button>"
                  : "") +
                "</article>"
              );
            })
            .join("")
        : '<div class="empty">Aucune commande.</div>');
    root.querySelectorAll("[data-next]").forEach(function (b) {
      b.onclick = function () {
        const o = SM.orders().find(function (x) {
          return x.id === b.getAttribute("data-next");
        });
        const i = flow.indexOf(o.status);
        const nextStatus = flow[i + 1];
        if (nextStatus === "done") {
          const note = window.prompt("Livrable officiel (lien d'activation). Pas de mot de passe :") || "";
          SM.api("/admin/orders/" + o.id, { method: "PATCH", body: { status: "done", deliveryNote: note } })
            .then(load)
            .catch(function (e) {
              SM.toast(e.message, "error");
            });
          return;
        }
        SM.api("/admin/orders/" + o.id, { method: "PATCH", body: { status: nextStatus } })
          .then(load)
          .catch(function (e) {
            SM.toast(e.message, "error");
          });
      };
    });
  }

  load();
  setInterval(load, 20000);
});
