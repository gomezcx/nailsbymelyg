/**
 * Nails by MelyG — API de reservas (Cloudflare Worker)
 * Puente seguro entre la web y Square: el token de Square vive aquí,
 * nunca en el navegador.
 *
 *   GET  /services      → servicios reservables (id y versión de Square)
 *   POST /availability  → horarios libres para 1+ servicios seguidos
 *   POST /book          → crea/encuentra clienta, guarda tarjeta y crea la cita
 *
 * Variables (wrangler.toml / secretos):
 *   SQUARE_ACCESS_TOKEN  (secreto)   SQUARE_LOCATION_ID
 *   SQUARE_ENV = production|sandbox  ALLOWED_ORIGINS = "https://nailsbymelyg.com,https://www.nailsbymelyg.com"
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
