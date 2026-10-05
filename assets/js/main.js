/* ============================================================
   Nails by MelyG — comportamiento común
   Idioma (ES/EN), menú, barra fija, horario, servicios, cursos.
   ============================================================ */
(function () {
  "use strict";
  var C = window.MELY_CONFIG, D = window.MELY_DATA, EN = window.MELY_EN || {};
  var doc = document.documentElement;
  doc.classList.remove("no-js");
  doc.classList.add("js");

  /* ---------- Idioma ---------- */
  var original = new WeakMap(), originalAttrs = new WeakMap();
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function initialLang() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q === "es" || q === "en") return q;
    var s = read("mely-lang");
    if (s === "es" || s === "en") return s;
    return deviceLang();
  }
  // idioma del dispositivo: el primero de su lista que sea español o inglés
  function deviceLang() {
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    for (var i = 0; i < list.length; i++) {
      if (/^es\b/i.test(list[i])) return "es";
      if (/^en\b/i.test(list[i])) return "en";
    }
    return "en";
  }
  var autoLang = !new URLSearchParams(location.search).get("lang") && !read("mely-lang");

  var I18N = {
    lang: initialLang(),
    t: function (es, en) { return I18N.lang === "en" ? en : es; },
    set: function (lang) {
      I18N.lang = lang;
      doc.lang = lang;
      store("mely-lang", lang);
      document.querySelectorAll("[data-i18n]").forEach(function (el) {
        if (!original.has(el)) original.set(el, el.innerHTML);
        var key = el.getAttribute("data-i18n");
        el.innerHTML = lang === "en" && EN[key] != null ? EN[key] : original.get(el);
      });
      document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
        el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
          var p = pair.split(":"), attr = p[0], key = p[1];
          var saved = originalAttrs.get(el) || {};
          if (!(attr in saved)) { saved[attr] = el.getAttribute(attr) || ""; originalAttrs.set(el, saved); }
          el.setAttribute(attr, lang === "en" && EN[key] != null ? EN[key] : saved[attr]);
        });
      });
      if (EN["meta.title." + document.body.dataset.page] && lang === "en") document.title = EN["meta.title." + document.body.dataset.page];
      else if (document.body.dataset.titleEs) document.title = document.body.dataset.titleEs;
      document.querySelectorAll("[data-lang]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
      });
      document.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
    }
  };
  window.MELY_I18N = I18N;
  document.body.dataset.titleEs = document.title;

  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-lang]");
    if (b) { I18N.set(b.dataset.lang); hideHint(); }
  });

  /* ---------- Menú de teléfono ---------- */
  var menu = document.getElementById("mobile-menu");
  var openBtn = document.querySelector("[data-menu-open]");
  function toggleMenu(open) {
    if (!menu) return;
    menu.classList.toggle("open", open);
    menu.setAttribute("aria-hidden", String(!open));
    if (openBtn) openBtn.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
    if (open) { var f = menu.querySelector("button, a"); if (f) f.focus(); }
    else if (openBtn) openBtn.focus();
  }
  if (openBtn) openBtn.addEventListener("click", function () { toggleMenu(true); });
  document.querySelectorAll("[data-menu-close]").forEach(function (b) { b.addEventListener("click", function () { toggleMenu(false); }); });
  if (menu) {
    menu.querySelectorAll("nav a").forEach(function (a) { a.addEventListener("click", function () { toggleMenu(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.classList.contains("open")) toggleMenu(false); });
  }

  /* ---------- Barra fija (teléfono) ---------- */
  var bar = document.querySelector(".mobile-bar");
  var header = document.querySelector("[data-header]") || document.querySelector(".site-header");
  var progress = header && header.querySelector(".progress");
  var lastY = window.scrollY;
  if (bar) document.body.classList.add("has-bar");
  function onScroll() {
    var y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.classList.toggle("show", y > 240);
    if (header) {
      header.classList.toggle("is-scrolled", y > 12);
      // se esconde al bajar y vuelve al subir
      var menuOpen = menu && menu.classList.contains("open");
      if (!menuOpen) header.classList.toggle("is-hidden", y > 420 && y > lastY + 2);
      if (y < lastY - 2) header.classList.remove("is-hidden");
      doc.classList.toggle("hdr-hidden", header.classList.contains("is-hidden"));
    }
    if (progress) progress.style.setProperty("--p", max > 0 ? (y / max).toFixed(4) : 0);
    lastY = y;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  // al enfocar algo con teclado, el header vuelve
  if (header) header.addEventListener("focusin", function () { header.classList.remove("is-hidden"); });

  /* ---------- Enlaces de WhatsApp ---------- */
  function waLink(text) { return "https://wa.me/" + C.whatsapp + (text ? "?text=" + encodeURIComponent(text) : ""); }
  window.MELY_WA = waLink;
  function refreshWa() {
    document.querySelectorAll("[data-wa]").forEach(function (a) {
      var key = a.getAttribute("data-wa");
      var msgs = {
        hello: I18N.t("Hola Mely, tengo una pregunta.", "Hi Mely, I have a question."),
        russian: I18N.t("Hola Mely, me interesa el curso de Manicura Rusa. ¿Qué fechas tienes disponibles?", "Hi Mely, I'm interested in the Russian Manicure course. What dates do you have available?"),
        gift: I18N.t("Hola Mely, quiero regalar una gift card. ¿Cómo funciona?", "Hi Mely, I’d like to buy a gift card. How does it work?"),
        color: I18N.t("Hola Mely, busco un tono en particular. ¿Lo tienes?", "Hi Mely, I’m looking for a specific shade. Do you have it?"),
        gelx: I18N.t("Hola Mely, me interesa el curso de Gel-X. ¿Qué fechas tienes disponibles?", "Hi Mely, I'm interested in the Gel-X course. What dates do you have available?")
      };
      a.href = waLink(msgs[key] || msgs.hello);
      a.target = "_blank"; a.rel = "noopener";
    });
  }

  /* ---------- Horario ---------- */
  function fmtHour(h) {
    var p = h.split(":"), hh = +p[0], mm = p[1], h12 = hh % 12 || 12;
    return h12 + (mm !== "00" ? ":" + mm : "") + (hh < 12 ? " AM" : " PM");
  }
  function fmtHourEs(h) {
    var p = h.split(":"), hh = +p[0], mm = p[1], h12 = hh % 12 || 12;
    return h12 + (mm !== "00" ? ":" + mm : "") + (hh < 12 ? " a. m." : " p. m.");
  }
  function renderHours() {
    var list = document.querySelectorAll("[data-hours]");
    if (!list.length) return;
    var namesEs = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    var namesEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var today = Number(new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, weekday: "short" }).format(new Date()).replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/, function (m) { return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[m]; }));
    var order = [1, 2, 3, 4, 5, 6, 0];
    list.forEach(function (ul) {
      ul.innerHTML = "";
      order.forEach(function (d) {
        var h = D.hours[d], li = document.createElement("li");
        if (d === today) { li.className = "today"; li.setAttribute("aria-current", "date"); }
        var f = I18N.lang === "en" ? fmtHour : fmtHourEs;
        li.innerHTML = "<span>" + (I18N.lang === "en" ? namesEn : namesEs)[d] + "</span><span>" +
          (h ? f(h[0]) + " – " + f(h[1]) : I18N.t("Cerrado", "Closed")) + "</span>";
        ul.appendChild(li);
      });
    });
  }

  /* ---------- Menú de servicios (servicios.html) ---------- */
  function money(n) { return "$" + n; }
  window.MELY_MONEY = money;
  function dur(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : "");
  }
  window.MELY_DUR = dur;
  function renderMenu() {
    var root = document.getElementById("menu");
    if (!root) return;
    root.innerHTML = "";
    D.groups.forEach(function (g) {
      var sec = document.createElement("section");
      sec.className = "menu-group reveal in";
      sec.setAttribute("aria-labelledby", "g-" + g.id);
      var items = D.services.filter(function (s) { return s.group === g.id; }).map(function (s) {
        var tx = s[I18N.lang];
        return '<li class="menu-item"><div><h3>' + tx[0] + '</h3><p class="meta">' + tx[1] + " · " + dur(s.min) +
          '</p></div><span class="price">' + money(s.price) + '</span>' +
          (s.addon ? "" : '<a href="reservar.html?servicio=' + s.id + '">' + I18N.t("Reservar", "Book") + "</a>") + "</li>";
      }).join("");
      sec.innerHTML = '<h2 id="g-' + g.id + '">' + g[I18N.lang] + '</h2><ul class="menu-list">' + items + "</ul>";
      root.appendChild(sec);
    });
  }

  /* ---------- Revelado al hacer scroll ---------- */
  function reveal() {
    var els = document.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach(function (el) {
      var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      if (!el.style.getPropertyValue("--i")) el.style.setProperty("--i", Math.min(sib, 4));
      io.observe(el);
    });
  }

  /* ---------- Año ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Abierto / cerrado ahora (hora de Houston) ---------- */
  function nowInTz() {
    var p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { d: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), m: (+p.hour % 24) * 60 + +p.minute };
  }
  function toMin(h) { var p = h.split(":"); return +p[0] * 60 + +p[1]; }
  function renderStatus() {
    var els = document.querySelectorAll("[data-status]");
    if (!els.length) return;
    var n = nowInTz(), h = D.hours[n.d], f = I18N.lang === "en" ? fmtHour : fmtHourEs, html, open = false;
    if (h && n.m >= toMin(h[0]) && n.m < toMin(h[1])) {
      open = true;
      html = "<b>" + I18N.t("Abierto ahora", "Open now") + "</b> · " + I18N.t("cierra a las ", "closes at ") + f(h[1]);
    } else {
      var namesEs = ["el domingo", "el lunes", "el martes", "el miércoles", "el jueves", "el viernes", "el sábado"];
      var namesEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      for (var k = 0; k < 8; k++) {
        var d = (n.d + k) % 7, hh = D.hours[d];
        if (!hh || (k === 0 && n.m >= toMin(hh[0]))) continue;
        var when = k === 0 ? I18N.t("hoy", "today") : k === 1 ? I18N.t("mañana", "tomorrow") : I18N.t(namesEs[d], namesEn[d]);
        html = "<b>" + I18N.t("Cerrado", "Closed") + "</b> · " + I18N.t("abre ", "opens ") + when + I18N.t(" a las ", " at ") + f(hh[0]);
        break;
      }
    }
    els.forEach(function (el) { el.innerHTML = html; el.classList.toggle("open", open); });
  }
  setInterval(renderStatus, 60000);

  /* ---------- Aviso breve ---------- */
  var toastEl = document.querySelector(".toast"), toastT;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2400);
  }
  window.MELY_TOAST = toast;

  /* ---------- Copiar dirección ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy]");
    if (!b) return;
    var txt = b.getAttribute("data-copy");
    var done = function () { toast(I18N.t("Dirección copiada", "Address copied")); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, function () { toast(txt); });
    else toast(txt);
  });

  /* ---------- Carrusel arrastrable (reseñas y looks en teléfono) ---------- */
  function carousel(track, prev, next, barEl) {
    if (!track) return;
    var step = function () { var c = track.firstElementChild; return c ? c.getBoundingClientRect().width + 20 : 300; };
    if (prev) prev.addEventListener("click", function () { track.scrollBy({ left: -step(), behavior: "smooth" }); });
    if (next) next.addEventListener("click", function () { track.scrollBy({ left: step(), behavior: "smooth" }); });
    var update = function () {
      var max = track.scrollWidth - track.clientWidth;
      var vis = track.clientWidth / track.scrollWidth;
      if (barEl) barEl.style.setProperty("--p", Math.min(1, vis + (max > 0 ? track.scrollLeft / max : 0) * (1 - vis)).toFixed(3));
      if (prev) prev.disabled = track.scrollLeft < 4;
      if (next) next.disabled = track.scrollLeft > max - 4;
    };
    track.addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
    // arrastre con ratón (el táctil ya es nativo)
    var down = false, sx = 0, sl = 0, moved = false;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse") return;
      down = true; moved = false; sx = e.clientX; sl = track.scrollLeft;
    });
    addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - sx;
      if (Math.abs(dx) > 5) { moved = true; track.classList.add("dragging"); }
      track.scrollLeft = sl - dx;
    });
    addEventListener("pointerup", function () {
      if (!down) return;
      down = false;
      track.classList.remove("dragging");
    });
    track.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); track.scrollBy({ left: step(), behavior: "smooth" }); }
      if (e.key === "ArrowLeft") { e.preventDefault(); track.scrollBy({ left: -step(), behavior: "smooth" }); }
    });
  }
  carousel(document.querySelector("[data-carousel]"), document.querySelector("[data-carousel-prev]"), document.querySelector("[data-carousel-next]"), document.querySelector("[data-carousel-bar]"));
  window.MELY_CAROUSEL = carousel;

  /* ---------- FAQ con apertura suave ---------- */
  document.querySelectorAll(".faq details").forEach(function (d) {
    var sum = d.querySelector("summary"), body = d.querySelector("p");
    if (!sum || !body || !body.animate) return;
    sum.addEventListener("click", function (e) {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      e.preventDefault();
      if (d.open) {
        var a = body.animate([{ height: body.offsetHeight + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" });
        body.style.overflow = "hidden";
        a.onfinish = function () { d.open = false; body.style.overflow = ""; };
      } else {
        d.open = true;
        var h = body.offsetHeight;
        body.style.overflow = "hidden";
        body.animate([{ height: "0px", opacity: 0 }, { height: h + "px", opacity: 1 }], { duration: 480, easing: "cubic-bezier(.22,1,.36,1)" })
          .onfinish = function () { body.style.overflow = ""; };
      }
    });
  });

  /* ---------- Pestañas del menú de servicios ---------- */
  function menuTabs() {
    var tabs = document.querySelector("[data-menu-tabs]");
    if (!tabs) return;
    tabs.innerHTML = D.groups.map(function (g) { return '<a href="#g-' + g.id + '" data-tab="' + g.id + '">' + g[I18N.lang] + "</a>"; }).join("");
    var links = tabs.querySelectorAll("a");
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.getAttribute("aria-labelledby").slice(2);
        links.forEach(function (l) { l.classList.toggle("active", l.dataset.tab === id); });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    document.querySelectorAll(".menu-group").forEach(function (g) { io.observe(g); });
  }

  /* ---------- Ficha del look (portada) ---------- */
  var LOOKS = {
    1: { img: ["look-animal"], svc: "mani-gel",
      es: ["Uñas recién hechas", "Manicura rusa con acabado de precisión: cutícula impecable, esmaltado al ras y brillo que dura.", [["Técnica", "Manicura rusa + gel"], ["Forma", "Almendra"], ["Diseño", "Animal print y french"], ["Tonos", "Nude · Marfil · Cacao"]]],
      en: ["Freshly done nails", "Russian manicure with a precision finish: flawless cuticles, polish to the edge and lasting shine.", [["Technique", "Russian manicure + gel"], ["Shape", "Almond"], ["Design", "Animal print & French"], ["Shades", "Nude · Ivory · Cocoa"]]] },
    2: { img: ["look-petroleo", "look-pedi"], svc: "pedi-gel",
      es: ["Mani & pedi", "El mismo tono en manos y pies, con la misma precisión. Un detalle pequeño que se nota en todo el look.", [["Técnica", "Manicura y pedicura rusa"], ["Forma", "Almendra / cuadrada"], ["Acabado", "Brillo espejo"], ["Tono", "Petróleo"]]],
      en: ["Mani & pedi", "The same shade on hands and feet, with the same precision. A small detail that shows in the whole look.", [["Technique", "Russian manicure & pedicure"], ["Shape", "Almond / square"], ["Finish", "Mirror shine"], ["Shade", "Petrol blue"]]] },
    3: { img: ["look-cromo"], svc: "mani-gel",
      es: ["Un diseño que hable por ti", "Mix & match con cromado: cada uña cuenta una parte de la historia.", [["Técnica", "Manicura rusa + gel"], ["Forma", "Almendra"], ["Diseño", "Mix & match cromado"], ["Tonos", "Cromo · Oliva · Perla · Rosa"]]],
      en: ["A design that speaks for you", "Chrome mix & match: every nail tells part of the story.", [["Technique", "Russian manicure + gel"], ["Shape", "Almond"], ["Design", "Chrome mix & match"], ["Shades", "Chrome · Olive · Pearl · Rose"]]] },
    4: { img: ["look-babyboomer"], svc: "mani-gel",
      es: ["Mirarte las manos y sonreír", "Un degradado suave, natural y elegante. De esos que combinan con todo y te duran impecables.", [["Técnica", "Manicura rusa + gel"], ["Forma", "Cuadrada suave"], ["Diseño", "Baby boomer"], ["Tonos", "Ballet · Blanco"]]],
      en: ["Look at your hands and smile", "A soft, natural and elegant fade. The kind that goes with everything and stays flawless.", [["Technique", "Russian manicure + gel"], ["Shape", "Soft square"], ["Design", "Baby boomer"], ["Shades", "Ballet · White"]]] },
    5: { img: ["look-cacao"], svc: "mani-gel",
      es: ["Burdeos profundo", "Un tono profundo y atemporal, con el brillo del gel y la cutícula perfecta de la técnica rusa.", [["Técnica", "Manicura rusa + gel"], ["Forma", "Ovalada corta"], ["Tono", "Burdeos"]]],
      en: ["Deep bordeaux", "A deep, timeless shade with gel shine and the perfect cuticle of the Russian technique.", [["Technique", "Russian manicure + gel"], ["Shape", "Short oval"], ["Shade", "Bordeaux"]]] }
  };
  var dlg = document.getElementById("look-dialog");
  if (dlg) {
    var q = function (sel) { return dlg.querySelector(sel); };
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-look]");
      if (!b) return;
      var L = LOOKS[b.getAttribute("data-look")], tx = L[I18N.lang];
      q("[data-dlg-pics]").innerHTML = L.img.map(function (n) {
        return '<picture><source srcset="assets/img/' + n + '.webp" type="image/webp"><img src="assets/img/' + n + '.jpg" alt=""></picture>';
      }).join("");
      q("[data-dlg-pics]").style.gridTemplateColumns = L.img.length > 1 ? "1fr 1fr" : "1fr";
      q("[data-dlg-num]").textContent = I18N.t("Ficha del look · ", "Look card · ") + "0" + b.getAttribute("data-look");
      q("[data-dlg-title]").textContent = tx[0];
      q("[data-dlg-text]").textContent = tx[1];
      q("[data-dlg-ficha]").innerHTML = tx[2].map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("");
      q("[data-dlg-book]").href = "reservar.html?servicio=" + L.svc + "&diseno=" + encodeURIComponent("Look 0" + b.getAttribute("data-look") + " · " + tx[0]);
      q("[data-dlg-wa]").href = waLink(I18N.t("Hola Mely, me encantó el look «", "Hi Mely, I loved the look “") + tx[0] + I18N.t("». ¿Me lo puedes hacer?", "”. Can you do it for me?"));
      dlg.showModal();
      dlg.scrollTop = 0;
      if (window.MELY_LENIS) window.MELY_LENIS.stop(); // el fondo no se mueve; la ficha se desliza por dentro
    });
    q("[data-close]").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", function () { if (window.MELY_LENIS) window.MELY_LENIS.start(); });
  }

  /* ---------- Aviso de idioma (primera visita) ---------- */
  // La web ya se abre en el idioma del dispositivo; este aviso deja cambiarlo con un toque.
  var hint = null;
  function hideHint() {
    try { localStorage.setItem("mely-lang", I18N.lang); } catch (e) {}
    if (hint) { hint.classList.remove("show"); setTimeout(function () { if (hint) hint.remove(); hint = null; }, 500); }
  }
  if (autoLang) {
    hint = document.createElement("div");
    hint.className = "lang-hint";
    hint.setAttribute("role", "region");
    hint.setAttribute("aria-label", "Idioma / Language");
    var other = I18N.lang === "es" ? "en" : "es";
    hint.innerHTML = '<span>' + (I18N.lang === "es" ? "Estás viendo la web en <b>español</b>" : "You’re viewing the site in <b>English</b>") + "</span>" +
      '<button type="button" data-lang="' + other + '">' + (other === "en" ? "View in English" : "Ver en español") + "</button>" +
      '<button type="button" class="x" data-hint-close aria-label="' + (I18N.lang === "es" ? "Cerrar" : "Close") + '">×</button>';
    document.body.appendChild(hint);
    setTimeout(function () { if (hint) hint.classList.add("show"); }, 2600);
    setTimeout(function () { if (hint && !hint.matches(":hover, :focus-within")) hideHint(); }, 14000);
    hint.querySelector("[data-hint-close]").addEventListener("click", hideHint);
  }

  /* ---------- Vídeos: solo se reproducen a la vista ---------- */
  var vids = document.querySelectorAll("video[data-autoplay]");
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
  vids.forEach(function (v) {
    if (calm) { v.controls = true; v.preload = "metadata"; }
  });
  if (!calm && vids.length && "IntersectionObserver" in window) {
    var inView = [];
    var tryPlay = function (v) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); };
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) {
          if (inView.indexOf(v) < 0) inView.push(v);
          if (v.preload === "none") v.preload = "auto";
          tryPlay(v);
        } else {
          inView = inView.filter(function (x) { return x !== v; });
          v.pause();
        }
      });
    }, { threshold: .35 });
    vids.forEach(function (v) { vio.observe(v); });
    // si el navegador bloqueó la reproducción (pestaña oculta, ahorro de batería), se reintenta
    var retry = function () { if (document.visibilityState === "visible") inView.forEach(function (v) { if (v.paused) tryPlay(v); }); };
    document.addEventListener("visibilitychange", retry);
    ["pointerdown", "touchstart", "keydown"].forEach(function (ev) { addEventListener(ev, retry, { passive: true }); });
  }

  document.addEventListener("langchange", function () { refreshWa(); renderHours(); renderMenu(); renderStatus(); menuTabs(); });
  I18N.set(I18N.lang);
  reveal();

})();
