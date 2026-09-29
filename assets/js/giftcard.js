/* ============================================================
   Nails by MelyG — diseñador de gift cards
   La persona elige monto (o un servicio), fondo, color del esmalte,
   para quién, de quién, mensaje y cómo recibirla. La tarjeta se
   dibuja en vivo con un código único y el pedido llega a Mely por
   WhatsApp (o por correo si config.email está puesto). No se cobra
   nada desde la web: Mely confirma el pago y envía la tarjeta.
   ============================================================ */
(function () {
  "use strict";
  var form = document.querySelector("[data-gc-form]");
  if (!form) return;
  var C = window.MELY_CONFIG, D = window.MELY_DATA, I = window.MELY_I18N, N = window.MELY_NAIL;
  var t = function (es, en) { return I.t(es, en); };
  var $ = function (s, r) { return (r || document).querySelector(s); };

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
  var S = { mode: "amount", amount: 75, custom: "", service: "mani-gel", theme: "burdeos", polish: 0, to: "", from: "", msg: "", via: "whatsapp", contact: "", direct: false };
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
    if (S.mode === "service") { amt.textContent = svc()[I.lang][0]; amt.classList.add("is-service"); }
    else { amt.textContent = "$" + (value() || "—"); amt.classList.remove("is-service"); }
    $("[data-gc-code]").textContent = code;
    $("[data-gc-count]").textContent = (S.msg || "").length + "/120";
    var p = POLISH[S.polish] || POLISH[0];
    nail.set({ finish: p.finish || "gloss", polish: p.c, animate: !!animate });
    $("[data-gc-summary]").innerHTML = "<b>" + valueLabel() + "</b> · " + t("para ", "for ") + escapeHtml(to) +
      " · " + (S.via === "email" ? t("por correo", "by email") : t("por WhatsApp", "by WhatsApp"));
    save();
  }
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
      "• " + t("Código: ", "Code: ") + code,
      "",
      t("¿Cómo te hago el pago?", "How can I pay?")
    ].join("\n");
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) return;
    var txt = orderText();
    var wa = window.MELY_WA(txt);
    var done = $("[data-gc-done]");
    $("[data-gc-wa]").href = wa;
    var mail = $("[data-gc-mail]");
    if (C.email) { mail.hidden = false; mail.href = "mailto:" + C.email + "?subject=" + encodeURIComponent("Gift card " + code) + "&body=" + encodeURIComponent(txt); }
    window.open(wa, "_blank", "noopener");
    form.querySelectorAll(".gc-step, .gc-summary").forEach(function (el) { el.hidden = true; });
    done.hidden = false;
    done.focus();
    if (window.MELY_LENIS) window.MELY_LENIS.scrollTo(".gc", { offset: -80 }); else done.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("[data-gc-again]").addEventListener("click", function () {
    code = "MG-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    S.code = code; S.to = ""; S.msg = ""; S.contact = "";
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
  $("[data-gc-download]").addEventListener("click", function () {
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
      x.fillStyle = accent; x.font = "500 26px monospace"; x.fillText(code, 1510, 900); x.textAlign = "left";
      if (nimg) { x.save(); x.translate(1330, 360); x.rotate(.3); x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 40; x.shadowOffsetY = 20; x.drawImage(nimg, -112, -246, 224, 492); x.restore(); }
      var a = document.createElement("a");
      a.download = "gift-card-nails-by-melyg-" + code + ".png";
      a.href = cv.toDataURL("image/png");
      document.body.appendChild(a); a.click(); a.remove();
    });
  });

  render();
  document.addEventListener("langchange", render);
})();
