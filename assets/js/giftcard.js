/* ============================================================
   Nails by MelyG — diseñador de gift cards
   La persona elige monto (o un servicio), fondo, color del esmalte,
   para quién, de quién, mensaje y cómo recibirla. La tarjeta se
   dibuja en vivo.
   · Con la API conectada (config.apiBase + squareAppId): se paga aquí
     con el formulario de Square y el Worker crea una gift card REAL de
     Square (Square guarda el saldo y no deja usarla de más).
   · Sin API: el pedido llega a Mely por WhatsApp y ella cobra aparte.
   · ?demo=1: simula el pago para enseñarlo, sin cobrar.
   · ?c=…: vista de la tarjeta para quien la recibe, con saldo en vivo.
   ============================================================ */
(function () {
  "use strict";
  var form = document.querySelector("[data-gc-form]");
  if (!form) return;
  var C = window.MELY_CONFIG, D = window.MELY_DATA, I = window.MELY_I18N, N = window.MELY_NAIL;
  var t = function (es, en) { return I.t(es, en); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var params = new URLSearchParams(location.search);
  var DEMO = params.has("demo");
  var LIVE = !!(C.apiBase && C.squareAppId && C.squareLocationId) && !DEMO;
  var PAY = LIVE || DEMO;
  var API = (C.apiBase || "").replace(/\/$/, "");

  var AMOUNTS = [50, 75, 100, 150];
  var THEMES = [
    { id: "burdeos", es: "Burdeos", en: "Bordeaux", sw: "linear-gradient(135deg,#8A4453,#4E222C)", dark: true },
    { id: "rosa", es: "Rosa", en: "Pink", sw: "linear-gradient(135deg,#F3D6D8,#C98E96)", dark: false },
    { id: "nude", es: "Nude", en: "Nude", sw: "linear-gradient(135deg,#F4E8E0,#C4A694)", dark: false },
    { id: "noche", es: "Noche", en: "Night", sw: "linear-gradient(135deg,#3A3440,#16121A)", dark: true }
  ];
  var POLISH = [
    { c: "#E0B6B9", es: "Rosa empolvado", en: "Dusty rose" },
    { c: "#662E3A", es: "Burdeos", en: "Bordeaux" },
    { c: "#9E1B2E", es: "Rojo cereza", en: "Cherry red" },
    { c: "#F3EBDD", es: "Marfil", en: "Ivory" },
    { c: "#D8B39E", es: "Nude", en: "Nude" },
    { c: "#1F3B4D", es: "Petróleo", en: "Petrol blue" },
    { c: "#6E6B4C", es: "Oliva", en: "Olive" },
    { c: "#C9C3BF", es: "Cromado", en: "Chrome", finish: "chrome" }
  ];
  var IDEAS = [
    ["¡Feliz cumpleaños! Date un gusto.", "Happy birthday! Treat yourself."],
    ["Para que te consientas, te lo mereces.", "Go pamper yourself, you deserve it."],
    ["Gracias por todo. Con cariño.", "Thank you for everything. With love."],
    ["Feliz Día de las Madres.", "Happy Mother’s Day."],
    ["Porque sí. Disfrútalo.", "Just because. Enjoy it."]
  ];

  var STORE = "mely-giftcard";
  var S = { mode: "amount", amount: 75, custom: "", service: "mani-gel", theme: "burdeos", polish: 0, to: "", from: "", msg: "", via: "whatsapp", contact: "", direct: false, buyerEmail: "" };
  var issued = null; // { gan, link, emailSent } cuando Square ya creó la tarjeta
  var linked = null; // { gan, balance }: gift card de Square comprada fuera de la web (salón, página de Square)
  try { var saved = JSON.parse(localStorage.getItem(STORE) || "null"); if (saved) for (var k in S) if (k in saved) S[k] = saved[k]; } catch (e) {}
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }

  // código único y estable para esta tarjeta (cambia al diseñar otra)
  var code = S.code || ("MG-" + Math.random().toString(36).slice(2, 6).toUpperCase());
  S.code = code;

  var card = $("[data-gc-card]"), nailHost = $("[data-gc-nail]");
  nailHost.setAttribute("data-bare", "");
  var nail = N.create(nailHost, { polish: POLISH[S.polish].c, shape: "almond", finish: POLISH[S.polish].finish || "gloss" });
  nail.el.setAttribute("viewBox", "44 14 112 246");
  nail.el.classList.add("is-bare");

  function services() { return D.services.filter(function (s) { return !s.addon; }); }
  function svc() { return services().filter(function (s) { return s.id === S.service; })[0] || services()[0]; }
  function value() {
    if (S.mode === "service") return svc().price;
    if (S.mode === "custom") return +S.custom || 0;
    return S.amount;
  }
  function valueLabel() {
    if (S.mode === "service") return svc()[I.lang][0] + " ($" + svc().price + ")";
    return "$" + value();
  }

  /* ---------- controles ---------- */
  function render() {
    $("[data-gc-amounts]").innerHTML = AMOUNTS.map(function (a) {
      return '<label class="gc-chip"><input type="radio" name="gc-amt" value="' + a + '"' + (S.mode === "amount" && S.amount === a ? " checked" : "") + "><span>$" + a + "</span></label>";
    }).join("") +
      '<label class="gc-chip"><input type="radio" name="gc-amt" value="custom"' + (S.mode === "custom" ? " checked" : "") + "><span>" + t("Otro", "Other") + "</span></label>" +
      '<label class="gc-chip"><input type="radio" name="gc-amt" value="service"' + (S.mode === "service" ? " checked" : "") + "><span>" + t("Un servicio", "A service") + "</span></label>";
    $("[data-gc-custom]").hidden = S.mode !== "custom";
    $("[data-gc-service]").hidden = S.mode !== "service";
    $("[data-gc-custom-input]").value = S.custom;
    $("[data-gc-service-select]").innerHTML = services().map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === S.service ? " selected" : "") + ">" + s[I.lang][0] + " — $" + s.price + "</option>";
    }).join("");

    $("[data-gc-themes]").innerHTML = THEMES.map(function (th) {
      return '<label class="gc-theme"><input type="radio" name="gc-theme" value="' + th.id + '"' + (S.theme === th.id ? " checked" : "") +
        '><span style="background:' + th.sw + '"></span><small>' + th[I.lang] + "</small></label>";
    }).join("");
    $("[data-gc-polish]").innerHTML = POLISH.map(function (p, i) {
      return '<label class="chip" title="' + p[I.lang] + '"><input type="radio" name="gc-polish" value="' + i + '"' + (S.polish === i ? " checked" : "") +
        '><span class="dot" style="--c:' + p.c + '"></span><span class="sr-only">' + p[I.lang] + "</span></label>";
    }).join("");
    $("[data-gc-ideas]").innerHTML = IDEAS.map(function (m, i) {
      return '<button type="button" data-idea="' + i + '">' + (I.lang === "en" ? m[1] : m[0]) + "</button>";
    }).join("");

    form.querySelectorAll("[data-gc-in]").forEach(function (el) { el.value = S[el.getAttribute("data-gc-in")] || ""; });
    form.querySelector('input[name="gc-via"][value="' + S.via + '"]').checked = true;
    $("[data-gc-direct]").checked = S.direct;
    contactField();
    preview();
  }

  function contactField() {
    var email = S.via === "email", inp = $('[data-gc-in="contact"]');
    var who = S.direct ? t(" de quien la recibe", " of the recipient") : "";
    $("[data-gc-contact-label]").textContent = (email ? t("Correo", "Email") : t("Número de WhatsApp", "WhatsApp number")) + who;
    $("[data-gc-contact-err]").textContent = email ? t("Escribe un correo válido.", "Enter a valid email.") : t("Escribe un teléfono válido.", "Enter a valid phone number.");
    inp.type = email ? "email" : "tel";
    inp.inputMode = email ? "email" : "tel";
    inp.autocomplete = email ? "email" : "tel";
    inp.placeholder = email ? "nombre@correo.com" : "(832) 000-0000";
  }

  /* ---------- vista previa ---------- */
  function preview(animate) {
    var th = THEMES.filter(function (x) { return x.id === S.theme; })[0] || THEMES[0];
    card.setAttribute("data-theme", th.id);
    $("[data-gc-logo]").src = th.dark ? "assets/img/logo-light.png" : "assets/img/logo-wine.png";
    var to = S.to.trim() || t("Alguien especial", "Someone special");
    $("[data-gc-to]").textContent = to;
    $("[data-gc-mono]").textContent = (S.to.trim() || "M").charAt(0).toUpperCase();
    $("[data-gc-from]").textContent = S.from.trim() || "—";
    $("[data-gc-msg]").textContent = S.msg.trim() || t("Para que te consientas.", "Go pamper yourself.");
    var amt = $("[data-gc-amount]");
    if (linked) { amt.textContent = "$" + linked.balance; amt.classList.remove("is-service"); }
    else if (S.mode === "service") { amt.textContent = svc()[I.lang][0]; amt.classList.add("is-service"); }
    else { amt.textContent = "$" + (value() || "—"); amt.classList.remove("is-service"); }
    $("[data-gc-code]").textContent = issued ? fmtGan(issued.gan) : t("Pedido ", "Order ") + code;
    $("[data-gc-count]").textContent = (S.msg || "").length + "/120";
    var p = POLISH[S.polish] || POLISH[0];
    nail.set({ finish: p.finish || "gloss", polish: p.c, animate: !!animate });
    $("[data-gc-summary]").innerHTML = "<b>" + (linked ? "$" + linked.balance : valueLabel()) + "</b> · " + t("para ", "for ") + escapeHtml(to) +
      " · " + (S.via === "email" ? t("por correo", "by email") : t("por WhatsApp", "by WhatsApp"));
    save();
  }
  function fmtGan(g) { return String(g).replace(/(.{4})/g, "$1 ").trim(); }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  form.addEventListener("input", function (e) {
    var k = e.target.getAttribute("data-gc-in");
    if (k) { S[k] = e.target.value; e.target.closest(".field") && e.target.closest(".field").classList.remove("invalid"); preview(); }
    if (e.target.matches("[data-gc-custom-input]")) { S.custom = e.target.value; preview(); }
  });
  form.addEventListener("change", function (e) {
    var n = e.target.name;
    if (n === "gc-amt") {
      var v = e.target.value;
      if (v === "custom") S.mode = "custom";
      else if (v === "service") S.mode = "service";
      else { S.mode = "amount"; S.amount = +v; }
      $("[data-gc-custom]").hidden = S.mode !== "custom";
      $("[data-gc-service]").hidden = S.mode !== "service";
      if (S.mode === "custom") $("[data-gc-custom-input]").focus();
      pop($("[data-gc-amount]"));
    }
    if (e.target.matches("[data-gc-service-select]")) S.service = e.target.value;
    if (n === "gc-theme") { S.theme = e.target.value; pop(card); }
    if (n === "gc-polish") { S.polish = +e.target.value; preview(true); return; }
    if (n === "gc-via") { S.via = e.target.value; contactField(); }
    if (e.target.matches("[data-gc-direct]")) { S.direct = e.target.checked; contactField(); }
    preview();
  });
  $("[data-gc-ideas]").addEventListener("click", function (e) {
    var b = e.target.closest("[data-idea]");
    if (!b) return;
    S.msg = b.textContent;
    $('[data-gc-in="msg"]').value = S.msg;
    preview();
  });
  function pop(el) {
    if (el.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.animate([{ transform: getComputedStyle(el).transform === "none" ? "scale(.96)" : getComputedStyle(el).transform + " scale(.96)" }, { transform: getComputedStyle(el).transform }], { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" });
    }
  }

  /* ---------- validar y pedir ---------- */
  function validate() {
    var ok = true, first = null;
    function bad(el, cond) { var f = el.closest(".field"); f.classList.toggle("invalid", !cond); if (!cond) { ok = false; first = first || el; } }
    bad($('[data-gc-in="to"]'), S.to.trim().length > 0);
    bad($('[data-gc-in="from"]'), S.from.trim().length > 0);
    var c = S.contact.trim();
    bad($('[data-gc-in="contact"]'), S.via === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) : c.replace(/\D/g, "").length >= 10);
    if (PAY) bad($('[data-gc-in="buyerEmail"]'), /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((S.buyerEmail || "").trim()));
    if (S.mode === "custom") {
      var v = +S.custom, inp = $("[data-gc-custom-input]");
      var f = inp.closest(".field"); f.classList.toggle("invalid", !(v >= 25 && v <= 1000));
      if (!(v >= 25 && v <= 1000)) { ok = false; first = first || inp; if (window.MELY_TOAST) window.MELY_TOAST(t("El monto debe estar entre $25 y $1,000.", "Amount must be between $25 and $1,000.")); }
    }
    if (first) first.focus();
    return ok;
  }
  function orderText() {
    var p = POLISH[S.polish], th = THEMES.filter(function (x) { return x.id === S.theme; })[0];
    return [
      t("Hola Mely, quiero una gift card 🎁", "Hi Mely, I’d like a gift card 🎁"),
      "",
      "• " + t("Valor: ", "Value: ") + valueLabel(),
      "• " + t("Para: ", "For: ") + S.to.trim(),
      "• " + t("De: ", "From: ") + S.from.trim(),
      "• " + t("Mensaje: ", "Message: ") + "“" + (S.msg.trim() || t("Para que te consientas.", "Go pamper yourself.")) + "”",
      "• " + t("Diseño: ", "Design: ") + th[I.lang] + " · " + p[I.lang],
      "• " + t("Recibirla por: ", "Deliver by: ") + (S.via === "email" ? t("correo", "email") : "WhatsApp") + " — " + S.contact.trim() +
        (S.direct ? t(" (directo a quien la recibe)", " (straight to the recipient)") : ""),
      "• " + t("Nº de pedido: ", "Order no.: ") + code,
      "",
      t("¿Cómo te hago el pago?", "How can I pay?")
    ].join("\n");
  }
  function showDone(title, text) {
    form.querySelectorAll(".gc-step, .gc-summary").forEach(function (el) { el.hidden = true; });
    var done = $("[data-gc-done]");
    $("[data-gc-done-title]").innerHTML = title;
    $("[data-gc-done-text]").textContent = text;
    done.hidden = false;
    done.focus({ preventScroll: true });
    if (window.MELY_LENIS) window.MELY_LENIS.scrollTo(".gc", { offset: -80 }); else done.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function alertMsg(m) { var a = $("[data-gc-alert]"); a.textContent = m || ""; a.hidden = !m; }

  /* ---------- pago con Square ---------- */
  var sqCard = null, sqReady = null;
  function loadSquare() {
    if (!LIVE || sqReady) return sqReady;
    var src = C.squareEnv === "sandbox" ? "https://sandbox.web.squarecdn.com/v1/square.js" : "https://web.squarecdn.com/v1/square.js";
    sqReady = new Promise(function (res, rej) {
      var sc = document.createElement("script"); sc.src = src; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
    }).then(function () {
      return window.Square.payments(C.squareAppId, C.squareLocationId).card({ style: { input: { color: "#662E3A", fontSize: "16px" }, ".input-container": { borderColor: "#D9C3C0", borderRadius: "2px" }, ".input-container.is-focus": { borderColor: "#662E3A" } } });
    }).then(function (c) { sqCard = c; return c.attach("#gc-card-container"); })
      .catch(function (e) { console.error(e); sqReady = null; alertMsg(t("No se pudo cargar el formulario de pago. Recarga la página.", "The payment form couldn't load. Please reload the page.")); });
    return sqReady;
  }
  function delivered(r) {
      issued = r;
      preview();
      var viaWa = S.via === "whatsapp";
      var shareTxt = t("¡Tienes una gift card de Nails by MelyG! 💅 ", "You’ve got a Nails by MelyG gift card! 💅 ") + (S.direct ? "" : "") +
        t("De ", "From ") + S.from.trim() + ": " + r.link;
      var wa = $("[data-gc-wa]");
      if (viaWa) {
        var num = S.contact.replace(/\D/g, ""); if (num.length === 10) num = "1" + num;
        wa.href = "https://wa.me/" + num + "?text=" + encodeURIComponent(shareTxt);
        $("[data-gc-wa-label]").textContent = S.direct ? t("Enviársela por WhatsApp", "Send it on WhatsApp") : t("Enviármela por WhatsApp", "Send it to my WhatsApp");
        wa.hidden = false;
      } else wa.hidden = true;
      var mail = $("[data-gc-mail]");
      mail.hidden = viaWa || r.emailSent;
      mail.href = "mailto:" + S.contact.trim() + "?subject=" + encodeURIComponent("Gift card · Nails by MelyG") + "&body=" + encodeURIComponent(shareTxt);
      var view = $("[data-gc-view-link]"); view.href = r.link; view.hidden = false;
      if (linked) return showDone(t("¡Tu diseño <em>está listo!</em>", "Your design <em>is ready!</em>"),
        t("Número ", "Number ") + fmtGan(r.gan) + t(" · saldo ", " · balance ") + "$" + r.amount + ". " +
        (viaWa ? t("Toca el botón para enviarla por WhatsApp con su enlace.", "Tap the button to send it on WhatsApp with its link.")
          : t("Toca el botón para enviarla por correo con su enlace.", "Tap the button to email it with its link.")) +
        t(" Quien la abra verá este diseño y el saldo en vivo de Square.", " Whoever opens it sees this design and the live Square balance."));
      showDone(t("¡Tu gift card <em>está activa!</em>", "Your gift card <em>is active!</em>"),
        (DEMO ? t("Modo demostración: no se cobró nada y el número es de ejemplo. ", "Demo mode: nothing was charged and the number is a sample. ") : "") +
        t("Número ", "Number ") + fmtGan(r.gan) + " · $" + r.amount + ". " +
        (r.emailSent ? t("Ya la envié por correo a ", "I’ve emailed it to ") + S.contact.trim() + "."
          : viaWa ? t("Toca el botón para enviarla por WhatsApp con su enlace.", "Tap the button to send it on WhatsApp with its link.")
          : t("Toca el botón para enviarla por correo con su enlace.", "Tap the button to email it with its link.")) +
        t(" El recibo del pago te llega de Square.", " Square will email you the payment receipt."));
  }
  function purchase() {
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; alertMsg("");
    var payload = {
      amount: value(), label: S.mode === "service" ? svc()[I.lang][0] : "",
      to: S.to.trim(), from: S.from.trim(), msg: S.msg.trim(), theme: S.theme, polish: S.polish,
      via: S.via, contact: S.contact.trim(), buyerEmail: S.buyerEmail.trim(), order: code, lang: I.lang,
      idempotencyKey: code + "-" + Date.now().toString(36)
    };
    var p;
    if (DEMO) {
      p = new Promise(function (r) { setTimeout(r, 900); }).then(function () {
        var gan = "7783" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
        return { gan: gan, amount: payload.amount, emailSent: false, link: location.origin + location.pathname + "?demo=1&c=" + encodeDesign(Object.assign({ g: gan }, designOf(payload))) };
      });
    } else {
      p = Promise.resolve(loadSquare()).then(function () {
        if (!sqCard) throw Object.assign(new Error("form"), { code: "FORM" });
        return sqCard.tokenize();
      }).then(function (r) {
        if (r.status !== "OK") throw Object.assign(new Error("card"), { code: "CARD" });
        payload.cardToken = r.token;
        return fetch(API + "/giftcard/purchase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then(function (res) { return res.json().then(function (j) { if (!res.ok) throw Object.assign(new Error(j.error || "HTTP"), { code: j.code }); return j; }); });
      });
    }
    return p.then(delivered).catch(function (e) {
      alertMsg(e.code === "CARD" ? t("La tarjeta fue rechazada. Revisa los datos o prueba con otra.", "The card was declined. Check the details or try another one.")
        : e.code === "GIFT_FAILED" ? t("No se pudo crear la gift card y el cobro se devolvió. Inténtalo de nuevo o escríbeme por WhatsApp.", "The gift card couldn't be created and the charge was refunded. Try again or message me on WhatsApp.")
        : t("No se pudo completar el pago. Inténtalo de nuevo o escríbeme por WhatsApp.", "The payment couldn't be completed. Try again or message me on WhatsApp."));
    }).then(function () { btn.disabled = false; });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) return;
    if (linked) {
      var d = { g: linked.gan, a: linked.balance, l: "", t: S.to.trim(), f: S.from.trim(), m: S.msg.trim(), th: S.theme, p: S.polish, lang: I.lang };
      delivered({ gan: linked.gan, amount: linked.balance, emailSent: false, link: location.origin + location.pathname + "?c=" + encodeDesign(d) });
      return;
    }
    if (PAY) { purchase(); return; }
    // sin API: pedido por WhatsApp y Mely cobra aparte
    var txt = orderText();
    var wa = window.MELY_WA(txt);
    $("[data-gc-wa]").href = wa;
    $("[data-gc-wa-label]").textContent = t("Abrir WhatsApp", "Open WhatsApp");
    var mail = $("[data-gc-mail]");
    if (C.email) { mail.hidden = false; mail.href = "mailto:" + C.email + "?subject=" + encodeURIComponent("Gift card " + code) + "&body=" + encodeURIComponent(txt); }
    window.open(wa, "_blank", "noopener");
    showDone(t("¡Tu pedido <em>está en camino!</em>", "Your order <em>is on its way!</em>"),
      t("Si WhatsApp no se abrió, toca el botón. En cuanto me escribas te confirmo el pago y activo tu gift card de Square.", "If WhatsApp didn’t open, tap the button. As soon as you message me I’ll confirm payment and activate your Square gift card."));
  });
  $("[data-gc-again]").addEventListener("click", function () {
    code = "MG-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    S.code = code; S.to = ""; S.msg = ""; S.contact = ""; issued = null; unlink();
    $("[data-gc-view-link]").hidden = true; alertMsg("");
    form.querySelectorAll(".gc-step, .gc-summary").forEach(function (el) { el.hidden = false; });
    $("[data-gc-done]").hidden = true;
    render();
  });

  /* ---------- descargar el diseño (PNG) ---------- */
  function nailImage() {
    // copia autónoma del SVG: los estilos que dependen del CSS de la web se pasan a atributos
    var svg = nail.el.cloneNode(true), fin = svg.getAttribute("data-finish");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "224"); svg.setAttribute("height", "492");
    svg.querySelectorAll(".n-finger, .n-folds").forEach(function (el) { el.setAttribute("display", "none"); });
    var hide = function (sel, on) { var el = svg.querySelector(sel); if (el) el.setAttribute("opacity", on ? "1" : "0"); };
    hide(".n-tip", fin === "french"); hide(".n-chrome", fin === "chrome"); hide(".n-matte", fin === "matte");
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { res(null); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    });
  }
  function loadImg(src) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function wrap(ctx, text, x, y, maxW, lh) {
    var words = text.split(" "), line = "", lines = [];
    words.forEach(function (w) { var test = line ? line + " " + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; });
    lines.push(line);
    lines.slice(0, 3).forEach(function (l, i) { ctx.fillText(l, x, y + i * lh); });
  }
  function download() {
    var th = THEMES.filter(function (x) { return x.id === S.theme; })[0];
    var W = 1600, H = 1000, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var x = cv.getContext("2d");
    var g = x.createLinearGradient(0, 0, W, H);
    var stops = { burdeos: ["#8A4453", "#662E3A", "#4E222C"], rosa: ["#F6E1E2", "#E7C2C5", "#C98E96"], nude: ["#F7EEE8", "#E3CDBF", "#C4A694"], noche: ["#403A47", "#2A2430", "#16121A"] }[th.id];
    g.addColorStop(0, stops[0]); g.addColorStop(.55, stops[1]); g.addColorStop(1, stops[2]);
    x.fillStyle = g; x.beginPath(); x.roundRect ? x.roundRect(0, 0, W, H, 56) : x.rect(0, 0, W, H); x.fill();
    var ink = th.dark ? "#F3ECE8" : "#4E222C", accent = th.dark ? "#E0B6B9" : "#662E3A";
    Promise.all([loadImg(th.dark ? "assets/img/logo-light.png" : "assets/img/logo-wine.png"), nailImage(), document.fonts ? document.fonts.ready : null]).then(function (r) {
      var logo = r[0], nimg = r[1];
      // inicial gigante de fondo
      x.save(); x.globalAlpha = th.dark ? .09 : .12; x.fillStyle = ink; x.font = "italic 400 900px 'Playfair Display', Georgia, serif";
      x.fillText((S.to.trim() || "M").charAt(0).toUpperCase(), 820, 900); x.restore();
      if (logo) x.drawImage(logo, 90, 80, 360, 183);
      x.fillStyle = accent; x.font = "500 30px Jost, sans-serif"; x.fillText("G I F T   C A R D", 1180, 130);
      x.fillStyle = ink; x.font = "500 28px Jost, sans-serif"; x.globalAlpha = .75; x.fillText(t("PARA", "FOR"), 96, 420); x.globalAlpha = 1;
      x.font = "italic 400 96px 'Playfair Display', Georgia, serif"; x.fillText(S.to.trim() || t("Alguien especial", "Someone special"), 90, 520);
      x.font = "400 40px Jost, sans-serif"; x.globalAlpha = .9;
      wrap(x, S.msg.trim() || t("Para que te consientas.", "Go pamper yourself."), 96, 600, 900, 54); x.globalAlpha = 1;
      x.font = S.mode === "service" ? "500 64px 'Playfair Display', Georgia, serif" : "500 170px 'Playfair Display', Georgia, serif";
      x.fillText(S.mode === "service" ? svc()[I.lang][0] : "$" + value(), 90, 900);
      x.font = "500 30px Jost, sans-serif"; x.textAlign = "right";
      x.fillText(t("De ", "From ") + (S.from.trim() || "—"), 1510, 850);
      x.fillStyle = accent; x.font = "500 26px monospace"; x.fillText(issued ? fmtGan(issued.gan) : t("Pedido ", "Order ") + code, 1510, 900); x.textAlign = "left";
      if (!issued) { // sin tarjeta de Square todavía: que nadie la tome por válida
        x.save(); x.translate(W / 2, H / 2); x.rotate(-.18); x.textAlign = "center";
        x.fillStyle = "rgba(255,255,255,.72)"; x.fillRect(-620, -62, 1240, 124);
        x.fillStyle = "#662E3A"; x.font = "500 44px Jost, sans-serif";
        x.fillText(t("PENDIENTE DE ACTIVACIÓN", "PENDING ACTIVATION"), 0, 16); x.restore();
      }
      if (nimg) { x.save(); x.translate(1330, 360); x.rotate(.3); x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 40; x.shadowOffsetY = 20; x.drawImage(nimg, -112, -246, 224, 492); x.restore(); }
      var name = "gift-card-nails-by-melyg-" + (issued ? issued.gan.slice(-4) : code) + ".png";
      if (matchMedia("(pointer: coarse)").matches) return saveSheet(cv, name);
      var a = document.createElement("a");
      a.download = name;
      a.href = cv.toDataURL("image/png");
      document.body.appendChild(a); a.click(); a.remove();
    });
  }
  // En el móvil la descarga falla dentro de WhatsApp/Instagram: se enseña la imagen
  // para compartirla (Fotos, WhatsApp…) o guardarla manteniéndola presionada.
  function saveSheet(cv, name) {
    var url = cv.toDataURL("image/png");
    var dlg = document.createElement("dialog");
    dlg.className = "gc-save";
    dlg.innerHTML = '<img alt="">' +
      '<p>' + t("Mantén presionada la imagen para guardarla en tus fotos.", "Press and hold the image to save it to your photos.") + '</p>' +
      '<div class="step-actions"><button class="btn" type="button" data-share hidden><span>' + t("Compartir o guardar", "Share or save") + '</span></button>' +
      '<button class="back-link" type="button" data-close>' + t("Cerrar", "Close") + '</button></div>';
    dlg.querySelector("img").src = url;
    document.body.appendChild(dlg);
    var close = function () { dlg.close(); dlg.remove(); };
    dlg.querySelector("[data-close]").addEventListener("click", close);
    dlg.addEventListener("cancel", function () { dlg.remove(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) close(); });
    cv.toBlob(function (blob) {
      if (!blob || !window.File || !navigator.canShare) return;
      var file = new File([blob], name, { type: "image/png" });
      if (!navigator.canShare({ files: [file] })) return;
      var sb = dlg.querySelector("[data-share]"); sb.hidden = false;
      sb.addEventListener("click", function () { navigator.share({ files: [file], title: "Gift card · Nails by MelyG" }).catch(function () {}); });
    }, "image/png");
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  ["[data-gc-download]", "[data-gc-download2]", "[data-gc-download3]"].forEach(function (sel) { var b = $(sel); if (b) b.addEventListener("click", download); });
  if (issued === null && S.code === undefined) S.code = code;

  /* ---------- diseño en el enlace ---------- */
  function designOf(pl) { return { a: pl.amount, l: pl.label, t: pl.to, f: pl.from, m: pl.msg, th: pl.theme, p: pl.polish, lang: pl.lang }; }
  function encodeDesign(d) {
    var bin = unescape(encodeURIComponent(JSON.stringify(d)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeDesign(str) {
    try {
      var b = str.replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "=";
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch (e) { return null; }
  }
  function checkBalance(gan) {
    if (DEMO) return Promise.resolve({ found: true, state: "ACTIVE", balance: null });
    if (!API) return Promise.resolve(null);
    return fetch(API + "/giftcard/balance?gan=" + encodeURIComponent(gan)).then(function (r) { return r.json(); });
  }
  function stateText(r, amountFallback) {
    if (!r) return t("Para consultar el saldo, escríbeme por WhatsApp con el número de tu tarjeta.", "To check the balance, message me on WhatsApp with your card number.");
    if (!r.found) return t("No encontramos esta tarjeta en Square. Revisa el número o escríbeme.", "We couldn’t find this card in Square. Check the number or message me.");
    var bal = r.balance === null ? amountFallback : r.balance;
    if (r.state === "ACTIVE") return "<b>" + t("Activa", "Active") + "</b> · " + t("saldo disponible ", "available balance ") + "$" + bal;
    if (r.state === "DEACTIVATED" || r.state === "BLOCKED") return "<b>" + t("No disponible", "Not available") + "</b> · " + t("esta tarjeta está desactivada.", "this card is deactivated.");
    if (r.state === "PENDING") return "<b>" + t("Pendiente", "Pending") + "</b> · " + t("aún no está activada.", "not activated yet.");
    return "<b>" + r.state + "</b> · $" + bal;
  }

  // vista para quien recibe la tarjeta
  var shared = params.get("c") ? decodeDesign(params.get("c")) : null;
  if (shared && shared.g) {
    S = Object.assign(S, { mode: "amount", amount: +shared.a, to: shared.t || "", from: shared.f || "", msg: shared.m || "",
      theme: shared.th || "burdeos", polish: +shared.p || 0 });
    issued = { gan: String(shared.g), link: location.href };
    save = function () {}; // no pisar el borrador de quien la abre
    form.hidden = true;
    $("[data-gc-hero]").hidden = true;
    var v = $("[data-gc-viewer]"); v.hidden = false;
    var note = $(".gc-note"); if (note) note.hidden = true;
    $("[data-gc-v-title]").innerHTML = t("Para ", "For ") + "<em>" + escapeHtml(S.to) + "</em>";
    var st = $("[data-gc-status]"); st.textContent = t("Consultando saldo en Square…", "Checking balance with Square…");
    checkBalance(issued.gan).then(function (r) { st.innerHTML = stateText(r, S.amount); }).catch(function () { st.innerHTML = stateText(null); });
    preview();
    document.addEventListener("langchange", function () { preview(); });
    return;
  }

  // consultar saldo
  var balBox = $("[data-gc-balance]");
  if (balBox && (LIVE || DEMO)) {
    balBox.hidden = false;
    $("[data-gc-bal-form]").addEventListener("submit", function (e) {
      e.preventDefault();
      var gan = $("[data-gc-bal-input]").value.replace(/\s/g, ""), out = $("[data-gc-bal-out]");
      if (!/^[A-Za-z0-9]{8,20}$/.test(gan)) { out.textContent = t("Escribe el número completo de la tarjeta.", "Enter the full card number."); return; }
      out.textContent = t("Consultando…", "Checking…");
      checkBalance(gan).then(function (r) {
        out.innerHTML = stateText(r, "—");
        var bal = r && r.balance === null && DEMO ? 100 : r && r.balance;
        if (r && r.found && r.state === "ACTIVE" && bal > 0) {
          var b = document.createElement("button");
          b.type = "button"; b.className = "btn gc-link-btn";
          b.innerHTML = "<span>" + t("Darle mi diseño a esta tarjeta", "Give this card my design") + "</span>";
          b.addEventListener("click", function () { link(gan, bal); });
          out.appendChild(b);
        }
      }).catch(function () { out.textContent = t("No se pudo consultar ahora. Inténtalo más tarde.", "Couldn’t check right now. Try again later."); });
    });
  }

  /* ---------- gift cards de Square compradas fuera de la web ----------
     Se vendió en el salón o en la página de Square: aquí se le pone el diseño
     de la web. No se cobra nada; el enlace lleva el número y el saldo es el de Square. */
  function link(gan, balance) {
    linked = { gan: gan, balance: balance };
    issued = { gan: gan };
    document.body.classList.add("is-gc-linked");
    var bn = $("[data-gc-linked]");
    bn.querySelector("[data-gc-linked-text]").innerHTML = t("Estás diseñando tu gift card de Square ", "You’re designing your Square gift card ") +
      "<b>•••• " + escapeHtml(gan.slice(-4)) + "</b>" + t(" · saldo ", " · balance ") + "$" + balance;
    bn.hidden = false;
    $("[data-gc-pay]").hidden = true;
    form.querySelector('button[type="submit"] span').textContent = t("Crear mi diseño", "Create my design");
    form.querySelector(".gc-summary .note").textContent = t("Tu tarjeta ya está pagada en Square: aquí solo le das el diseño y recibes el enlace para regalarla.", "Your card is already paid in Square: here you just give it a design and get the link to send it.");
    preview(true);
    if (window.MELY_LENIS) window.MELY_LENIS.scrollTo(".gc", { offset: -80 }); else $(".gc").scrollIntoView({ behavior: "smooth" });
  }
  function unlink() {
    if (!linked) return;
    linked = null; issued = null;
    document.body.classList.remove("is-gc-linked");
    $("[data-gc-linked]").hidden = true;
    if (PAY) $("[data-gc-pay]").hidden = false;
    preview();
  }
  $("[data-gc-unlink]").addEventListener("click", unlink);
  var preGan = (params.get("tarjeta") || "").replace(/\s/g, "");
  if (/^[A-Za-z0-9]{8,20}$/.test(preGan)) {
    checkBalance(preGan).then(function (r) { var bal = r && r.balance === null && DEMO ? 100 : r && r.balance; if (r && r.found && r.state === "ACTIVE" && bal > 0) link(preGan, bal); }).catch(function () {});
  }

  // paso de pago
  if (PAY) {
    $("[data-gc-pay]").hidden = false;
    if (DEMO) $("#gc-card-container").innerHTML = '<p class="note" style="margin:0">' + t("Modo demostración: aquí va el formulario de tarjeta de Square. No se cobra nada.", "Demo mode: Square’s card form goes here. Nothing is charged.") + "</p>";
    else if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en, o) { if (en[0].isIntersecting) { loadSquare(); o.disconnect(); } }, { rootMargin: "400px" }).observe($("[data-gc-pay]"));
    } else loadSquare();
  }
  function modeTexts() {
    var btn = form.querySelector('button[type="submit"] span');
    btn.textContent = PAY ? t("Pagar ", "Pay ") + "$" + (value() || "—") + t(" y activar", " and activate") : t("Pedir mi gift card", "Order my gift card");
    var how = form.querySelector(".gc-summary .note");
    how.textContent = PAY ? t("Al pagar, Square crea tu gift card al instante. Te llega el recibo de Square y recibes tu diseño con el número de la tarjeta.", "When you pay, Square creates your gift card instantly. You get Square’s receipt and your design with the card number.")
      : t("Al pedirla se abre WhatsApp con todos los datos para mí. Te confirmo el pago y activo tu gift card de Square; no se cobra nada desde esta web.", "Ordering opens WhatsApp with all the details for me. I’ll confirm payment and activate your Square gift card; nothing is charged on this website.");
  }
  var _preview = preview;
  preview = function (a) { _preview(a); if (!shared && !linked) modeTexts(); };

  render();
  document.addEventListener("langchange", render);
})();
