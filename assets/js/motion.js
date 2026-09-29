/* ============================================================
   Nails by MelyG — motion
   GSAP + ScrollTrigger + SplitText + Lenis (desde CDN).
   Si no cargan o la persona prefiere menos movimiento, la web
   queda estática y completa (main.js hace un revelado simple).
   ============================================================ */
(function () {
  "use strict";
  var doc = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var g = window.gsap, ST = window.ScrollTrigger, Split = window.SplitText;

  var entering = doc.classList.contains("is-entering");
  function done() { doc.classList.remove("motion-wait"); }

  if (!g || !ST || reduce) {
    doc.classList.add("no-gsap");
    doc.classList.remove("motion-wait", "is-entering");
    try { sessionStorage.removeItem("mely-nav"); } catch (e) {}
    var ld = document.querySelector(".loader"); if (ld) ld.remove();
    return;
  }

  // con secciones fijadas, la restauración del navegador deja posiciones erróneas
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (!location.hash) scrollTo(0, 0);
  g.registerPlugin(ST);
  if (Split) g.registerPlugin(Split);
  doc.classList.add("has-gsap");
  var E = "expo.out", E2 = "power4.out";

  /* ---------- Scroll suave ---------- */
  var lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true });
    lenis.on("scroll", ST.update);
    g.ticker.add(function (t) { lenis.raf(t * 1000); });
    g.ticker.lagSmoothing(0);
    window.MELY_LENIS = lenis;
    // anclas internas con desplazamiento suave y margen del header
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href*="#"]');
      if (!a || a.target) return;
      var url = new URL(a.href, location.href);
      if (url.pathname !== location.pathname || !url.hash) return;
      var el = document.querySelector(url.hash);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: url.hash === "#main" ? 0 : -70, duration: 1.4 });
      history.replaceState(null, "", url.hash);
    });
    // pausar con el menú de teléfono o diálogos abiertos
    var menu = document.getElementById("mobile-menu");
    if (menu) new MutationObserver(function () { menu.classList.contains("open") ? lenis.stop() : lenis.start(); }).observe(menu, { attributes: true, attributeFilter: ["class"] });
    document.querySelectorAll("dialog").forEach(function (d) {
      new MutationObserver(function () { d.open ? lenis.stop() : lenis.start(); }).observe(d, { attributes: true, attributeFilter: ["open"] });
    });
  }

  /* ---------- Utilidades ---------- */
  function splitLines(el, vars) {
    vars = vars || {};
    if (!Split) return g.from(el, Object.assign({ y: 40, autoAlpha: 0, duration: 1.1, ease: E }, vars, { stagger: 0 }));
    var sp = Split.create(el, { type: "lines", mask: "lines", linesClass: "split-line" });
    var first = sp.lines[0];
    return g.from(sp.lines, Object.assign({ yPercent: 110, duration: 1.25, ease: E, stagger: .09 }, vars, {
      // al terminar se devuelve el texto original (se reajusta solo y no choca con el cambio de idioma)
      onComplete: function () { if (first && el.contains(first)) sp.revert(); }
    }));
  }

  /* ---------- Portada: precarga + entrada ---------- */
  var loader = document.querySelector(".loader");
  var heroTitle = document.querySelector("[data-hero-title]");

  function heroIntro(delay) {
    if (!heroTitle) { done(); return; }
    var tl = g.timeline({ delay: delay || 0, onStart: done });
    tl.add(splitLines(heroTitle, { yPercent: 120, duration: 1.5, stagger: .12 }) || g.timeline(), 0);
    tl.from("[data-hero-fade]", { y: 34, autoAlpha: 0, duration: 1.2, ease: E, stagger: .1 }, .35);
    var photo = document.querySelector("[data-hero-photo]");
    if (photo) {
      tl.fromTo(photo, { clipPath: "inset(100% 0% 0% 0% round 999px 999px 2px 2px)" }, { clipPath: "inset(0% 0% 0% 0% round 999px 999px 2px 2px)", duration: 1.6, ease: "expo.inOut" }, 0);
      tl.from(photo.querySelector("img"), { scale: 1.35, duration: 2, ease: E }, .2);
    }
    tl.from("[data-hero-tag]", { x: -40, autoAlpha: 0, duration: 1.1, ease: E }, 1);
    tl.from(".float-nail", { y: 120, rotate: "+=40", autoAlpha: 0, duration: 1.4, ease: "back.out(1.4)", stagger: .12 }, .9);
    tl.from(".scroll-cue", { autoAlpha: 0, duration: 1 }, 1.4);
    return tl;
  }

  var firstVisit = false;
  try { firstVisit = !sessionStorage.getItem("mely-loaded"); sessionStorage.setItem("mely-loaded", "1"); } catch (e) {}
  if (loader && firstVisit && !entering) {
    loader.classList.add("run");
    if (lenis) lenis.stop();
    var cnt = loader.querySelector(".count"), o = { v: 0 };
    var nailHost = loader.querySelector("[data-nail]");
    var lt = g.timeline();
    lt.from(loader.querySelector(".loader-nail"), { y: 60, autoAlpha: 0, duration: .8, ease: E2 })
      .from(loader.querySelector("img"), { y: 20, autoAlpha: 0, duration: .8, ease: E2 }, .15)
      .add(function () { if (nailHost && nailHost._nail) nailHost._nail.paint("#662E3A"); }, .35)
      .to(o, { v: 100, duration: 1.3, ease: "power2.inOut", onUpdate: function () { cnt.textContent = Math.round(o.v); } }, .2)
      .to(loader, { clipPath: "inset(0% 0% 100% 0% round 0 0 50% 50%)", duration: 1.1, ease: "expo.inOut" }, "+=.15")
      .add(function () { loader.remove(); if (lenis) lenis.start(); });
    heroIntro(lt.duration() - .75);
  } else {
    if (loader) loader.remove();
    heroIntro(entering ? .45 : .05);
  }

  /* ---------- Cortina entre páginas ---------- */
  var curtain = document.querySelector(".curtain");
  if (curtain && entering) {
    g.fromTo(curtain, { clipPath: "inset(0% 0% 0% 0% round 0% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 100% 0% round 0% 0% 50% 50%)", duration: 1, ease: "expo.inOut", delay: .05 });
  }
  doc.classList.remove("is-entering");
  try { sessionStorage.removeItem("mely-nav"); } catch (e) {}
  document.addEventListener("click", function (e) {
    if (!curtain || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    var a = e.target.closest("a[href]");
    if (!a || a.target || a.hasAttribute("download") || a.hasAttribute("data-wa")) return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
    if (!/\.html$|\/$/.test(url.pathname)) return;
    e.preventDefault();
    try { sessionStorage.setItem("mely-nav", "1"); } catch (err) {}
    g.fromTo(curtain, { clipPath: "inset(100% 0% 0% 0% round 50% 50% 0 0)" }, {
      clipPath: "inset(0% 0% 0% 0% round 0% 0% 0 0)", duration: .75, ease: "expo.inOut",
      onComplete: function () { location.href = url.href; }
    });
  });
  addEventListener("pageshow", function (e) { if (e.persisted && curtain) g.set(curtain, { clipPath: "inset(100% 0% 0% 0%)" }); });

  /* ---------- Titulares por líneas ---------- */
  function onFonts(fn) { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fn); }
  onFonts(function () {
    document.querySelectorAll("[data-split]").forEach(function (el) {
      splitLines(el, { scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    });
    // frase grande: palabras que se encienden con el scroll
    document.querySelectorAll("[data-statement]").forEach(function (el) {
      if (!Split) return;
      var sp = Split.create(el, { type: "words", wordsClass: "word" });
      g.fromTo(sp.words, { opacity: .12, y: 20 }, { opacity: 1, y: 0, stagger: .12, ease: "none", scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 45%", scrub: true } });
    });
    ST.refresh();
  });

  /* ---------- Revelados generales ---------- */
  var reveals = g.utils.toArray(".reveal").filter(function (el) { return !el.closest("[data-hero-fade]"); });
  g.set(reveals, { autoAlpha: 0, y: 36 });
  ST.batch(reveals, { start: "top 90%", once: true, onEnter: function (b) { g.to(b, { autoAlpha: 1, y: 0, duration: 1.1, ease: E, stagger: .08, overwrite: true }); } });

  document.querySelectorAll(".eyebrow").forEach(function (el) {
    if (el.closest("[data-hero-fade], .page-hero") || el.hasAttribute("data-hero-fade")) return;
    g.from(el, { autoAlpha: 0, x: -20, duration: 1, ease: E, scrollTrigger: { trigger: el, start: "top 92%", once: true } });
  });

  // fotos que se abren con forma de arco
  document.querySelectorAll("[data-clip]").forEach(function (el) {
    var img = el.querySelector("img");
    var tl = g.timeline({ scrollTrigger: { trigger: el, start: "top 85%", once: true } });
    tl.fromTo(el, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.6, ease: "expo.inOut" });
    if (img) tl.from(img, { scale: 1.3, duration: 2, ease: E }, 0);
  });

  // parallax en imágenes
  document.querySelectorAll("[data-parallax]").forEach(function (img) {
    var v = parseFloat(img.getAttribute("data-parallax")) || -10;
    var box = img.closest("[data-clip], .hero-photo") || img.parentElement;
    g.fromTo(img, { yPercent: v }, { yPercent: 0, ease: "none", scrollTrigger: { trigger: box, start: "top bottom", end: "bottom top", scrub: true } });
  });

  // fichas y elementos escalonados
  document.querySelectorAll("[data-stagger]").forEach(function (wrap) {
    var items = wrap.children;
    g.from(items, { y: 90, autoAlpha: 0, duration: 1.3, ease: E, stagger: .14, scrollTrigger: { trigger: wrap, start: "top 85%", once: true } });
    wrap.querySelectorAll("[data-nail]").forEach(function (n, i) {
      g.from(n, { yPercent: 45, rotate: i % 2 ? 8 : -8, duration: 1.6, ease: E, delay: .25 + i * .14, scrollTrigger: { trigger: wrap, start: "top 85%", once: true } });
    });
  });

  /* ---------- Uñas flotantes del hero ---------- */
  var floats = g.utils.toArray("[data-float]");
  floats.forEach(function (f) {
    var s = parseFloat(f.getAttribute("data-float")) || 1;
    g.to(f, { yPercent: -60 * s, rotate: "+=" + 14 * s, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    g.to(f.firstElementChild, { y: 10 * s, duration: 2.4 + Math.abs(s), ease: "sine.inOut", yoyo: true, repeat: -1 });
  });
  if (fine && floats.length) {
    var qs = floats.map(function (f) {
      return { f: parseFloat(f.getAttribute("data-float")) || 1, x: g.quickTo(f.firstElementChild, "x", { duration: 1.2, ease: E2 }) };
    });
    addEventListener("pointermove", function (e) {
      var nx = e.clientX / innerWidth - .5;
      qs.forEach(function (q) { q.x(nx * 34 * q.f); });
    });
  }

  /* ---------- Marquesina que reacciona al scroll ---------- */
  var track = document.querySelector("[data-marquee]");
  if (track) {
    var grp = track.firstElementChild;
    track.appendChild(grp.cloneNode(true));
    var x = 0, dir = 1, speed = .6;
    g.ticker.add(function () {
      var w = grp.offsetWidth;
      var vel = lenis ? lenis.velocity : 0;
      if (vel > .2) dir = 1; else if (vel < -.2) dir = -1;
      x -= (speed + Math.min(Math.abs(vel) * .35, 14)) * dir;
      if (x <= -w) x += w;
      if (x > 0) x -= w;
      track.style.transform = "translate3d(" + x + "px,0,0)";
    });
    g.from(".marquee", { yPercent: 40, autoAlpha: 0, duration: 1.2, ease: E, scrollTrigger: { trigger: ".marquee", start: "top 95%", once: true } });
  }

  /* ---------- La técnica: pasos que se encienden ---------- */
  var steps = document.querySelector("[data-steps]");
  if (steps) {
    steps.querySelectorAll("li").forEach(function (li) {
      ST.create({ trigger: li, start: "top 62%", end: "bottom 38%", toggleClass: "active" });
      g.from(li.querySelector("h3"), { x: 40, duration: 1.2, ease: E, scrollTrigger: { trigger: li, start: "top 75%", once: true } });
    });
    var line = steps.querySelector(".technique-line");
    if (line) ST.create({ trigger: steps, start: "top 60%", end: "bottom 60%", scrub: true, onUpdate: function (s) { line.style.setProperty("--p", s.progress.toFixed(3)); } });
  }

  /* ---------- Estudio: las uñas y los controles se ven al instante (sin entrada) ---------- */

  /* ---------- Looks: scroll horizontal fijado (escritorio) ---------- */
  var looks = document.querySelector("[data-looks]");
  var lTrack = document.querySelector("[data-looks-track]");
  var lBar = document.querySelector("[data-looks-bar]");
  if (looks && lTrack) {
    var mm = g.matchMedia();
    mm.add("(min-width: 1000px)", function () {
      var dist = function () { return Math.max(0, lTrack.scrollWidth - innerWidth); };
      g.to(lTrack, {
        x: function () { return -dist(); }, ease: "none",
        scrollTrigger: {
          trigger: looks, start: "top top", end: function () { return "+=" + dist(); },
          pin: true, scrub: 1, invalidateOnRefresh: true,
          onUpdate: function (s) { if (lBar) lBar.style.setProperty("--p", (.15 + s.progress * .85).toFixed(3)); }
        }
      });
      g.utils.toArray(".look .ph img").forEach(function (img) {
        g.fromTo(img, { xPercent: 6 }, { xPercent: -6, ease: "none", scrollTrigger: { trigger: looks, start: "top top", end: function () { return "+=" + dist(); }, scrub: true } });
      });
    });
    mm.add("(max-width: 999px)", function () {
      if (window.MELY_CAROUSEL) window.MELY_CAROUSEL(lTrack, document.querySelector("[data-looks-prev]"), document.querySelector("[data-looks-next]"), lBar);
    });
    g.from(".look", { y: 80, autoAlpha: 0, duration: 1.3, ease: E, stagger: .1, scrollTrigger: { trigger: lTrack, start: "top 88%", once: true } });
  }

  /* ---------- Reseñas ---------- */
  var rev = document.querySelector("[data-carousel]");
  if (rev) g.from(rev.children, { x: 120, autoAlpha: 0, duration: 1.3, ease: E, stagger: .08, scrollTrigger: { trigger: rev, start: "top 88%", once: true } });
  g.utils.toArray(".score .stars svg").forEach(function (s, i) {
    g.from(s, { scale: 0, rotate: -90, duration: .8, ease: "back.out(2.5)", delay: .3 + i * .08, scrollTrigger: { trigger: ".score", start: "top 90%", once: true } });
  });

  /* ---------- Contadores ---------- */
  document.querySelectorAll("[data-count]").forEach(function (el) {
    var end = parseFloat(el.getAttribute("data-count")), dec = +(el.getAttribute("data-decimals") || 0);
    var fmt = el.hasAttribute("data-format");
    var o = { v: 0 };
    var paint = function () { el.textContent = fmt ? Math.round(o.v).toLocaleString("en-US") : o.v.toFixed(dec); };
    paint();
    g.to(o, { v: end, duration: 2, ease: "power3.out", onUpdate: paint, scrollTrigger: { trigger: el, start: "top 92%", once: true } });
  });

  /* ---------- CTA final ---------- */
  var nb = document.querySelector(".nail-btn");
  if (nb) {
    g.from(nb, { scale: .3, rotate: -20, autoAlpha: 0, duration: 1.6, ease: "elastic.out(1, .55)", scrollTrigger: { trigger: nb, start: "top 92%", once: true } });
    g.to(nb, { y: -8, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
  }
  g.from(".site-footer .grid > *", { y: 40, autoAlpha: 0, duration: 1.1, ease: E, stagger: .08, scrollTrigger: { trigger: ".site-footer", start: "top 90%", once: true } });

  /* ---------- Botones magnéticos ---------- */
  if (fine) {
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      var k = parseFloat(el.getAttribute("data-magnetic")) || .3;
      var xTo = g.quickTo(el, "x", { duration: .8, ease: "elastic.out(1, .4)" });
      var yTo = g.quickTo(el, "y", { duration: .8, ease: "elastic.out(1, .4)" });
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * k);
        yTo((e.clientY - r.top - r.height / 2) * k);
      });
      el.addEventListener("pointerleave", function () { xTo(0); yTo(0); });
    });
  }

  /* ---------- Cursor con forma de uña ---------- */
  var cur = document.querySelector(".cursor");
  if (cur && fine) {
    doc.classList.add("has-cursor");
    var label = cur.querySelector("span");
    var cx = g.quickTo(cur, "x", { duration: .45, ease: E2 }), cy = g.quickTo(cur, "y", { duration: .45, ease: E2 });
    var rot = g.quickTo(cur, "rotation", { duration: .6, ease: E2 });
    var px = 0;
    addEventListener("pointermove", function (e) {
      cx(e.clientX); cy(e.clientY);
      rot(g.utils.clamp(-25, 25, (e.clientX - px) * 1.2)); px = e.clientX;
    });
    document.addEventListener("pointerover", function (e) {
      var t = e.target;
      var lab = t.closest("[data-cursor]");
      var link = t.closest("a, button, label, summary, [role=button]");
      var hide = t.closest("iframe, input, textarea, select, .map");
      cur.classList.toggle("is-label", !!lab);
      cur.classList.toggle("is-link", !lab && !!link);
      cur.classList.toggle("is-hidden", !!hide);
      if (lab) label.textContent = lab.getAttribute("data-cursor");
    });
    document.addEventListener("pointerleave", function () { cur.classList.add("is-hidden"); });
    document.addEventListener("pointerenter", function () { cur.classList.remove("is-hidden"); });
  }

  /* ---------- Cabecera de páginas interiores ---------- */
  var ph = document.querySelector(".page-hero");
  if (ph) {
    var h1 = ph.querySelector("h1");
    var tl = g.timeline({ delay: entering ? .45 : .1, onStart: done });
    if (h1) tl.add(splitLines(h1, { yPercent: 120, duration: 1.4 }) || g.timeline(), 0);
    tl.from(ph.querySelectorAll(".eyebrow, .lead"), { y: 30, autoAlpha: 0, duration: 1.1, ease: E, stagger: .1 }, .3);
  }

  // recalcular cuando cargan imágenes perezosas; luego, ir al ancla si la hay
  addEventListener("load", function () {
    ST.refresh();
    if (location.hash && lenis) {
      var target = document.querySelector(location.hash);
      if (target) setTimeout(function () { lenis.scrollTo(target, { offset: -70, duration: 1.6 }); }, 350);
    }
  });
})();
