/* ============================================================
   Nails by MelyG — confirmar asistencia
   La clienta llega desde el SMS de recordatorio de Square
   (nailsbymelyg.com/confirmar.html). Con su teléfono y su correo
   (o nombre) ve sus próximas citas y confirma o cancela.
   Si no confirma 1 h antes, el Worker libera la cita.
   ============================================================ */
(function () {
  "use strict";
  var form = document.querySelector("[data-cf-form]");
  if (!form) return;
  var C = window.MELY_CONFIG, I = window.MELY_I18N;
  var t = function (es, en) { return I.t(es, en); };
  var out = document.querySelector("[data-cf-results]");
  var API = (C.apiBase || "").replace(/\/$/, "");
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "HTTP"); return j; }); });
  }
  function field(id, ok) { document.getElementById(id).closest(".field").classList.toggle("invalid", !ok); return ok; }

  function show(r) {
      if (!r.bookings.length) {
        out.innerHTML = '<p class="alert">' + t("No encontré citas próximas con esos datos. Revisa el teléfono y el correo, o ", "I couldn't find upcoming appointments with those details. Check your phone and email, or ") +
          '<a data-wa="hello" href="' + window.MELY_WA(t("Hola Mely, quiero confirmar mi cita.", "Hi Mely, I'd like to confirm my appointment.")) + '" target="_blank" rel="noopener">' + t("escríbeme por WhatsApp", "message me on WhatsApp") + "</a>.</p>";
        return;
      }
      out.innerHTML = r.bookings.map(function (b, i) {
        return '<article class="cf-card" data-i="' + i + '">' +
          '<p class="eyebrow">' + (b.confirmed ? t("✅ Confirmada", "✅ Confirmed") : t("Pendiente de confirmar", "Waiting for confirmation")) + "</p>" +
          "<h2>" + esc(b.date) + " <em>" + esc(b.time) + "</em></h2>" +
          '<p class="lead">' + esc(b.services.join(" + ")) + ' · 2727 N Mason Rd, Suite 301, Katy</p>' +
          '<div class="step-actions">' +
          (b.confirmed ? "" : '<button class="btn" type="button" data-answer="yes"><span>' + t("Sí, ahí estaré", "Yes, I'll be there") + "</span></button>") +
          '<button class="back-link" type="button" data-answer="no">' + t("No podré ir, cancelar", "I can't make it, cancel") + "</button></div>" +
          '<p class="note cf-msg"></p></article>';
      }).join("");
      out.querySelectorAll(".cf-card").forEach(function (card) {
        var b = r.bookings[+card.dataset.i];
        card.addEventListener("click", function (ev) {
          var btn = ev.target.closest("[data-answer]");
          if (!btn) return;
          var ans = btn.dataset.answer;
          if (ans === "no" && !window.confirm(t("¿Seguro que quieres cancelar tu cita? Si faltan menos de 24 h puede aplicarse el cargo de $35.", "Cancel your appointment? If it's less than 24 h away, the $35 fee may apply."))) return;
          card.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
          post("/confirm/answer", { token: b.token, answer: ans }).then(function (res) {
            var msg = card.querySelector(".cf-msg");
            if (res.status === "confirmed") { card.querySelector(".eyebrow").textContent = t("✅ Confirmada", "✅ Confirmed"); msg.textContent = t("¡Gracias! Te espero 💅", "Thank you! See you soon 💅"); btn.remove(); }
            else if (res.status === "cancelled") { card.querySelector(".eyebrow").textContent = t("Cancelada", "Cancelled"); msg.textContent = t("Tu cita quedó cancelada. Cuando quieras, reserva otra desde la web.", "Your appointment was cancelled. Book again anytime on the website."); card.querySelector(".step-actions").remove(); }
            else msg.textContent = t("Esta cita ya estaba cancelada.", "This appointment was already cancelled.");
            card.querySelectorAll("button").forEach(function (x) { x.disabled = false; });
          }).catch(function () {
            card.querySelector(".cf-msg").textContent = t("No se pudo guardar. Inténtalo de nuevo o escríbeme por WhatsApp.", "Couldn't save. Try again or message me on WhatsApp.");
            card.querySelectorAll("button").forEach(function (x) { x.disabled = false; });
          });
        });
      });
  }
  function failed() {
    out.innerHTML = '<p class="alert">' + t("No se pudo buscar ahora. Inténtalo de nuevo en un momento.", "Couldn't search right now. Please try again in a moment.") + "</p>";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var phone = document.getElementById("cf-phone").value, check = document.getElementById("cf-check").value.trim();
    var ok = field("cf-phone", phone.replace(/\D/g, "").length >= 10) & field("cf-check", check.length >= 2);
    if (!ok) return;
    if (!API) { out.innerHTML = '<p class="alert">' + t("La confirmación en línea no está disponible ahora. Escríbeme por WhatsApp.", "Online confirmation isn't available right now. Message me on WhatsApp.") + "</p>"; return; }
    out.innerHTML = '<p class="note">' + t("Buscando tu cita…", "Looking up your appointment…") + "</p>";
    post("/confirm/lookup", { phone: phone, check: check }).then(show).catch(failed);
  });

  // enlace directo del recordatorio (?t=…): la cita aparece sin escribir nada
  var token = new URLSearchParams(location.search).get("t");
  if (token && API) {
    out.innerHTML = '<p class="note">' + t("Abriendo tu cita…", "Opening your appointment…") + "</p>";
    post("/confirm/token", { token: token }).then(function (r) {
      if (r.cancelled) { out.innerHTML = '<p class="alert">' + t("Esta cita ya está cancelada. Cuando quieras, reserva otra desde la web.", "This appointment is already cancelled. Book again anytime on the website.") + "</p>"; return; }
      show(r);
      var first = out.querySelector(".cf-card"); if (first) first.scrollIntoView({ block: "center" });
    }).catch(function () {
      out.innerHTML = '<p class="alert">' + t("Este enlace ya caducó. Busca tu cita con tu teléfono y tu correo aquí arriba.", "This link has expired. Look up your appointment with your phone and email above.") + "</p>";
    });
  }
})();
