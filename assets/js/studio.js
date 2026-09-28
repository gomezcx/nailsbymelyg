/* ============================================================
   Nails by MelyG — estudio de color ("Diseña tu manicura")
   Mano de cuatro dedos con uñas realistas. Color, forma,
   acabado y tono de piel. El diseño viaja a la reserva (?diseno=).
   ============================================================ */
(function () {
  "use strict";
  var form = document.querySelector("[data-studio]");
  var hand = document.querySelector("[data-hand]");
  if (!form || !hand || !window.MELY_NAIL) return;
  var I = window.MELY_I18N, N = window.MELY_NAIL;
  var t = function (es, en) { return I.t(es, en); };

  // Tonos de la carta de Mely (nombres del portfolio)
  var COLORS = [
    { id: "burdeos", c: "#662E3A", es: "Burdeos Mely", en: "Mely Bordeaux" },
    { id: "cereza", c: "#9E1B2E", es: "Rojo cereza", en: "Cherry red" },
    { id: "rosa", c: "#D9A7A8", es: "Rosa empolvado", en: "Dusty rose" },
    { id: "ballet", c: "#F1D4D1", es: "Ballet", en: "Ballet" },
    { id: "nude", c: "#D8B39E", es: "Nude", en: "Nude" },
    { id: "marfil", c: "#F3EBDD", es: "Marfil", en: "Ivory" },
    { id: "oliva", c: "#6E6B4C", es: "Oliva", en: "Olive" },
    { id: "petroleo", c: "#1F3B4D", es: "Petróleo", en: "Petrol blue" },
    { id: "cacao", c: "#3A2521", es: "Cacao", en: "Cocoa" },
    { id: "negro", c: "#1B1517", es: "Negro", en: "Black" }
  ];
  var SHAPES = [
    { id: "almond", es: "Almendra", en: "Almond" },
    { id: "oval", es: "Ovalada", en: "Oval" },
    { id: "square", es: "Cuadrada", en: "Square" },
    { id: "coffin", es: "Bailarina", en: "Coffin" }
  ];
  var FINISHES = [
    { id: "gloss", es: "Brillo", en: "Gloss" },
    { id: "matte", es: "Mate", en: "Matte" },
    { id: "french", es: "Francesa", en: "French" },
    { id: "chrome", es: "Cromado", en: "Chrome" }
  ];
  var SKINS = [
    { id: "light", es: "Clara", en: "Light" },
    { id: "medium", es: "Media", en: "Medium" },
    { id: "tan", es: "Morena", en: "Tan" },
    { id: "deep", es: "Oscura", en: "Deep" }
  ];
  // mini siluetas de cada forma para los botones
  var ICONS = {
    almond: "M2 22V11C2 6 5.5 2 8 1c2.5 1 6 5 6 10v11z",
    oval: "M2 22V10c0-5 2.7-8 6-8s6 3 6 8v12z",
    square: "M2 22V4q0-2 2-2h8q2 0 2 2v18z",
    coffin: "M2 22V11L4.5 2h7L14 11v11z"
  };

  var STORE = "mely-studio";
  var S = { color: "burdeos", shape: "almond", finish: "gloss", skin: "medium" };
  try { var saved = JSON.parse(localStorage.getItem(STORE) || "null"); if (saved) for (var k in S) if (saved[k]) S[k] = saved[k]; } catch (e) {}

  var byId = function (list, id) { return list.filter(function (x) { return x.id === id; })[0] || list[0]; };
  var nails = [];
  hand.querySelectorAll(".finger").forEach(function (f) {
    nails.push(N.create(f, { polish: byId(COLORS, S.color).c, shape: S.shape, finish: S.finish, skin: S.skin }));
  });

  function name(o) { return o[I.lang] || o.es; }

  function render() {
    var chips = form.querySelector('[data-chips="color"]');
    chips.innerHTML = COLORS.map(function (c) {
      return '<label class="chip" title="' + name(c) + '"><input type="radio" name="color" value="' + c.id + '"' + (S.color === c.id ? " checked" : "") +
        '><span class="dot" style="--c:' + c.c + '"></span><span class="sr-only">' + name(c) + "</span></label>";
    }).join("");
    var skin = form.querySelector('[data-chips="skin"]');
    skin.innerHTML = SKINS.map(function (s) {
      var tone = N.skins[s.id];
      return '<label class="chip skin" title="' + name(s) + '"><input type="radio" name="skin" value="' + s.id + '"' + (S.skin === s.id ? " checked" : "") +
        '><span class="dot" style="--c:linear-gradient(90deg,' + tone[1] + "," + tone[0] + " 45%," + tone[3] + " 60%," + tone[1] + ')"></span><span class="sr-only">' + name(s) + "</span></label>";
    }).join("");
    form.querySelectorAll(".chip.skin .dot").forEach(function (d) { d.style.background = d.style.getPropertyValue("--c"); });
    form.querySelector('[data-seg="shape"]').innerHTML = SHAPES.map(function (s) {
      return '<label><input type="radio" name="shape" value="' + s.id + '"' + (S.shape === s.id ? " checked" : "") +
        '><span><svg viewBox="0 0 16 23" aria-hidden="true"><path d="' + ICONS[s.id] + '" fill="currentColor" opacity=".85"/></svg>' + name(s) + "</span></label>";
    }).join("");
    form.querySelector('[data-seg="finish"]').innerHTML = FINISHES.map(function (f) {
      return '<label><input type="radio" name="finish" value="' + f.id + '"' + (S.finish === f.id ? " checked" : "") + "><span>" + name(f) + "</span></label>";
    }).join("");
    summary();
  }

  function label() {
    return name(byId(COLORS, S.color)) + " · " + name(byId(SHAPES, S.shape)) + " · " + name(byId(FINISHES, S.finish));
  }

  function summary() {
    var c = byId(COLORS, S.color);
    form.querySelector('[data-out="color"]').textContent = "— " + name(c);
    var nm = document.querySelector("[data-studio-name]");
    if (nm) nm.textContent = label();
    var book = document.querySelector("[data-studio-book]");
    if (book) book.href = "reservar.html?servicio=mani-gel&diseno=" + encodeURIComponent(label());
    try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {}
  }

  function apply(changed, animate) {
    var c = byId(COLORS, S.color).c;
    nails.forEach(function (n, i) {
      var go = function () {
        var o = {};
        if (changed.skin) o.skin = S.skin;
        if (changed.shape) o.shape = S.shape;
        if (changed.finish) o.finish = S.finish;
        o.polish = c; o.animate = animate;
        n.set(o);
      };
      // el pincel pasa de un dedo al siguiente
      if (animate && changed.color) setTimeout(go, i * 110); else go();
    });
  }

  form.addEventListener("change", function (e) {
    var n = e.target.name;
    if (!(n in S)) return;
    S[n] = e.target.value;
    var ch = {}; ch[n] = true;
    apply(ch, n === "color");
    summary();
  });

  document.querySelector("[data-shuffle]").addEventListener("click", function () {
    var pick = function (list, cur) { var o; do { o = list[Math.floor(Math.random() * list.length)].id; } while (o === cur && list.length > 1); return o; };
    S.color = pick(COLORS, S.color);
    S.shape = pick(SHAPES, S.shape);
    S.finish = Math.random() < .6 ? "gloss" : pick(FINISHES, S.finish);
    apply({ color: true, shape: true, finish: true }, true);
    render();
  });

  // brillo que sigue al puntero sobre la mano
  var stage = document.querySelector("[data-studio-stage]");
  if (stage) {
    stage.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var r = stage.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 2 - 1;
      nails.forEach(function (n) { n.tilt(x); });
    });
    stage.addEventListener("pointerleave", function () { nails.forEach(function (n) { n.tilt(0); }); });
  }

  render();
  document.addEventListener("langchange", render);
})();
