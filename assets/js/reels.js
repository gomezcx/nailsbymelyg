/* ============================================================
   Nails by MelyG — reels en abanico ("stories")
   El reel activo va al centro y los demás se abren detrás en
   abanico. Pasa solo al siguiente cuando termina el vídeo, con
   barras de progreso como en las stories. Clic en un lateral,
   flechas, teclado o deslizar con el dedo para cambiar.
   ============================================================ */
(function () {
  "use strict";
  var stage = document.querySelector("[data-reels-stage]");
  if (!stage) return;
  var deck = stage.querySelector("[data-reels]");
  var cards = Array.prototype.slice.call(deck.querySelectorAll("[data-reel]"));
  var n = cards.length;
  var barsBox = stage.querySelector("[data-reels-bars]");
  var numEl = document.querySelector("[data-reels-num]");
  var nameEl = document.querySelector("[data-reels-name]");
  var chipEl = document.querySelector("[data-reels-chip]");
  var toggle = document.querySelector("[data-reels-toggle]");
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
  var active = 0, visible = false, paused = !!calm, raf = null;

  barsBox.innerHTML = cards.map(function () { return "<span><i></i></span>"; }).join("");
  var bars = Array.prototype.slice.call(barsBox.children);

  function rel(i) { // distancia circular al activo: −2…3
    var d = (i - active + n) % n;
    return d > n / 2 ? d - n : d;
  }
  function layout() {
    var narrow = stage.clientWidth < 520;
    var step = narrow ? 50 : 34; // % del ancho de la tarjeta
    cards.forEach(function (c, i) {
      var o = rel(i), a = Math.abs(o);
      c.style.transform = "perspective(1200px) translateX(" + (o * step) + "%) rotateY(" + (-o * 10) + "deg) rotate(" + (o * 3) + "deg) scale(" + (1 - a * 0.13) + ")";
      c.style.zIndex = String(10 - a);
      c.style.opacity = a > 2 ? "0" : String(1 - a * 0.22);
      c.style.pointerEvents = a > 2 ? "none" : "auto";
      c.classList.toggle("is-active", o === 0);
      c.setAttribute("aria-hidden", o === 0 ? "false" : "true");
    });
    bars.forEach(function (b, i) { b.className = i < active ? "done" : i === active ? "on" : ""; b.firstChild.style.transform = i < active ? "scaleX(1)" : "scaleX(0)"; });
    var cap = cards[active].querySelector("figcaption").textContent;
    if (numEl) numEl.textContent = ("0" + (active + 1)).slice(-2);
    if (nameEl) nameEl.textContent = cap;
    if (chipEl) chipEl.style.background = cards[active].style.getPropertyValue("--c");
    deck.style.setProperty("--halo", cards[active].style.getPropertyValue("--c") + "66");
  }

  function vid(i) { return cards[i].querySelector("video"); }
  function play() {
    cards.forEach(function (c, i) { var v = vid(i); if (i !== active) { v.pause(); } });
    var v = vid(active);
    if (!visible || paused) { v.pause(); return; }
    if (v.preload === "none") v.preload = "auto";
    // precarga el siguiente para que el cambio sea instantáneo
    var nx = vid((active + 1) % n); if (nx.preload === "none") nx.preload = "metadata";
    var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    tick();
  }
  function tick() {
    cancelAnimationFrame(raf);
    var v = vid(active), bar = bars[active].firstChild;
    (function loop() {
      if (v.duration) bar.style.transform = "scaleX(" + Math.min(1, v.currentTime / v.duration) + ")";
      raf = requestAnimationFrame(loop);
    })();
  }
  function go(i) {
    var v = vid(active); v.pause();
    active = (i + n) % n;
    vid(active).currentTime = 0;
    layout();
    play();
  }
  // la portada queda de fondo por si el vídeo aún no tiene imagen
  cards.forEach(function (c, i) { var v = vid(i); v.style.backgroundImage = "url('" + v.poster + "')"; });
  cards.forEach(function (c, i) {
    vid(i).addEventListener("ended", function () { if (i === active) go(active + 1); });
    c.addEventListener("click", function () { if (i !== active) go(i); else setPaused(!paused); });
  });

  function setPaused(p) {
    paused = p;
    stage.classList.toggle("is-paused", p);
    if (toggle) {
      toggle.classList.toggle("is-paused", p);
      toggle.setAttribute("aria-label", window.MELY_I18N.t(p ? "Reproducir" : "Pausar", p ? "Play" : "Pause"));
    }
    play();
  }
  if (toggle) toggle.addEventListener("click", function () { setPaused(!paused); });
  var prev = document.querySelector("[data-reels-prev]"), next = document.querySelector("[data-reels-next]");
  if (prev) prev.addEventListener("click", function () { go(active - 1); });
  if (next) next.addEventListener("click", function () { go(active + 1); });
  stage.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); }
    if (e.key === " ") { e.preventDefault(); setPaused(!paused); }
  });

  // deslizar con el dedo o arrastrar con el ratón
  var sx = null, moved = false;
  stage.addEventListener("pointerdown", function (e) { sx = e.clientX; moved = false; });
  stage.addEventListener("pointermove", function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx;
    if (Math.abs(dx) > 8) { moved = true; deck.style.setProperty("--drag", Math.max(-60, Math.min(60, dx / 3)) + "px"); }
  });
  var end = function (e) {
    if (sx === null) return;
    var dx = (e.clientX || sx) - sx; sx = null;
    deck.style.setProperty("--drag", "0px");
    if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.addEventListener("click", function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);

  // solo se reproduce mientras la sección está a la vista
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; play(); if (!visible) cancelAnimationFrame(raf); }, { threshold: .3 }).observe(stage);
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") play(); });
  ["pointerdown", "touchstart", "keydown"].forEach(function (ev) { addEventListener(ev, function () { if (visible && !paused && vid(active).paused) play(); }, { passive: true }); });

  addEventListener("resize", layout);
  document.addEventListener("langchange", layout);
  if (calm) setPaused(true);
  layout();
})();
