document.addEventListener("DOMContentLoaded", async function () {
  await SM.boot();
  SM.initLayout();
  const root = document.getElementById("checkout-root");
  if (!root) return;
  if (!SM.cart().length) {
    root.innerHTML =
      '<div class="empty"><h3>Panier vide</h3><p><a class="btn btn-primary" href="service-details.html?id=svc-netflix">Commander Netflix</a></p></div>';
    return;
  }
  const user = SM.currentUser();
  const state = {
    step: 1,
    lastOrder: null,
    customer: {
      name: user ? user.name : "",
      email: user ? user.email : "",
      phone: "",
      city: ""
    },
    pay: { method: "momo", provider: "mtn" }
  };

  function recapHtml() {
    return (
      "<ul>" +
      SM.cart()
        .map(function (item) {
          const s = SM.services().find(function (x) {
            return x.id === item.serviceId;
          });
          if (!s) return "";
          return (
            "<li>" +
            s.name +
            " · " +
            item.months +
            " mois × " +
            item.quantity +
            " — " +
            SM.formatMoney(SM.priceForDuration(s.price, item.months) * item.quantity) +
            "</li>"
          );
        })
        .join("") +
      "</ul><p class='price'>Total : " +
      SM.formatMoney(SM.cartTotal()) +
      "</p>"
    );
  }

  function waMessage() {
    const shop = SM.shop();
    const o = state.lastOrder;
    const lines = SM.cart().length
      ? SM.cart().map(function (item) {
          const s = SM.services().find(function (x) {
            return x.id === item.serviceId;
          });
          return (s ? s.name : "Offre") + " — " + item.months + " mois";
        })
      : o && o.items
        ? o.items.map(function (i) {
            return i.name + " — " + i.months + " mois";
          })
        : ["Netflix"];
    return (
      "Bonjour " +
      (shop.name || "Kiffer Entreprise") +
      "\nJe commande : " +
      lines.join(", ") +
      "\nMontant : " +
      SM.formatMoney(o ? o.total : SM.cartTotal()) +
      "\nNom : " +
      state.customer.name +
      "\nWhatsApp : " +
      state.customer.phone +
      (o ? "\nCommande : " + o.id : "") +
      "\nJe paie au " +
      (shop.momoMtn || "65 48 12 84") +
      "."
    );
  }

  function render() {
    const steps =
      '<div class="steps steps-3">' +
      ["1. Vos coordonnées", "2. Paiement", "3. WhatsApp"]
        .map(function (label, i) {
          const n = i + 1;
          return '<div class="step' + (state.step === n ? " active" : "") + '">' + label + "</div>";
        })
        .join("") +
      "</div>";
    let body = "";
    if (state.step === 1) {
      body =
        '<div class="card"><h3>Commander sans compte</h3>' +
        "<p class='muted'>Nom et WhatsApp suffisent. Aucun mot de passe Netflix n'est demandé.</p>" +
        '<label>Votre nom</label><input class="input" id="c-name" value="' +
        escapeAttr(state.customer.name) +
        '" placeholder="Ex. Jean">' +
        '<label>Votre WhatsApp</label><input class="input" id="c-phone" inputmode="tel" value="' +
        escapeAttr(state.customer.phone) +
        '" placeholder="Ex. 65 48 12 84">' +
        recapHtml() +
        '<button class="btn btn-primary btn-block" id="next">Continuer</button></div>';
    }
    if (state.step === 2) {
      const shop = SM.shop();
      const momo =
        (shop.momoMtn ? "<p>MTN MoMo : <strong>" + shop.momoMtn + "</strong></p>" : "") +
        (shop.momoMoov ? "<p>Moov Money : <strong>" + shop.momoMoov + "</strong></p>" : "");
      body =
        '<div class="card"><h3>Paiement</h3>' +
        recapHtml() +
        (momo
          ? '<div class="legal-box">' + momo + "<p class='muted'>Envoyez le montant, puis confirmez. Le vendeur validera.</p></div>"
          : "") +
        '<label class="pay-option"><input type="radio" name="pay" value="momo" checked> J\'envoie le MoMo / Moov</label>' +
        '<label class="pay-option"><input type="radio" name="pay" value="manual"> Je paie après contact WhatsApp</label>' +
        '<p class="legal-box">Pas de carte bancaire. Pas de mot de passe Netflix.</p>' +
        '<div class="btn-row"><button class="btn btn-ghost" id="back">Retour</button><button class="btn btn-primary" id="next">Valider la commande</button></div></div>';
    }
    if (state.step === 3) {
      const wa = SM.waLink(waMessage());
      body =
        '<div class="card"><h3>C\'est noté</h3><p>Commande <strong>' +
        (state.lastOrder && state.lastOrder.id) +
        "</strong> enregistrée.</p><p class='muted'>Envoyez le message WhatsApp pour que le vendeur vous confirme plus vite.</p>" +
        '<label>Capture du paiement (optionnel)</label>' +
        '<input class="input" id="proof-file" type="file" accept="image/*">' +
        '<button class="btn btn-ghost btn-block" id="send-proof" type="button" style="margin:8px 0">Envoyer la capture</button>' +
        (wa
          ? '<a class="btn btn-primary btn-block" href="' + wa + '" target="_blank" rel="noopener">Envoyer sur WhatsApp</a>'
          : "") +
        '<a class="btn btn-ghost btn-block" href="index.html" style="margin-top:10px">Retour à l\'accueil</a></div>';
    }
    root.innerHTML = '<div class="container auth-wrap" style="max-width:560px">' + steps + body + "</div>";

    const next = document.getElementById("next");
    const back = document.getElementById("back");
    if (back)
      back.onclick = function () {
        state.step -= 1;
        render();
      };
    if (next) {
      next.onclick = function () {
        if (state.step === 1) {
          state.customer.name = document.getElementById("c-name").value.trim();
          state.customer.phone = document.getElementById("c-phone").value.trim();
          if (!state.customer.name || state.customer.phone.replace(/\D/g, "").length < 8) {
            SM.toast("Indiquez votre nom et un numéro WhatsApp.", "error");
            return;
          }
        }
        if (state.step === 2) {
          const pay = document.querySelector('input[name="pay"]:checked');
          state.pay.method = pay ? pay.value : "momo";
          state.pay.provider = "mtn";
          placeOrder();
          return;
        }
        state.step += 1;
        render();
      };
    }
    const proofBtn = document.getElementById("send-proof");
    if (proofBtn) {
      proofBtn.onclick = function () {
        const fileEl = document.getElementById("proof-file");
        const file = fileEl && fileEl.files[0];
        if (!file || !state.lastOrder) {
          SM.toast("Choisissez une photo du paiement.", "error");
          return;
        }
        const reader = new FileReader();
        reader.onload = function () {
          SM.showLoading(true);
          SM.api("/orders/" + state.lastOrder.id + "/proof", { method: "POST", body: { image: reader.result } })
            .then(function () {
              SM.showLoading(false);
              SM.toast("Capture envoyée au vendeur.");
            })
            .catch(function (e) {
              SM.showLoading(false);
              SM.toast(e.message, "error");
            });
        };
        reader.readAsDataURL(file);
      };
    }
  }

  function placeOrder() {
    SM.showLoading(true);
    const items = SM.cart().map(function (item) {
      return { serviceId: item.serviceId, months: item.months, quantity: item.quantity };
    });
    SM.api("/orders", {
      method: "POST",
      body: { customer: state.customer, items: items, payment: state.pay }
    })
      .then(function (data) {
        state.lastOrder = data.order;
        SM.saveCart([]);
        SM.showLoading(false);
        SM.toast("Commande créée.");
        state.step = 3;
        render();
      })
      .catch(function (ex) {
        SM.showLoading(false);
        SM.toast(ex.message, "error");
      });
  }

  function escapeAttr(v) {
    return String(v || "").replace(/"/g, "&quot;");
  }

  render();
});
