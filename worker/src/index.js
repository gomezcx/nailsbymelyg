/**
 * Nails by MelyG — API de reservas (Cloudflare Worker)
 * Puente seguro entre la web y Square: el token de Square vive aquí,
 * nunca en el navegador.
 *
 *   GET  /services      → servicios reservables (id y versión de Square)
 *   POST /availability  → horarios libres para 1+ servicios seguidos
 *   POST /book          → crea/encuentra clienta, guarda tarjeta y crea la cita
 *   POST /giftcard/purchase → cobra, crea y activa una gift card de Square (si falla, reembolsa)
 *   GET  /giftcard/balance?gan=… → estado y saldo de una gift card (lo que diga Square)
 *
 * Variables (wrangler.toml / secretos):
 *   SQUARE_ACCESS_TOKEN  (secreto)   SQUARE_LOCATION_ID
 *   SQUARE_ENV = production|sandbox  ALLOWED_ORIGINS = "https://nailsbymelyg.com,https://www.nailsbymelyg.com"
 *   SITE_URL = "https://nailsbymelyg.com"  (para el enlace de la tarjeta)
 *   Opcional, para enviar la gift card por correo: RESEND_API_KEY (secreto), MAIL_FROM, NOTIFY_EMAIL
 */

const SQUARE_VERSION = "2025-06-18";
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (origin && !allowed.includes(origin)) return json({ error: "Origin not allowed" }, 403, cors);

    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/services") return json(await services(env, ctx), 200, cors, 600);
      if (request.method === "POST" && url.pathname === "/availability") return json(await availability(env, await body(request)), 200, cors);
      if (request.method === "POST" && url.pathname === "/book") return json(await book(env, await body(request)), 200, cors);
      if (request.method === "POST" && url.pathname === "/giftcard/purchase") return json(await giftPurchase(env, await body(request)), 200, cors);
      if (request.method === "GET" && url.pathname === "/giftcard/balance") return json(await giftBalance(env, url.searchParams.get("gan")), 200, cors);
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      console.error(err.stack || err, err.details ? JSON.stringify(err.details) : "");
      return json({ error: err.public || "Server error", code: err.code }, err.status || 500, cors);
    }
  },
};

/* ---------------- Square ---------------- */

async function sq(env, path, payload, method) {
  const base = env.SQUARE_ENV === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const res = await fetch(base + path, {
    method: method || (payload ? "POST" : "GET"),
    headers: {
      Authorization: "Bearer " + env.SQUARE_ACCESS_TOKEN,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error("Square " + res.status + " " + path);
    e.details = data.errors;
    e.status = res.status >= 500 ? 502 : 400;
    e.public = "Square error";
    throw e;
  }
  return data;
}

async function services(env, ctx) {
  const cache = caches.default;
  const key = new Request("https://cache.local/services/" + env.SQUARE_LOCATION_ID);
  const hit = await cache.match(key);
  if (hit) return hit.json();

  const out = [];
  let cursor;
  do {
    const r = await sq(env, "/v2/catalog/search-catalog-items", {
      product_types: ["APPOINTMENTS_SERVICE"],
      enabled_location_ids: [env.SQUARE_LOCATION_ID],
      limit: 100,
      cursor,
    });
    for (const item of r.items || []) {
      const v = (item.item_data.variations || []).find((x) => x.item_variation_data?.available_for_booking !== false);
      if (!v) continue;
      out.push({
        name: item.item_data.name,
        id: v.id,
        version: v.version,
        duration: Math.round((v.item_variation_data.service_duration || 0) / 60000),
        price: v.item_variation_data.price_money ? v.item_variation_data.price_money.amount / 100 : null,
      });
    }
    cursor = r.cursor;
  } while (cursor);

  const result = { services: out };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(result), { headers: { "Cache-Control": "max-age=600" } })));
  return result;
}

async function searchAvailability(env, ids, startAt, endAt) {
  const r = await sq(env, "/v2/bookings/availability/search", {
    query: {
      filter: {
        start_at_range: { start_at: startAt, end_at: endAt },
        location_id: env.SQUARE_LOCATION_ID,
        segment_filters: ids.map((id) => ({ service_variation_id: id })),
      },
    },
  });
  return r.availabilities || [];
}

async function availability(env, b) {
  const ids = Array.isArray(b.serviceVariationIds) ? b.serviceVariationIds.slice(0, 3) : [];
  if (!ids.length || !ids.every((id) => ID_RE.test(id))) throw bad("Invalid services");
  const days = Math.min(Math.max(parseInt(b.days, 10) || 14, 1), 31);
  const start = new Date(Date.now() + 60 * 60 * 1000); // desde dentro de 1 hora
  const end = new Date(start.getTime() + days * 864e5);
  const list = await searchAvailability(env, ids, start.toISOString(), end.toISOString());
  // una entrada por hora (si hay varias profesionales, nos quedamos con la primera)
  const seen = new Set();
  const slots = [];
  for (const a of list) {
    if (seen.has(a.start_at)) continue;
    seen.add(a.start_at);
    slots.push({ startAt: a.start_at, segments: a.appointment_segments });
  }
  return { slots };
}

async function book(env, b) {
  // ---- validación
  const c = b.customer || {};
  const clean = (s, n) => String(s || "").trim().slice(0, n);
  const given = clean(c.givenName, 60), family = clean(c.familyName, 60);
  const email = clean(c.email, 120).toLowerCase(), phone = clean(c.phone, 20);
  if (!given || !family) throw bad("Name required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("Invalid email");
  if (!/^\+\d{10,15}$/.test(phone)) throw bad("Invalid phone");
  if (!b.startAt || isNaN(Date.parse(b.startAt))) throw bad("Invalid time");
  const ids = (b.segments || []).map((s) => s.service_variation_id).filter((id) => ID_RE.test(id || ""));
  if (!ids.length) throw bad("Invalid services");
  const idem = clean(b.idempotencyKey, 64) || crypto.randomUUID();

  // ---- ¿sigue libre? (se usa lo que diga Square, no lo que mande el navegador)
  const from = new Date(Date.parse(b.startAt) - 60000);
  const to = new Date(from.getTime() + 864e5);
  const again = await searchAvailability(env, ids, from.toISOString(), to.toISOString());
  const match = again.find((a) => Date.parse(a.start_at) === Date.parse(b.startAt));
  if (!match) { const e = new Error("Slot taken"); e.status = 409; e.code = "SLOT_TAKEN"; e.public = "Slot taken"; throw e; }

  // ---- clienta: buscar por correo o crear
  let customerId;
  const found = await sq(env, "/v2/customers/search", { query: { filter: { email_address: { exact: email } } }, limit: 1 });
  if (found.customers && found.customers.length) {
    customerId = found.customers[0].id;
  } else {
    const created = await sq(env, "/v2/customers", {
      idempotency_key: idem + "-c",
      given_name: given,
      family_name: family,
      email_address: email,
      phone_number: phone,
      reference_id: "web",
    });
    customerId = created.customer.id;
  }

  // ---- tarjeta de garantía (Web Payments SDK → Cards API)
  if (b.cardToken) {
    try {
      await sq(env, "/v2/cards", { idempotency_key: idem + "-k", source_id: String(b.cardToken), card: { customer_id: customerId } });
    } catch (err) {
      err.code = "CARD"; err.public = "Card declined"; err.status = 402; throw err;
    }
  }

  // ---- cita
  const note = clean(b.note, 900);
  const r = await sq(env, "/v2/bookings", {
    idempotency_key: idem,
    booking: {
      start_at: match.start_at,
      location_id: env.SQUARE_LOCATION_ID,
      customer_id: customerId,
      customer_note: (note ? note + "\n" : "") + "Reservada desde nailsbymelyg.com (" + (b.lang === "en" ? "EN" : "ES") + ")",
      appointment_segments: match.appointment_segments,
    },
  }).catch((err) => {
    if (err.status === 400) { err.code = "SLOT_TAKEN"; err.status = 409; err.public = "Slot taken"; }
    throw err;
  });

  return { booking: { id: r.booking.id, startAt: r.booking.start_at, status: r.booking.status } };
}

/* ---------------- Gift cards ---------------- */
// La tarjeta es una gift card DIGITAL de Square: Square guarda el saldo y
// en el salón se cobra desde Square, que descuenta y no deja pasarse.
// El diseño (colores, mensaje, nombres) viaja en el enlace de la tarjeta.

const THEMES = ["burdeos", "rosa", "nude", "noche"];

async function giftPurchase(env, b) {
  const clean = (s, n) => String(s || "").trim().slice(0, n);
  const amount = Math.round(Number(b.amount));
  if (!(amount >= 25 && amount <= 1000)) throw bad("Invalid amount");
  const to = clean(b.to, 28), from = clean(b.from, 28), msg = clean(b.msg, 120), label = clean(b.label, 60);
  if (!to || !from) throw bad("Names required");
  const via = b.via === "email" ? "email" : "whatsapp";
  const contact = clean(b.contact, 120);
  if (via === "email" ? !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact) : contact.replace(/\D/g, "").length < 10) throw bad("Invalid contact");
  const buyerEmail = clean(b.buyerEmail, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(buyerEmail)) throw bad("Invalid email");
  if (!b.cardToken) throw bad("Card required");
  const idem = clean(b.idempotencyKey, 40) || crypto.randomUUID().slice(0, 36);
  const order = clean(b.order, 20);
  const money = { amount: amount * 100, currency: "USD" };

  // 1) cobro
  let payment;
  try {
    payment = (await sq(env, "/v2/payments", {
      idempotency_key: idem + "-p",
      source_id: String(b.cardToken),
      amount_money: money,
      location_id: env.SQUARE_LOCATION_ID,
      buyer_email_address: buyerEmail,
      reference_id: order || undefined,
      note: ("Gift card web · Para " + to + " · De " + from + (label ? " · " + label : "")).slice(0, 500),
    })).payment;
  } catch (err) { err.code = "CARD"; err.public = "Card declined"; err.status = 402; throw err; }

  // 2) crear y activar la gift card; si algo falla, se devuelve el dinero
  let card;
  try {
    card = (await sq(env, "/v2/gift-cards", { idempotency_key: idem + "-g", location_id: env.SQUARE_LOCATION_ID, gift_card: { type: "DIGITAL" } })).gift_card;
    await sq(env, "/v2/gift-cards/activities", {
      idempotency_key: idem + "-a",
      gift_card_activity: {
        type: "ACTIVATE",
        location_id: env.SQUARE_LOCATION_ID,
        gift_card_id: card.id,
        activate_activity_details: { amount_money: money, buyer_payment_instrument_ids: [payment.id], reference_id: order || undefined },
      },
    });
  } catch (err) {
    await sq(env, "/v2/refunds", { idempotency_key: idem + "-r", payment_id: payment.id, amount_money: money, reason: "Gift card could not be activated" }).catch((e) => console.error("REFUND FAILED", payment.id, e.details));
    err.code = "GIFT_FAILED"; err.public = "Gift card could not be created"; err.status = 502; throw err;
  }

  // 3) enlace con el diseño
  const design = {
    g: card.gan, a: amount, l: label, t: to, f: from, m: msg,
    th: THEMES.includes(b.theme) ? b.theme : "burdeos",
    p: Math.max(0, Math.min(7, parseInt(b.polish, 10) || 0)),
    lang: b.lang === "en" ? "en" : "es",
  };
  const link = (env.SITE_URL || "https://nailsbymelyg.com").replace(/\/$/, "") + "/giftcard.html?c=" + b64url(JSON.stringify(design));

  // 4) correo (opcional)
  let emailSent = false;
  if (via === "email" && env.RESEND_API_KEY && env.MAIL_FROM) {
    emailSent = await sendMail(env, contact, design, link).catch((e) => { console.error("MAIL", e); return false; });
  }
  if (env.RESEND_API_KEY && env.MAIL_FROM && env.NOTIFY_EMAIL) {
    sendMail(env, env.NOTIFY_EMAIL, design, link, "Nueva gift card vendida: $" + amount + " para " + to + " (de " + from + ")").catch(() => {});
  }

  return { gan: card.gan, amount, link, emailSent, receiptUrl: payment.receipt_url || null };
}

async function giftBalance(env, gan) {
  gan = String(gan || "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9]{8,20}$/.test(gan)) throw bad("Invalid code");
  try {
    const r = await sq(env, "/v2/gift-cards/from-gan", { gan });
    const g = r.gift_card;
    return { found: true, state: g.state, balance: g.balance_money ? g.balance_money.amount / 100 : 0 };
  } catch (err) {
    if (err.status === 400) return { found: false };
    throw err;
  }
}

async function sendMail(env, to, d, link, subject) {
  const dark = d.th === "burdeos" || d.th === "noche";
  const bg = { burdeos: "linear-gradient(135deg,#8A4453,#4E222C)", rosa: "linear-gradient(135deg,#F6E1E2,#C98E96)", nude: "linear-gradient(135deg,#F7EEE8,#C4A694)", noche: "linear-gradient(135deg,#403A47,#16121A)" }[d.th];
  const solid = { burdeos: "#662E3A", rosa: "#E7C2C5", nude: "#E3CDBF", noche: "#2A2430" }[d.th];
  const ink = dark ? "#F3ECE8" : "#4E222C";
  const en = d.lang === "en";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<div style="background:#F3ECE8;padding:32px 12px;font-family:Georgia,serif;color:#4E222C">
  <div style="max-width:560px;margin:0 auto">
    <p style="font:14px Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;margin:0 0 16px">${en ? "You got a gift" : "Tienes un regalo"}</p>
    <div style="background:${solid};background-image:${bg};border-radius:20px;padding:28px;color:${ink}">
      <p style="font:12px Arial,sans-serif;letter-spacing:.3em;margin:0 0 40px">NAILS BY MELYG · GIFT CARD</p>
      <p style="font:13px Arial,sans-serif;letter-spacing:.2em;margin:0">${en ? "FOR" : "PARA"}</p>
      <p style="font-style:italic;font-size:36px;margin:4px 0 8px">${esc(d.t)}</p>
      <p style="font:16px Arial,sans-serif;margin:0 0 36px;opacity:.9">${esc(d.m || "")}</p>
      <p style="font-size:56px;margin:0">$${d.a}</p>
      <p style="font:14px Arial,sans-serif;margin:8px 0 0">${en ? "From" : "De"} ${esc(d.f)} · ${esc(String(d.g).replace(/(.{4})/g, "$1 ").trim())}</p>
    </div>
    <p style="text-align:center;margin:28px 0"><a href="${link}" style="background:#662E3A;color:#F3ECE8;padding:16px 28px;text-decoration:none;font:14px Arial,sans-serif;letter-spacing:.14em">${en ? "SEE MY GIFT CARD" : "VER MI GIFT CARD"}</a></p>
    <p style="font:14px Arial,sans-serif;line-height:1.6;color:#7E5560">${en ? "Show this card at your appointment at 2727 N Mason Rd, Suite 301, Katy, TX. The balance is kept by Square." : "Muestra esta tarjeta en tu cita en 2727 N Mason Rd, Suite 301, Katy, TX. El saldo lo guarda Square."}</p>
  </div></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: subject || (en ? "Your Nails by MelyG gift card 💅" : "Tu gift card de Nails by MelyG 💅"), html }),
  });
  return r.ok;
}

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ---------------- utilidades ---------------- */

async function body(request) {
  const text = await request.text();
  if (text.length > 10000) throw bad("Too large");
  try { return JSON.parse(text || "{}"); } catch { throw bad("Invalid JSON"); }
}
function bad(msg) { const e = new Error(msg); e.status = 400; e.public = msg; return e; }
function json(data, status, headers, maxAge) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": maxAge ? "public, max-age=" + maxAge : "no-store" },
  });
}
