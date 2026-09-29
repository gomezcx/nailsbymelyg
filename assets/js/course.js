/* ============================================================
   Nails by MelyG — inscripción a cursos (conectada a Square)
   Curso privado: la alumna elige un día libre de la agenda de Mely
   (el ruso, dos días seguidos, 9:00–17:00). Se paga el 50 % con Square
   al inscribirse; el otro 50 % se cobra solo al terminar el curso.
   ?curso=russian|gelx  ·  ?demo=1 (sin cobrar)
   ============================================================ */
(function () {
  "use strict";
  var root = document.getElementById("cb-flow");
  if (!root) return;
  var C = window.MELY_CONFIG, I = window.MELY_I18N;
  var t = function (es, en) { return I.t(es, en); };
  var $ = function (s) { return document.querySelector(s); };
  var params = new URLSearchParams(location.search);
  var DEMO = params.has("demo");
  var API = (C.apiBase || "").replace(/\/$/, "");
  var TZ = C.timezone || "America/Chicago";

  var COURSES = {
    russian: { days: 2, es: ["Manicura rusa desde cero", "2 días · técnica completa con torno, preparación y esmaltado"], en: ["Russian manicure from scratch", "2 days · full e-file technique, prep and polish"] },
    gelx: { days: 1, es: ["Gel‑X", "1 día · aplicación, forma y retirada correcta"], en: ["Gel‑X", "1 day · application, shaping and safe removal"] }
  };
  var PRICE = (window.MELY_DATA && window.MELY_DATA.courses && window.MELY_DATA.courses.russian.price) || 550;
  var S = { course: COURSES[params.get("curso")] ? params.get("curso") : "russian", days: null, sel: [], busy: false };
  var card = null, cardReady = null;

  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "HTTP"); e.code = j.code; throw e; } return j; }); });
  }
  function alertMsg(m) { var a = $("#cb-alert"); a.textContent = m || ""; a.hidden = !m; if (m) a.scrollIntoView({ block: "center", behavior: "smooth" }); }
  function loc() { return I.lang === "en" ? "en-US" : "es-US"; }
  function fmt(iso, o) { var s = new Intl.DateTimeFormat(loc(), Object.assign({ timeZone: TZ }, o)).format(new Date(iso)); return s.charAt(0).toUpperCase() + s.slice(1); }
  function datesLabel(dates, long) {
    var o = long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" };
    return dates.map(function (d, i) { var s = fmt(d, o); return i ? s.charAt(0).toLowerCase() + s.slice(1) : s; }).join(t(" y ", " & "));
  }

  /* ---------- 1 · curso ---------- */
  function renderCourses() {
    $("#cb-courses").innerHTML = Object.keys(COURSES).map(function (k) {
      var c = COURSES[k][I.lang];
      return '<label class="svc"><input type="radio" name="course" value="' + k + '"' + (S.course === k ? " checked" : "") + "><b>" + c[0] + '</b><span class="p">$' + PRICE + '</span><span class="d">' + c[1] + "</span></label>";
    }).join("");
    hoursText();
    payText();
  }
  function need() { return COURSES[S.course].days; }
  function hoursText() {
    var n = need(), left = n - S.sel.length;
    $("#cb-hours").innerHTML = t("Horario de clase: de 9:00 a. m. a 5:00 p. m. (hora de Texas). Estos son los días que tengo libres completos. ", "Class hours: 9:00 a.m. to 5:00 p.m. (Texas time). These are the days I have fully free. ") +
      "<b>" + (n > 1
        ? (left > 0 ? t("Elige " + left + (left === 1 ? " día más." : " días, los que tú quieras."), "Choose " + left + (left === 1 ? " more day." : " days, whichever you like.")) : t("¡Listo! Ya elegiste tus 2 días.", "Done! You chose your 2 days."))
        : (left > 0 ? t("Elige tu día.", "Choose your day.") : t("¡Listo! Ya elegiste tu día.", "Done! You chose your day."))) + "</b>";
  }
  $("#cb-courses").addEventListener("change", function (e) { if (e.target.name === "course") { S.course = e.target.value; S.sel = []; loadDays(); hoursText(); payText(); } });

  /* ---------- 2 · fecha: la alumna elige sus días ---------- */
  function demoDays() {
    var out = [], d = new Date(); d.setDate(d.getDate() + 3);
    while (out.length < 8) {
      if (d.getDay() !== 0) { var a = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 14)); out.push({ date: a.toISOString().slice(0, 10), start: a.toISOString() }); }
      d.setDate(d.getDate() + (out.length % 3 ? 1 : 3));
    }
    return Promise.resolve({ days: out });
  }
  function loadDays() {
    var box = $("#cb-dates");
    box.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    var p = DEMO ? demoDays() : API ? post("/course/availability", { course: S.course }) : Promise.reject(new Error("no api"));
    var mine = S.course;
    p.then(function (r) {
      if (mine !== S.course) return;
      S.days = r.days || [];
      if (S.days.length < need()) {
        box.innerHTML = '<p class="note">' + t("Ahora mismo no tengo suficientes días libres completos. Escríbeme por WhatsApp y buscamos la fecha juntas.", "Right now I don't have enough fully free days. Message me on WhatsApp and we'll find a date together.") + "</p>";
        return;
      }
      renderDays();
    }).catch(function () {
      box.innerHTML = '<p class="note">' + t("No pude cargar mi agenda ahora. Recarga la página o escríbeme por WhatsApp.", "I couldn't load my schedule right now. Reload the page or message me on WhatsApp.") + "</p>";
    });
  }
  function renderDays() {
    var box = $("#cb-dates"), picked = S.sel.map(function (x) { return x.date; });
    box.innerHTML = "";
    S.days.forEach(function (d, i) {
      var b = document.createElement("button"), on = picked.indexOf(d.date) > -1;
      b.type = "button"; b.className = "slot cb-date"; b.dataset.i = i;
      b.innerHTML = '<span class="cb-wd">' + fmt(d.start, { weekday: "long" }) + "</span><b>" + fmt(d.start, { day: "numeric", month: "long" }) + "</b>" +
        (on && need() > 1 ? '<span class="cb-n">' + t("Día ", "Day ") + (S.sel.slice().sort(function (a, c) { return a.date < c.date ? -1 : 1; }).map(function (x) { return x.date; }).indexOf(d.date) + 1) + "</span>" : "");
      b.setAttribute("aria-pressed", on ? "true" : "false");
      box.appendChild(b);
    });
  }
  $("#cb-dates").addEventListener("click", function (e) {
    var b = e.target.closest(".cb-date"); if (!b) return;
    var d = S.days[+b.dataset.i], at = S.sel.map(function (x) { return x.date; }).indexOf(d.date);
    if (at > -1) S.sel.splice(at, 1);                       // tocar otra vez: se quita
    else if (need() === 1) S.sel = [d];                      // Gel-X: cambia de día
    else { if (S.sel.length >= need()) S.sel.shift(); S.sel.push(d); } // ruso: se queda con los 2 últimos
    renderDays(); hoursText(); payText();
    if (S.sel.length === need()) initCard();
  });
  function picked() { return S.sel.length === need() ? S.sel.slice().sort(function (a, c) { return a.date < c.date ? -1 : 1; }) : null; }

  /* ---------- 3 · datos + pago ---------- */
  function payText() {
    var half = PRICE / 2;
    $("#cb-pay").innerHTML = "<p><b>" + t("Hoy pagas $", "Today you pay $") + half + "</b> " + t("(50 %) para apartar tu fecha.", "(50 %) to hold your date.") + "</p>" +
      "<p>" + t("Los otros $", "The other $") + half + t(" se cobran solos a la misma tarjeta al terminar el curso.", " are charged automatically to the same card when the course ends.") + "</p>" +
      (picked() ? '<p class="cb-pick">' + COURSES[S.course][I.lang][0] + " · " + datesLabel(picked().map(function (x) { return x.start; }), true) + "</p>" : "");
    $("#cb-submit span").textContent = t("Pagar $", "Pay $") + half + t(" e inscribirme", " and enroll");
  }
  function initCard() {
    if (cardReady || DEMO || !C.squareAppId || !C.squareLocationId) {
      if (DEMO) $("#cb-card").innerHTML = '<p class="note" style="margin:0">' + t("Modo demostración: aquí va el formulario de tarjeta de Square.", "Demo mode: Square's card form goes here.") + "</p>";
      return;
    }
    var src = C.squareEnv === "sandbox" ? "https://sandbox.web.squarecdn.com/v1/square.js" : "https://web.squarecdn.com/v1/square.js";
    cardReady = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }).then(function () {
      return window.Square.payments(C.squareAppId, C.squareLocationId).card({ style: { input: { color: "#662E3A", fontSize: "16px" }, ".input-container": { borderColor: "#D9C3C0", borderRadius: "2px" }, ".input-container.is-focus": { borderColor: "#662E3A" } } });
    }).then(function (c) { card = c; return c.attach("#cb-card"); })
      .catch(function (e) { console.error(e); cardReady = null; alertMsg(t("No se pudo cargar el formulario de tarjeta. Recarga la página.", "The card form couldn't load. Please reload the page.")); });
  }
  if ("IntersectionObserver" in window) new IntersectionObserver(function (en, o) { if (en[0].isIntersecting) { initCard(); o.disconnect(); } }, { rootMargin: "300px" }).observe($("#cb-form"));

  function validate() {
    var ok = true;
    function mark(id, good) { var f = $(id).closest(".field"); f.classList.toggle("invalid", !good); if (!good && ok) $(id).focus(); ok = ok && good; }
    mark("#c-given", $("#c-given").value.trim().length > 0);
    mark("#c-family", $("#c-family").value.trim().length > 0);
    mark("#c-phone", $("#c-phone").value.replace(/\D/g, "").length >= 10);
    mark("#c-email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("#c-email").value.trim()));
    if (ok && !picked()) { ok = false; alertMsg(need() > 1 ? t("Elige los 2 días de tu curso.", "Pick the 2 days of your course.") : t("Elige el día de tu curso.", "Pick your course day.")); }
    if (ok && !$("#c-policy").checked) { ok = false; $("#c-policy").focus(); alertMsg(t("Acepta las condiciones de pago para continuar.", "Please accept the payment terms to continue.")); }
    return ok;
  }
  function e164(p) { var d = p.replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return "+" + d; }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }

  $("#cb-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (S.busy) return;
    alertMsg("");
    if (!validate()) return;
    var btn = $("#cb-submit"), label = btn.querySelector("span");
    S.busy = true; btn.disabled = true; label.textContent = t("Procesando…", "Processing…");
    var customer = { givenName: $("#c-given").value.trim(), familyName: $("#c-family").value.trim(), phone: e164($("#c-phone").value), email: $("#c-email").value.trim() };
    var p = DEMO ? new Promise(function (r) { setTimeout(function () { r({ dates: picked().map(function (x) { return x.start; }), paid: PRICE / 2, remaining: PRICE / 2 }); }, 900); }) :
      Promise.resolve(cardReady).then(function () {
        if (!card) throw Object.assign(new Error("form"), { code: "CARD" });
        return card.tokenize();
      }).then(function (r) {
        if (r.status !== "OK") throw Object.assign(new Error("card"), { code: "CARD" });
        return post("/course/book", { idempotencyKey: uid(), course: S.course, dates: picked().map(function (x) { return x.date; }), customer: customer, cardToken: r.token, lang: I.lang });
      });
    p.then(function (r) {
      done(customer.givenName, r);
    }).catch(function (err) {
      console.error(err);
      alertMsg(err.code === "CARD" ? t("La tarjeta fue rechazada. Revisa los datos o prueba con otra.", "The card was declined. Check the details or try another one.")
        : err.code === "SLOT_TAKEN" ? t("Esa fecha se acaba de ocupar (no se te cobró nada). Elige otra, por favor.", "That date was just taken (you weren't charged). Please pick another.")
        : t("No se pudo completar la inscripción. Inténtalo de nuevo o escríbeme por WhatsApp.", "The enrollment couldn't be completed. Try again or message me on WhatsApp."));
      if (err.code === "SLOT_TAKEN") { S.sel = []; loadDays(); hoursText(); payText(); }
    }).then(function () { S.busy = false; btn.disabled = false; payText(); });
  });

  function done(name, r) {
    var c = COURSES[S.course][I.lang];
    $("#cb-t-hi").innerHTML = name.replace(/[&<>"]/g, "") + t(", te espero <em>en clase</em>", ", see you <em>in class</em>");
    $("#cb-t-msg").textContent = t("Qué ilusión enseñarte. Ven con ganas de aprender y sin prisa: tu kit y tu mesa te estarán esperando.", "I'm so excited to teach you. Come ready to learn and relaxed: your kit and your table will be waiting for you.");
    $("#cb-t-what").textContent = c[0];
    $("#cb-t-when").textContent = datesLabel(r.dates, true) + t(" · de 9:00 a. m. a 5:00 p. m.", " · 9:00 a.m. to 5:00 p.m.");
    $("#cb-t-paid").textContent = "$" + r.paid + t(" pagado · $", " paid · $") + r.remaining + t(" al terminar", " when it ends");
    var rc = $("#cb-receipt"); if (r.receiptUrl) { rc.href = r.receiptUrl; rc.hidden = false; }
    root.hidden = true;
    var d = $("#cb-done"); d.hidden = false;
    $("#cb-done-h").focus({ preventScroll: true });
    scrollTo({ top: 0, behavior: "smooth" });
  }

  if (DEMO) $("#cb-demo").hidden = false;
  renderCourses();
  loadDays();
  document.addEventListener("langchange", function () { renderCourses(); if (S.days) loadDays(); });
})();
