/* ============================================================
   Nails by MelyG — uña realista en SVG
   Dedo con piel, cutícula, pliegues laterales, curvatura (C‑curve),
   brillo de gel y borde libre. Se usa en las fichas de servicios,
   en el estudio de color y en la confirmación de la reserva.

   <div data-nail data-polish="#662E3A" data-shape="almond"
        data-finish="gloss" data-skin="medium"></div>
   ============================================================ */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var seq = 0;

  // Todas las formas comparten la misma estructura de comandos para que
  // el cambio de forma se pueda animar (propiedad CSS `d`).
  var BASE = "M54,214 C54,238 76,252 100,252 C124,252 146,238 146,214";
  var SHAPES = {
    almond: BASE + " L146,122 C146,80 120,38 105,25 Q100,20.5 95,25 C80,38 54,80 54,122 Z",
    oval: BASE + " L146,112 C146,70 128,38 106,36 Q100,35.5 94,36 C72,38 54,70 54,112 Z",
    square: BASE + " L146,58 C146,50 144,45 138,44.5 Q100,43 62,44.5 C56,45 54,50 54,58 Z",
    coffin: BASE + " L146,108 C142,86 130,40 126,25 Q100,23 74,25 C70,40 58,86 54,108 Z",
    short: BASE + " L146,120 C146,92 128,72 106,70.5 Q100,70 94,70.5 C72,72 54,92 54,120 Z"
  };

  // [base, sombra, pliegue, luz]
  var SKINS = {
    light: ["#EFCDB6", "#DDAF95", "#C48E74", "#FBE4D5"],
    medium: ["#D9A684", "#C08867", "#A36C4F", "#ECC4A8"],
    tan: ["#B47B56", "#976140", "#7B4B30", "#CB9774"],
    deep: ["#7B4A31", "#643923", "#4A2816", "#98613F"]
  };

  var SHEER = "#EEC9C1"; // base de francesa: rosa translúcido sobre el lecho

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function build(host) {
    var id = "n" + (++seq);
    var u = function (s) { return "url(#" + id + s + ")"; };
    var svg = el("svg", { viewBox: "0 0 200 360", class: "nail-svg", "aria-hidden": "true", focusable: "false" });
    var defs = el("defs", {}, svg);

    // piel
    var skinG = el("linearGradient", { id: id + "sk", x1: "0", x2: "1", y1: "0", y2: "0" }, defs);
    var skinStops = [0, .1, .34, .5, .66, .9, 1].map(function (o) { return el("stop", { offset: o }, skinG); });
    var tipG = el("radialGradient", { id: id + "tp", cx: ".5", cy: ".22", r: ".5" }, defs);
    var tipStops = [el("stop", { offset: "0", "stop-opacity": ".55" }, tipG), el("stop", { offset: "1", "stop-opacity": "0" }, tipG)];
    var foldG = el("linearGradient", { id: id + "fd", x1: "0", x2: "0", y1: "220", y2: "96", gradientUnits: "userSpaceOnUse" }, defs);
    var foldStops = [el("stop", { offset: "0", "stop-opacity": ".95" }, foldG), el("stop", { offset: "1", "stop-opacity": "0" }, foldG)];

    // curvatura de la uña (C‑curve) y profundidad junto a la cutícula
    var curve = el("linearGradient", { id: id + "cv", x1: "54", x2: "146", y1: "0", y2: "0", gradientUnits: "userSpaceOnUse" }, defs);
    [[0, "#1a0508", .42], [.2, "#1a0508", .1], [.45, "#fff", .06], [.72, "#1a0508", .04], [.9, "#1a0508", .22], [1, "#1a0508", .5]]
      .forEach(function (s) { el("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] }, curve); });
    var depth = el("linearGradient", { id: id + "dp", x1: "0", x2: "0", y1: "252", y2: "20", gradientUnits: "userSpaceOnUse" }, defs);
    [[0, "#1a0508", .28], [.14, "#1a0508", 0], [.8, "#fff", 0], [1, "#fff", .1]]
      .forEach(function (s) { el("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] }, depth); });

    // cromado
    var chrome = el("linearGradient", { id: id + "cr", x1: "0", x2: "1", y1: "0", y2: ".35" }, defs);
    [[0, "#fff", .15], [.18, "#fff", .75], [.32, "#fff", .05], [.5, "#000", .35], [.64, "#fff", .6], [.8, "#000", .2], [1, "#fff", .45]]
      .forEach(function (s) { el("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] }, chrome); });

    // lecho ungueal (se ve en la francesa)
    var bed = el("linearGradient", { id: id + "bd", x1: "0", x2: "0", y1: "252", y2: "40", gradientUnits: "userSpaceOnUse" }, defs);
    [[0, "#F6DCD6"], [.12, "#EFC3BA"], [1, "#E7B1A8"]].forEach(function (s) { el("stop", { offset: s[0], "stop-color": s[1] }, bed); });

    var blur = function (sd, name) {
      var f = el("filter", { id: id + name, x: "-40%", y: "-40%", width: "180%", height: "180%" }, defs);
      el("feGaussianBlur", { stdDeviation: sd }, f);
    };
    blur(.7, "b1"); blur(2, "b2"); blur(3.2, "b3"); blur(9, "b4");
    var grain = el("filter", { id: id + "gr" }, defs);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: "1.4", numOctaves: "2", stitchTiles: "stitch" }, grain);
    el("feColorMatrix", { values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0" }, grain);

    // forma de la uña: un único path al que todo lo demás hace referencia
    var clip = el("clipPath", { id: id + "cl" }, defs);
    var plate = el("path", { id: id + "pl", class: "n-plate" }, clip);

    // máscara del pincel: tres pasadas (centro, izquierda, derecha)
    var mask = el("mask", { id: id + "mk", maskUnits: "userSpaceOnUse", x: "0", y: "0", width: "200", height: "360" }, defs);
    var strokes = [[74, 52], [48, 44], [108, 44]].map(function (s) {
      return el("rect", { x: s[0], y: "-20", width: s[1], height: "320", rx: s[1] / 2, fill: "#fff", class: "n-stroke" }, mask);
    });

    // ---------- dedo ----------
    var finger = el("g", { class: "n-finger" }, svg);
    el("path", { d: "M24,360 L26,152 C26,98 60,72 100,72 C140,72 174,98 174,152 L176,360 Z", fill: u("sk") }, finger);
    el("ellipse", { cx: "100", cy: "140", rx: "70", ry: "90", fill: u("tp") }, finger);
    // pliegues del nudillo
    var crease = el("g", { fill: "none", "stroke-linecap": "round", opacity: ".32", class: "n-crease" }, finger);
    el("path", { d: "M58,316 Q100,327 142,316", "stroke-width": "1.3" }, crease);
    el("path", { d: "M66,329 Q100,338 134,329", "stroke-width": "1" }, crease);
    el("path", { d: "M80,340 Q100,344 120,340", "stroke-width": ".8" }, crease);
    // líneas finas de la piel bajo la cutícula
    el("path", { d: "M70,276 Q100,282 130,276", "stroke-width": ".7", opacity: ".6" }, crease);
    el("path", { d: "M78,286 Q100,290 122,286", "stroke-width": ".6", opacity: ".5" }, crease);
    // piel más rosada alrededor de la cutícula
    var peri = el("ellipse", { cx: "100", cy: "246", rx: "52", ry: "20", filter: u("b3"), opacity: ".55" }, finger);

    // sombra del grosor de la uña
    el("use", { href: "#" + id + "pl", transform: "translate(0 3.5)", fill: "#2a0c10", opacity: ".32", filter: u("b2"), class: "n-cast" }, svg);

    // ---------- uña ----------
    var nail = el("g", { "clip-path": u("cl"), class: "n-nail" }, svg);
    el("rect", { x: "0", y: "0", width: "200", height: "260", fill: u("bd"), class: "n-bed" }, nail);
    var base = el("rect", { x: "0", y: "0", width: "200", height: "260", class: "n-base" }, nail);
    var paint = el("rect", { x: "0", y: "0", width: "200", height: "260", mask: u("mk"), class: "n-paint", opacity: "0" }, nail);
    var tip = el("path", { d: "M0,0 H200 V122 L146,117 C138,86 122,76 100,76 C78,76 62,86 54,117 L0,122 Z", class: "n-tip" }, nail);
    el("rect", { x: "0", y: "0", width: "200", height: "260", fill: u("cr"), class: "n-chrome" }, nail);
    el("rect", { x: "0", y: "0", width: "200", height: "260", fill: u("cv") }, nail);
    el("rect", { x: "0", y: "0", width: "200", height: "260", fill: u("dp") }, nail);
    // sombra que deja la cutícula sobre la uña
    el("path", { d: BASE, fill: "none", stroke: "#2a0c10", "stroke-width": "7", opacity: ".22", filter: u("b2") }, nail);

    // mate: luz difusa + textura
    var matte = el("g", { class: "n-matte" }, nail);
    el("ellipse", { cx: "90", cy: "140", rx: "24", ry: "84", fill: "#fff", opacity: ".16", filter: u("b4") }, matte);
    el("rect", { x: "0", y: "0", width: "200", height: "260", filter: u("gr"), opacity: ".09" }, matte);

    // brillo de gel: reflejo principal, núcleo, reflejo secundario y borde
    var gloss = el("g", { class: "n-gloss" }, nail);
    var glossMove = el("g", { class: "n-gloss-move" }, gloss);
    el("path", { d: "M71,212 C64,162 68,100 87,50 C89,45 95,47 94,53 C80,100 78,160 83,210 C83,219 72,219 71,212 Z", fill: "#fff", opacity: ".5", filter: u("b2") }, glossMove);
    el("path", { d: "M77,196 C73,156 76,108 89,62 C85,108 82,156 81,196 Z", fill: "#fff", opacity: ".92", filter: u("b1") }, glossMove);
    el("path", { d: "M131,204 C136,162 134,120 123,82 C131,118 134,162 127,204 Z", fill: "#fff", opacity: ".38", filter: u("b1") }, glossMove);
    el("path", { d: "M84,236 C92,241 110,241 118,236", fill: "none", stroke: "#fff", "stroke-width": "1.6", "stroke-linecap": "round", opacity: ".35", filter: u("b1") }, glossMove);
    el("use", { href: "#" + id + "pl", fill: "none", stroke: "#fff", "stroke-width": "2.4", opacity: ".22" }, gloss);

    // contorno fino para definir el borde libre
    el("use", { href: "#" + id + "pl", fill: "none", stroke: "#2a0c10", "stroke-width": ".9", opacity: ".3" }, svg);

    // pliegues laterales y cutícula (piel por encima del borde de la uña)
    var folds = el("g", { fill: "none", "stroke-linecap": "round", class: "n-folds" }, svg);
    el("path", { d: "M52.5,218 C52,180 52.5,140 54,100", stroke: u("fd"), "stroke-width": "3.2", filter: u("b1") }, folds);
    el("path", { d: "M147.5,218 C148,180 147.5,140 146,100", stroke: u("fd"), "stroke-width": "3.2", filter: u("b1") }, folds);
    var groove = el("path", { d: "M50,210 C50,243 75,259 100,259 C125,259 150,243 150,210 M49,210 L50,110 M151,210 L150,110", "stroke-width": "7", opacity: ".45", filter: u("b3") }, folds);
    var ridge = el("path", { d: "M47,214 C48,247 74,264 100,264 C126,264 152,247 153,214", "stroke-width": "2.2", opacity: ".55", filter: u("b2") }, folds);
    var cutShadow = el("path", { d: "M52.5,213 C52.5,240 76,254.5 100,254.5 C124,254.5 147.5,240 147.5,213", "stroke-width": "3.4" }, folds);
    var cutLight = el("path", { d: "M55,219 C58,241 78,253 100,253 C122,253 142,241 145,219", "stroke-width": "1.1", opacity: ".85" }, folds);

    host.appendChild(svg);

    var state = {};
    var api = {
      el: svg,
      set: function (o) {
        o = o || {};
        if (o.skin && o.skin !== state.skin) {
          var s = SKINS[o.skin] || SKINS.medium;
          [s[2], s[1], s[0], s[3], s[0], s[1], s[2]].forEach(function (c, i) { skinStops[i].setAttribute("stop-color", c); });
          tipStops.forEach(function (st) { st.setAttribute("stop-color", s[3]); });
          foldStops.forEach(function (st) { st.setAttribute("stop-color", s[1]); });
          crease.setAttribute("stroke", s[2]);
          peri.setAttribute("fill", mix(s[0], "#E08A88", .35));
          cutShadow.setAttribute("stroke", s[1]);
          groove.setAttribute("stroke", s[2]);
          ridge.setAttribute("stroke", s[3]);
          cutLight.setAttribute("stroke", s[3]);
          state.skin = o.skin;
        }
        if (o.shape && o.shape !== state.shape) {
          var d = SHAPES[o.shape] || SHAPES.almond;
          plate.setAttribute("d", d);
          // Chrome/Firefox animan el cambio; Safari lo aplica directo
          if (state.shape && !reduce) plate.style.d = "path('" + d + "')";
          state.shape = o.shape;
        }
        if (o.finish && o.finish !== state.finish) {
          svg.setAttribute("data-finish", o.finish);
          state.finish = o.finish;
        }
        if (o.polish) {
          var french = state.finish === "french";
          if (french) { tip.style.fill = o.polish; base.style.fill = SHEER; }
          else if (o.animate && state.polish && o.polish !== state.polish && !reduce) api.paint(o.polish);
          else { base.style.fill = o.polish; tip.style.fill = o.polish; }
          state.polish = o.polish;
        }
        if (state.finish === "french") base.style.fill = SHEER;
        else if (!api._painting) base.style.fill = state.polish;
        return api;
      },
      // animación de pincel: tres pasadas desde la cutícula hacia la punta
      paint: function (color) {
        var anims = [];
        api._painting = true;
        paint.style.fill = color;
        paint.setAttribute("opacity", "1");
        tip.style.fill = color;
        strokes.forEach(function (r, i) {
          r.getAnimations && r.getAnimations().forEach(function (a) { a.cancel(); });
          anims.push(r.animate(
            [{ transform: "translateY(290px)" }, { transform: "translateY(0)" }],
            { duration: 560, delay: i * 130, easing: "cubic-bezier(.5,.05,.2,1)", fill: "both" }
          ));
        });
        Promise.all(anims.map(function (a) { return a.finished; })).then(function () {
          base.style.fill = color;
          paint.setAttribute("opacity", "0");
          api._painting = false;
        }).catch(function () {});
      },
      // brillo que sigue al puntero: x en −1…1
      tilt: function (x) { glossMove.style.transform = "translateX(" + (x * 12).toFixed(2) + "px)"; }
    };
    api.state = state;
    return api;
  }

  function mix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    var g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    var bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  function create(host, o) {
    var api = build(host);
    api.set({ skin: o.skin || "medium", shape: o.shape || "almond", finish: o.finish || "gloss" });
    api.set({ polish: o.polish || "#662E3A" });
    host._nail = api;
    return api;
  }

  function init(root) {
    (root || document).querySelectorAll("[data-nail]:not([data-nail-ready])").forEach(function (h) {
      h.setAttribute("data-nail-ready", "");
      var api = create(h, { polish: h.dataset.polish, shape: h.dataset.shape, finish: h.dataset.finish, skin: h.dataset.skin });
      if (h.hasAttribute("data-bare")) { api.el.setAttribute("viewBox", "44 14 112 246"); api.el.classList.add("is-bare"); }
    });
  }

  // brillo y leve inclinación al pasar el puntero por una ficha
  function bindTilt(card) {
    var nails = function () { return card.querySelectorAll("[data-nail-ready]"); };
    card.addEventListener("pointermove", function (e) {
      if (reduce || e.pointerType === "touch") return;
      var r = card.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1;
      card.style.setProperty("--rx", (-y * 4).toFixed(2) + "deg");
      card.style.setProperty("--ry", (x * 6).toFixed(2) + "deg");
      nails().forEach(function (n) { n._nail && n._nail.tilt(x); });
    });
    card.addEventListener("pointerleave", function () {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
      nails().forEach(function (n) { n._nail && n._nail.tilt(0); });
    });
  }

  window.MELY_NAIL = { create: create, init: init, bindTilt: bindTilt, shapes: SHAPES, skins: SKINS };

  init();
  document.querySelectorAll("[data-tilt]").forEach(bindTilt);
})();
