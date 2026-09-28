/* ============================================================
   Reserva propia conectada a Square
   1 Servicio → 2 Fecha y hora → 3 Datos (+ tarjeta) → 4 Listo
   Sin apiBase: el paso 2 manda a la agenda de Square.
   Con ?demo=1: horarios de ejemplo, no crea citas (para enseñar).
   ============================================================ */
(function () {
  "use strict";
  var C = window.MELY_CONFIG, D = window.MELY_DATA, I = window.MELY_I18N;
  var t = function (es, en) { return I.t(es, en); };
  var $ = function (s) { return document.querySelector(s); };
  var TZ = C.timezone;
  var params = new URLSearchParams(location.search);
  var DEMO = params.has("demo");
  var LIVE = !!C.apiBase && !DEMO;

  var S = {
    step: 1, svcId: params.get("servicio") || null, addon: false,
    catalog: null,       // nombre en Square → { id, version }
    slots: null,         // [{ startAt, date, segments }]
    week: 0, day: null, slot: null,
    card: null, busy: false
  };

  if (DEMO) $("#bk-demo").hidden = false;

  // diseño elegido en el estudio de color de la portada
  var design = params.get("diseno");
  if (design) $("#f-note").value = t("Diseño elegido en la web: ", "Design picked on the website: ") + design.slice(0, 120);

  /* ---------- utilidades ---------- */
  function svc(id) { return D.services.filter(function (s) { return s.id === id; })[0]; }
  function removal() { return svc("removal"); }
  function totalMin() { var s = svc(S.svcId); return s ? s.min + (S.addon ? removal().min : 0) : 0; }
  function totalPrice() { var s = svc(S.svcId); return s ? s.price + (S.addon ? removal().price : 0) : 0; }
  function locale() { return I.lang === "en" ? "en-US" : "es-US"; }
  function ymd(date) { // fecha (Y-M-D) en hora de Houston
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    return p;
  }
  function dateFromYmd(s) { var p = s.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)); }
  function fmtDay(s, opts) { var r = new Intl.DateTimeFormat(locale(), Object.assign({ timeZone: "UTC" }, opts)).format(dateFromYmd(s)); return r.charAt(0).toUpperCase() + r.slice(1); }
  function fmtTime(iso) { return new Intl.DateTimeFormat(locale(), { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso)); }
  function addDays(s, n) { var d = dateFromYmd(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function showAlert(msg) { var a = $("#bk-alert"); a.textContent = msg || ""; a.hidden = !msg; if (msg) a.scrollIntoView({ block: "center", behavior: "smooth" }); }
  function uid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); }

  function api(path, body) {
    return fetch(C.apiBase.replace(/\/$/, "") + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "HTTP " + r.status); e.code = j.code; throw e; }
        return j;
      });
    });
  }

  /* ---------- navegación entre pasos ---------- */
  function go(n) {
    S.step = n;
    document.querySelectorAll("[data-step]").forEach(function (el) { el.hidden = +el.dataset.step !== n; });
    document.querySelectorAll("[data-stepper]").forEach(function (li) {
      var k = +li.dataset.stepper;
      li.className = k < n ? "done" : k === n ? "current" : "";
      if (k === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    showAlert("");
    var h = document.querySelector('[data-step="' + n + '"] h1');
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (h) h.focus({ preventScroll: true });
    if (n === 2) enterStep2();
    if (n === 3) enterStep3();
    if (n === 4) { // la uña de la confirmación se pinta de burdeos
      var nb = document.querySelector(".nail-big");
      if (nb && nb._nail) setTimeout(function () { nb._nail.paint("#662E3A"); }, 350);
    }
    renderSummary();
  }
  document.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { go(+b.dataset.go); }); });

  /* ---------- 1 · servicios ---------- */
  function renderServices() {
    var root = $("#svc-list");
    root.innerHTML = "";
    D.groups.forEach(function (g) {
      var list = D.services.filter(function (s) { return s.group === g.id && !s.addon; });
      if (!list.length) return;
      var fs = document.createElement("fieldset");
      fs.className = "svc-group"; fs.style.cssText = "border:0;padding:0;margin:0 0 36px";
      fs.innerHTML = '<legend class="sr-only">' + g[I.lang] + "</legend><h2 aria-hidden=\"true\">" + g[I.lang] + '</h2><div class="svc-options"></div>';
      var box = fs.querySelector(".svc-options");
      list.forEach(function (s) {
        var tx = s[I.lang];
        var lab = document.createElement("label");
        lab.className = "svc";
        lab.innerHTML = '<input type="radio" name="svc" value="' + s.id + '"' + (S.svcId === s.id ? " checked" : "") + ">" +
          "<b>" + tx[0] + '</b><span class="p">$' + s.price + '</span><span class="d">' + window.MELY_DUR(s.min) + " · " + tx[1] + "</span>";
        box.appendChild(lab);
      });
      root.appendChild(fs);
    });
    $("#to-2").disabled = !S.svcId;
  }
  $("#svc-form").addEventListener("change", function (e) {
    if (e.target.name === "svc") { S.svcId = e.target.value; S.slots = null; S.day = null; S.slot = null; }
    if (e.target.id === "addon-removal") { S.addon = e.target.checked; S.slots = null; S.day = null; S.slot = null; }
    $("#to-2").disabled = !S.svcId;
    renderSummary();
  });
  $("#svc-form").addEventListener("submit", function (e) { e.preventDefault(); if (S.svcId) go(2); });

  /* ---------- 2 · fecha y hora ---------- */
  function enterStep2() {
    var fallback = !LIVE && !DEMO;
    $("#slots-ui").hidden = fallback;
    $("#square-fallback").hidden = !fallback;
    $("#to-3").hidden = fallback;
    if (fallback) { $("#square-link").href = C.squareBookingUrl; return; }
    if (S.slots) { renderDays(); return; }
    loadSlots();
  }

  function loadSlots() {
    renderDays(true);
    var p = DEMO ? demoSlots() : loadCatalog().then(function () {
      var ids = segmentIds();
      return api("/availability", { serviceVariationIds: ids.map(function (x) { return x.id; }), days: 28 })
        .then(function (r) { return r.slots || []; });
    });
    p.then(function (slots) {
      S.slots = slots.map(function (s) { s.date = ymd(new Date(s.startAt)); return s; });
      if (!S.day) {
        var first = S.slots[0];
        S.day = first ? first.date : ymd(new Date());
        S.week = first ? Math.floor(daysBetween(ymd(new Date()), first.date) / 7) : 0;
      }
      renderDays();
    }).catch(function (err) {
      console.error(err);
      S.slots = null;
      $("#days").innerHTML = "";
      $("#slots").innerHTML = '<p class="state-msg">' + t("No pudimos cargar la agenda. ", "We couldn't load the schedule. ") +
        '<a href="' + C.squareBookingUrl + '" target="_blank" rel="noopener">' + t("Reserva en Square", "Book on Square") + "</a> " +
        t("o escríbeme por WhatsApp.", "or message me on WhatsApp.") + "</p>";
    });
  }

  function daysBetween(a, b) { return Math.round((dateFromYmd(b) - dateFromYmd(a)) / 864e5); }

  function segmentIds() {
    var list = [svc(S.svcId)];
    if (S.addon) list.unshift(removal()); // primero se retira, luego el servicio
    return list.map(function (s) {
      var c = S.catalog && S.catalog[norm(s.sq)];
      if (!c) throw new Error("Servicio no encontrado en Square: " + s.sq);
      return c;
    });
  }
  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, " ").trim(); }
  function loadCatalog() {
    if (S.catalog) return Promise.resolve();
    return api("/services").then(function (r) {
      S.catalog = {};
      (r.services || []).forEach(function (s) { S.catalog[norm(s.name)] = s; });
    });
  }

  function renderDays(loading) {
    var today = ymd(new Date());
    var start = addDays(today, S.week * 7);
    var days = $("#days"), maxWeek = 3;
    $("#wk-prev").disabled = S.week <= 0;
    $("#wk-next").disabled = S.week >= maxWeek;
    $("#wk-label").textContent = fmtDay(start, { month: "long", year: "numeric" });
    days.innerHTML = "";
    for (var i = 0; i < 7; i++) {
      var d = addDays(start, i);
      var has = !loading && S.slots && S.slots.some(function (s) { return s.date === d; });
      var b = document.createElement("button");
      b.type = "button"; b.className = "day"; b.dataset.day = d;
      b.disabled = loading || !has;
      b.setAttribute("aria-pressed", String(S.day === d && has));
      b.setAttribute("aria-label", fmtDay(d, { weekday: "long", day: "numeric", month: "long" }) + (has ? "" : t(", sin horarios", ", no times")));
      b.innerHTML = "<small>" + fmtDay(d, { weekday: "short" }).replace(".", "") + "</small><span>" + fmtDay(d, { day: "numeric" }) + "</span>";
      days.appendChild(b);
    }
    renderSlots(loading);
  }
  $("#days").addEventListener("click", function (e) {
    var b = e.target.closest(".day"); if (!b || b.disabled) return;
    S.day = b.dataset.day; S.slot = null; renderDays(); renderSummary();
  });
  $("#wk-prev").addEventListener("click", function () { S.week = Math.max(0, S.week - 1); renderDays(); });
  $("#wk-next").addEventListener("click", function () { S.week = Math.min(3, S.week + 1); renderDays(); });

  function renderSlots(loading) {
    var box = $("#slots");
    box.innerHTML = "";
    if (loading) {
      $("#slots-title").textContent = t("Buscando horarios…", "Finding times…");
      for (var k = 0; k < 6; k++) { var sk = document.createElement("div"); sk.className = "skeleton"; box.appendChild(sk); }
      return;
    }
    var list = (S.slots || []).filter(function (s) { return s.date === S.day; });
    $("#slots-title").textContent = S.day ? fmtDay(S.day, { weekday: "long", day: "numeric", month: "long" }) : "";
    if (!list.length) {
      box.innerHTML = '<p class="state-msg">' + t("No hay horarios este día. Prueba otro día o la semana siguiente.", "No times this day. Try another day or next week.") + "</p>";
    }
    list.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "slot"; b.textContent = fmtTime(s.startAt);
      b.setAttribute("aria-pressed", String(!!S.slot && S.slot.startAt === s.startAt));
      b.addEventListener("click", function () { S.slot = s; renderSlots(); renderSummary(); });
      box.appendChild(b);
    });
    $("#to-3").disabled = !S.slot;
  }
  $("#to-3").addEventListener("click", function () { if (S.slot) go(3); });

  /* ---------- 3 · datos + tarjeta ---------- */
  var cardReady = null;
  function enterStep3() {
    if (!LIVE || !C.squareAppId || !C.squareLocationId) return;
    $("#card-field").hidden = false;
    if (cardReady) return;
    var src = C.squareEnv === "sandbox" ? "https://sandbox.web.squarecdn.com/v1/square.js" : "https://web.squarecdn.com/v1/square.js";
    cardReady = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }).then(function () {
      var payments = window.Square.payments(C.squareAppId, C.squareLocationId);
      return payments.card({ style: { input: { color: "#662E3A", fontSize: "16px" }, ".input-container": { borderColor: "#D9C3C0", borderRadius: "2px" }, ".input-container.is-focus": { borderColor: "#662E3A" } } });
    }).then(function (card) { S.card = card; return card.attach("#card-container"); })
      .catch(function (e) { console.error(e); cardReady = null; showAlert(t("No se pudo cargar el formulario de tarjeta. Recarga la página.", "The card form couldn't load. Please reload the page.")); });
  }

  function validate() {
    var ok = true;
    function mark(id, good) { var f = $(id).closest(".field"); f.classList.toggle("invalid", !good); if (!good && ok) $(id).focus(); ok = ok && good; }
    mark("#f-given", $("#f-given").value.trim().length > 0);
    mark("#f-family", $("#f-family").value.trim().length > 0);
    mark("#f-phone", $("#f-phone").value.replace(/\D/g, "").length >= 10);
    mark("#f-email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("#f-email").value.trim()));
    if (!$("#f-policy").checked) { if (ok) $("#f-policy").focus(); ok = false; showAlert(t("Acepta la política de cancelación para continuar.", "Please accept the cancellation policy to continue.")); }
    return ok;
  }
  function e164(p) { var d = p.replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return "+" + d; }

  $("#data-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (S.busy) return;
    showAlert("");
    if (!validate()) return;
    var btn = $("#confirm");
    S.busy = true; btn.disabled = true; btn.textContent = t("Confirmando…", "Confirming…");
    var customer = { givenName: $("#f-given").value.trim(), familyName: $("#f-family").value.trim(), phone: e164($("#f-phone").value), email: $("#f-email").value.trim() };
    var note = $("#f-note").value.trim();

    var tokenP = (LIVE && S.card) ? S.card.tokenize().then(function (r) {
      if (r.status !== "OK") throw Object.assign(new Error("card"), { code: "CARD" });
      return r.token;
    }) : Promise.resolve(null);

    var bookP = DEMO ? new Promise(function (res) { setTimeout(function () { res({ booking: { id: "DEMO" } }); }, 900); }) :
      tokenP.then(function (token) {
        return api("/book", { idempotencyKey: uid(), startAt: S.slot.startAt, segments: S.slot.segments, customer: customer, note: note, cardToken: token, lang: I.lang });
      });

    bookP.then(function () {
      buildIcs();
      var dd = fmtDay(S.day, { weekday: "long", day: "numeric", month: "long" }), tm = fmtTime(S.slot.startAt);
      if (I.lang === "es") dd = dd.charAt(0).toLowerCase() + dd.slice(1);
      $("#done-text").textContent = t("Te esperamos el ", "See you on ") + dd + t(" a las ", " at ") + tm + (/\.$/.test(tm) ? "" : ".");
      go(4);
    }).catch(function (err) {
      console.error(err);
      var msg = err.code === "CARD" ? t("Revisa los datos de la tarjeta.", "Please check your card details.")
        : err.code === "SLOT_TAKEN" ? t("Ese horario se acaba de ocupar. Elige otro, por favor.", "That time was just taken. Please pick another.")
        : t("No pudimos confirmar tu cita. Inténtalo de nuevo o escríbeme por WhatsApp.", "We couldn't confirm your appointment. Try again or message me on WhatsApp.");
      showAlert(msg);
      if (err.code === "SLOT_TAKEN") { S.slots = null; S.slot = null; go(2); }
    }).then(function () { S.busy = false; btn.disabled = false; btn.textContent = t("Confirmar cita", "Confirm appointment"); });
  });

  function buildIcs() {
    var s = svc(S.svcId), start = new Date(S.slot.startAt), end = new Date(start.getTime() + totalMin() * 6e4);
    var f = function (d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nails by MelyG//ES", "BEGIN:VEVENT", "UID:" + uid() + "@nailsbymelyg.com",
      "DTSTAMP:" + f(new Date()), "DTSTART:" + f(start), "DTEND:" + f(end),
      "SUMMARY:" + s[I.lang][0] + " · Nails by MelyG", "LOCATION:2727 N Mason Rd\\, Suite 301\\, Katy\\, TX 77449",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    $("#ics").href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  }

  /* ---------- resumen ---------- */
  function renderSummary() {
    var s = svc(S.svcId);
    $("#sum-svc").textContent = s ? s[I.lang][0] + (S.addon ? t(" + retirada", " + removal") : "") : t("Elige un servicio", "Choose a service");
    $("#sum-price").textContent = s ? "$" + totalPrice() : "—";
    $("#sum-dur").textContent = s ? window.MELY_DUR(totalMin()) : "—";
    $("#sum-date").textContent = S.slot ? fmtDay(S.day, { weekday: "short", day: "numeric", month: "short" }) : "—";
    $("#sum-time").textContent = S.slot ? fmtTime(S.slot.startAt) : "—";
  }

  /* ---------- modo demostración ---------- */
  function demoSlots() {
    var out = [], today = ymd(new Date()), need = totalMin();
    for (var i = 1; i < 28; i++) {
      var d = addDays(today, i), wd = dateFromYmd(d).getUTCDay(), h = D.hours[wd];
      if (!h || (i * 7) % 5 === 0) continue; // algunos días llenos
      var open = +h[0].split(":")[0] * 60, close = +h[1].split(":")[0] * 60;
      for (var m = open; m + need <= close; m += 90) {
        if ((m / 30 + i) % 4 === 0) continue;
        // hora local de Houston → ISO (aprox. con desfase de CT)
        var off = new Date(d + "T12:00:00Z").toLocaleString("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).match(/GMT([+-]\d+)/);
        var hrs = off ? -parseInt(off[1], 10) : 5;
        var iso = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), Math.floor(m / 60) + hrs, m % 60)).toISOString();
        out.push({ startAt: iso, segments: [] });
      }
    }
    return new Promise(function (res) { setTimeout(function () { res(out); }, 600); });
  }

  /* ---------- idioma ---------- */
  document.addEventListener("langchange", function () {
    renderServices();
    if (S.step === 2 && S.slots) renderDays();
    renderSummary();
  });

  if (S.svcId && !svc(S.svcId)) S.svcId = null;
  renderServices();
  go(1);
})();
