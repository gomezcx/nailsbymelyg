/* ============================================================
   Datos del negocio. Precios y duraciones copiados de Square
   (sept 2026). "sq" es el nombre EXACTO del servicio en Square:
   el backend lo usa para encontrar el ID del servicio.
   ============================================================ */
window.MELY_DATA = {
  // Horario de Google Maps (0 = domingo). null = cerrado.
  hours: [
    ["11:00", "15:00"],
    ["09:00", "18:00"],
    ["09:00", "18:00"],
    ["09:00", "18:00"],
    ["09:00", "18:00"],
    ["09:00", "18:00"],
    ["09:00", "18:00"]
  ],

  groups: [
    { id: "mani", es: "Manicura", en: "Manicure" },
    { id: "pedi", es: "Pedicura", en: "Pedicure" },
    { id: "otros", es: "Hombres, niños y extras", en: "Men, kids & extras" }
  ],

  services: [
    { id: "mani-gel", group: "mani", price: 65, min: 90, sq: "Manicure Russo & gel (shellac)",
      es: ["Manicura rusa + gel", "Cutícula rusa en seco y esmaltado en gel (shellac)."],
      en: ["Russian manicure + gel", "Dry Russian cuticle work and gel (shellac) polish."] },
    { id: "mani-rubber", group: "mani", price: 85, min: 150, sq: "Russian manicure & rubber base",
      es: ["Manicura rusa + rubber base", "Nivelación con rubber base para uñas naturales más fuertes."],
      en: ["Russian manicure + rubber base", "Rubber base leveling for stronger natural nails."] },
    { id: "mani-builder", group: "mani", price: 85, min: 150, sq: "Russian Manicure & Builder Gel",
      es: ["Manicura rusa + builder gel", "Estructura con builder gel sobre tu uña natural."],
      en: ["Russian manicure + builder gel", "Builder gel structure over your natural nail."] },
    { id: "mani-gelx", group: "mani", price: 85, min: 120, sq: "Manicure Russo & Gel x",
      es: ["Manicura rusa + Gel‑X", "Extensiones Gel‑X con preparación rusa."],
      en: ["Russian manicure + Gel‑X", "Gel‑X extensions with Russian prep."] },
    { id: "mani-poly", group: "mani", price: 90, min: 150, sq: "Manicure Russo & Poly Gel",
      es: ["Manicura rusa + Poly Gel", "Largo y forma a tu gusto con Poly Gel."],
      en: ["Russian manicure + Poly Gel", "Length and shape your way with Poly Gel."] },
    { id: "mani-natural-poly", group: "mani", price: 90, min: 150, sq: "Manicure natural nails & Poly Gel",
      es: ["Uñas naturales + Poly Gel", "Refuerzo con Poly Gel sobre uña natural."],
      en: ["Natural nails + Poly Gel", "Poly Gel overlay on your natural nails."] },
    { id: "mani-ext", group: "mani", price: 85, min: 180, sq: "Manicure extension nails & Builder Gel",
      es: ["Extensiones + builder gel", "Uñas extendidas y esculpidas con builder gel."],
      en: ["Extensions + builder gel", "Sculpted extensions with builder gel."] },
    { id: "pedi-gel", group: "pedi", price: 75, min: 105, sq: "Russian Pedicure & gel (Shellac)",
      es: ["Pedicura rusa + gel", "Cuidado completo del pie, cutícula rusa y gel (shellac)."],
      en: ["Russian pedicure + gel", "Full foot care, Russian cuticle work and gel (shellac)."] },
    { id: "pedi-rubber", group: "pedi", price: 85, min: 120, sq: "Russian Pedicure & rubber Base",
      es: ["Pedicura rusa + rubber base", "Cuidado completo del pie con rubber base."],
      en: ["Russian pedicure + rubber base", "Full foot care with rubber base."] },
    { id: "men", group: "otros", price: 80, min: 95, sq: "Manicure & pedicure for Men's",
      es: ["Manicura y pedicura para hombres", "Manos y pies limpios, cuidados y sin brillo."],
      en: ["Men’s manicure & pedicure", "Clean, groomed hands and feet, no shine."] },
    { id: "kids", group: "otros", price: 55, min: 90, sq: "Manicure and Pedicure for children",
      es: ["Manicura y pedicura para niños", "Una experiencia cuidadosa para los más pequeños."],
      en: ["Kids’ manicure & pedicure", "A gentle experience for little ones."] },
    { id: "removal", group: "otros", price: 15, min: 35, sq: "Service to Remove Previous Product", addon: true,
      es: ["Retirada de producto anterior", "Si vienes con gel, acrílico u otro producto."],
      en: ["Removal of previous product", "If you come in with gel, acrylic or other product."] }
  ],

  courses: {
    russian: { price: 1100, days: 2, hoursPerDay: 8, seats: 6 },
    gelx: { price: 180, days: 1, hoursPerDay: 8 }
  }
};
