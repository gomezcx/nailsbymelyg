/* ============================================================
   Nails by MelyG — galería
   Una sola lista de fotos para la página de galería (con filtros
   y visor) y para la tira de fotos de la portada.
   Para añadir una foto: súbela a assets/img/galeria/ en dos tamaños
   (nombre.webp/.jpg de 800 px y nombre-s.webp/.jpg de 400 px) y
   agrégala aquí.
   ============================================================ */
(function () {
  "use strict";
  var I = window.MELY_I18N;
  var t = function (es, en) { return I.t(es, en); };

  var CATS = [
    { id: "all", es: "Todo", en: "All" },
    { id: "nude", es: "Nude y rosa", en: "Nude & pink" },
    { id: "rojos", es: "Rojos y vinos", en: "Reds & wines" },
    { id: "color", es: "Color", en: "Color" },
    { id: "diseno", es: "Diseños", en: "Nail art" },
    { id: "brillo", es: "Cromo y brillo", en: "Chrome & shimmer" }
  ];
  var PICS = [
    ["rosa-cromo", "brillo", "Rosa cromado", "Pink chrome"],
    ["french-leopardo", "diseno", "French, leopardo y cromo", "French, leopard & chrome"],
    ["vino", "rojos", "Vino", "Wine"],
    ["nude-rosado", "nude", "Nude rosado", "Rosy nude"],
    ["menta", "color", "Menta", "Mint"],
    ["azul-noche", "brillo", "Azul noche con destellos", "Midnight blue shimmer"],
    ["otono-mix", "diseno", "Mix de otoño", "Autumn mix"],
    ["rojo-lazos", "rojos", "Rojo con lazos", "Red with bows"],
    ["amarillo-mantequilla", "color", "Amarillo mantequilla", "Butter yellow"],
    ["french-natural", "nude", "French natural", "Natural French"],
    ["cromo-plata", "brillo", "Cromado plata", "Silver chrome"],
    ["arcoiris", "diseno", "Arcoíris", "Rainbow"],
    ["rojo-almendra", "rojos", "Rojo almendra", "Almond red"],
    ["rosa-bebe", "nude", "Rosa bebé", "Baby pink"],
    ["azul-cielo", "color", "Azul cielo", "Sky blue"],
    ["chocolate-puntos", "diseno", "Chocolate con puntos", "Chocolate polka dots"],
    ["terracota", "rojos", "Terracota", "Terracotta"],
    ["rosa-perla", "brillo", "Rosa perla con puntos", "Pearl pink with dots"],
    ["coral", "color", "Coral", "Coral"],
    ["baby-boomer-rosa", "nude", "Baby boomer rosa", "Pink baby boomer"],
    ["chocolate-turquesa", "diseno", "Chocolate y turquesa", "Chocolate & turquoise"],
    ["amarillo-almendra", "color", "Amarillo almendra", "Almond yellow"],
    ["rojo-corto", "rojos", "Rojo clásico corto", "Short classic red"],
    ["otono-terracota", "diseno", "Otoño en terracota", "Terracotta autumn"],
    ["nude-melocoton", "nude", "Nude melocotón", "Peach nude"]
  ];
  var base = "assets/img/galeria/";
  function pic(p, small) {
    var n = base + p[0] + (small ? "-s" : "");
    return '<picture><source srcset="' + n + '.webp" type="image/webp"><img src="' + n + '.jpg" alt="' + name(p) + '" loading="lazy" decoding="async"></picture>';
  }
  function name(p) { return I.lang === "en" ? p[3] : p[2]; }

  /* ---------- tira de la portada ---------- */
  var strip = document.querySelector("[data-gallery-strip]");
  if (strip) {
    var row = function (list) {
      return '<div class="strip-row">' + list.concat(list).map(function (p) {
        return '<a class="strip-item" href="galeria.html#' + p[0] + '" tabindex="-1">' + pic(p, true) + "</a>";
      }).join("") + "</div>";
    };
    strip.innerHTML = row(PICS.slice(0, 12)) + row(PICS.slice(12).reverse());
  }

  /* ---------- página de galería ---------- */
  var grid = document.querySelector("[data-gallery]");
  if (!grid) return;
  var filters = document.querySelector("[data-gallery-filters]");
  var current = "all", view = PICS.slice();

  function renderFilters() {
    filters.innerHTML = CATS.map(function (c) {
      var n = c.id === "all" ? PICS.length : PICS.filter(function (p) { return p[1] === c.id; }).length;
      return '<button type="button" data-cat="' + c.id + '" aria-pressed="' + (c.id === current) + '">' + (I.lang === "en" ? c.en : c.es) + " <sup>" + n + "</sup></button>";
    }).join("");
  }
  function renderGrid(animate) {
    view = PICS.filter(function (p) { return current === "all" || p[1] === current; });
    grid.innerHTML = view.map(function (p, i) {
      return '<button type="button" class="g-item" id="' + p[0] + '" data-i="' + i + '" data-cursor="' + t("Ver", "View") + '">' + pic(p, false) +
        '<span class="g-cap">' + name(p) + "</span></button>";
    }).join("");
    if (animate && grid.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      grid.querySelectorAll(".g-item").forEach(function (el, i) {
        el.animate([{ opacity: 0, transform: "translateY(40px) scale(.96)" }, { opacity: 1, transform: "none" }],
          { duration: 700, delay: Math.min(i, 12) * 45, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
      });
    }
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }
  filters.addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]");
    if (!b || b.dataset.cat === current) return;
    current = b.dataset.cat;
    renderFilters();
    renderGrid(true);
  });

  /* ---------- visor ---------- */
  var lb = document.getElementById("lightbox");
  var idx = 0;
  function show(i, dir) {
    idx = (i + view.length) % view.length;
    var p = view[idx];
    var fig = lb.querySelector("[data-lb-img]");
    fig.innerHTML = pic(p, false);
    lb.querySelector("[data-lb-cap]").textContent = name(p);
    lb.querySelector("[data-lb-count]").textContent = (idx + 1) + " / " + view.length;
    lb.querySelector("[data-lb-book]").href = "reservar.html?servicio=mani-gel&diseno=" + encodeURIComponent(t("Foto de la galería: ", "Gallery photo: ") + name(p));
    lb.querySelector("[data-lb-wa]").href = window.MELY_WA(t("Hola Mely, me encantó este diseño de tu galería: ", "Hi Mely, I love this design from your gallery: ") + name(p) + t(". ¿Me lo puedes hacer?", ". Can you do it for me?"));
    if (dir && fig.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fig.animate([{ opacity: 0, transform: "translateX(" + (dir * 60) + "px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" });
    }
  }
  grid.addEventListener("click", function (e) {
    var b = e.target.closest(".g-item");
    if (!b) return;
    show(+b.dataset.i);
    lb.showModal();
  });
  lb.querySelector("[data-lb-prev]").addEventListener("click", function () { show(idx - 1, -1); });
  lb.querySelector("[data-lb-next]").addEventListener("click", function () { show(idx + 1, 1); });
  lb.querySelector("[data-lb-close]").addEventListener("click", function () { lb.close(); });
  lb.addEventListener("click", function (e) { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") show(idx + 1, 1);
    if (e.key === "ArrowLeft") show(idx - 1, -1);
  });
  // deslizar con el dedo
  var sx = null;
  lb.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") sx = e.clientX; });
  lb.addEventListener("pointerup", function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });

  renderFilters();
  renderGrid(false);
  // enlace directo a una foto (galeria.html#menta)
  var hash = location.hash.slice(1);
  if (hash) {
    var i = view.map(function (p) { return p[0]; }).indexOf(hash);
    if (i > -1) setTimeout(function () { show(i); lb.showModal(); }, 600);
  }
  document.addEventListener("langchange", function () { renderFilters(); renderGrid(false); });
})();
