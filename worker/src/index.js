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
 *   POST /reminders/run  → (solo con X-Admin-Key) lanza los recordatorios a mano; ?dry=1 solo muestra
 *   Cron cada hora       → recordatorio por correo a las citas que empiezan dentro de REMINDER_HOURS
 *
 * Variables (wrangler.toml / secretos):
 *   SQUARE_ACCESS_TOKEN  (secreto)   SQUARE_LOCATION_ID
 *   SQUARE_ENV = production|sandbox  ALLOWED_ORIGINS = "https://nailsbymelyg.com,https://www.nailsbymelyg.com"
 *   SITE_URL = "https://nailsbymelyg.com"  (para el enlace de la tarjeta)
 *   Opcional, para enviar la gift card por correo: RESEND_API_KEY (secreto), MAIL_FROM, NOTIFY_EMAIL
 *   Recordatorios: RESEND_API_KEY + MAIL_FROM, REMINDER_HOURS = "24" (o "24,2"), ADMIN_KEY (secreto),
 *   WHATSAPP = "18323104747", MAPS_URL, ADDRESS, TIMEZONE = "America/Chicago"
 */

const SQUARE_VERSION = "2025-06-18";
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export default {
  // cron: cada hora busca las citas que empiezan dentro de REMINDER_HOURS y avisa
  // cron cada 15 min: recordatorios (solo en la hora en punto) y cancelación de citas sin confirmar
  async scheduled(event, env, ctx) {
    const log = (tag) => (e) => console.error(tag, e.stack || e, e.details ? JSON.stringify(e.details) : "");
    if (new Date(event.scheduledTime).getUTCMinutes() < 15) ctx.waitUntil(runReminders(env, { now: event.scheduledTime }).catch(log("REMINDERS")));
    ctx.waitUntil(autoCancelUnconfirmed(env, { now: event.scheduledTime }).catch(log("AUTOCANCEL")));
    ctx.waitUntil(courseSecondHalf(env, { now: event.scheduledTime }).catch(log("COURSE CHARGE")));
  },

  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowedList = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    // "https://nailsbymelyg.com." (con punto final) es el mismo dominio: se acepta igual
    const allowed = { includes: (o) => allowedList.includes(String(o).replace(/\.(:\d+)?$/, "$1")) };
    allowed[0] = allowedList[0];
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowedList[0] || "",
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
      if (request.method === "POST" && url.pathname === "/book") return json(await book(env, await body(request), ctx), 200, cors);
      if (request.method === "POST" && url.pathname === "/giftcard/purchase") return json(await giftPurchase(env, await body(request)), 200, cors);
      if (request.method === "POST" && url.pathname === "/waitlist") return json(await waitlistJoin(env, await body(request)), 200, cors);
      if (request.method === "POST" && url.pathname === "/confirm/lookup") return json(await confirmLookup(env, await body(request)), 200, cors);
      if (request.method === "POST" && url.pathname === "/course/availability") return json(await courseAvailability(env, await body(request), ctx), 200, cors);
      if (request.method === "POST" && url.pathname === "/course/book") return json(await courseBook(env, await body(request), ctx), 200, cors);
      if (request.method === "POST" && url.pathname === "/admin/booking/cancel") {
        if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "Forbidden" }, 403, cors);
        const id = url.searchParams.get("id") || "";
        if (!/^[a-z0-9]{8,40}$/i.test(id)) throw bad("Invalid id");
        const bk = (await sq(env, "/v2/bookings/" + id)).booking;
        if (bk.status !== "ACCEPTED" && bk.status !== "PENDING") return json({ id, status: bk.status }, 200, cors);
        const r = await sq(env, "/v2/bookings/" + id + "/cancel", { idempotency_key: "admin-" + id + "-" + bk.version, booking_version: bk.version });
        return json({ id, status: r.booking.status, start: r.booking.start_at }, 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/admin/mail/test") {
        if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "Forbidden" }, 403, cors);
        const to = url.searchParams.get("to") || "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw bad("Invalid email");
        const kind = url.searchParams.get("kind") === "reminder" ? "reminder" : "booked";
        const site = (env.SITE_URL || "https://nailsbymelyg.com").replace(/\/$/, "");
        const demo = { en: false, name: url.searchParams.get("name") || "Dilmelys", start: new Date(Date.now() + 864e5), minutes: 90, services: ["Manicura rusa + gel"], date: "Jueves, 1 de octubre", time: "9:00 a. m.", when: "jueves 1 de octubre 9:00 a. m.", confirmUrl: site + "/confirmar.html" };
        const mail = reminderMail(env, demo, kind === "reminder" ? 24 : 0, kind === "booked" ? "booked" : undefined);
        await resend(env, to, "[Prueba] " + mail.subject, mail.html, mail.text);
        return json({ sent: true, to, subject: mail.subject }, 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/admin/text/test") {
        if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "Forbidden" }, 403, cors);
        if (!texting(env)) return json({ error: "Twilio no está configurado" }, 400, cors);
        const kind = url.searchParams.get("kind") || "booked";
        const demo = { en: false, name: url.searchParams.get("name") || "Dilmelys", date: "Jueves, 1 de octubre", time: "9:00 a. m.", confirmUrl: (env.SITE_URL || "https://nailsbymelyg.com") + "/confirmar.html" };
        return json(await sendText(env, url.searchParams.get("to"), chatText(demo, kind)), 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/admin/courses/online") {
        if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "Forbidden" }, 403, cors);
        return json(await coursesOnline(env, url.searchParams.get("on") === "1"), 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/admin/courses/setup") {
        if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "Forbidden" }, 403, cors);
        return json(await coursesSetup(env, url.searchParams.has("dry")), 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/confirm/token") return json(await confirmByToken(env, await body(request)), 200, cors);
      if (request.method === "POST" && url.pathname === "/confirm/answer") return json(await confirmAnswer(env, await body(request), ctx), 200, cors);
      if (request.method === "POST" && url.pathname === "/confirm/run") {
        if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "Forbidden" }, 403, cors);
        const dry = url.searchParams.has("dry"); // ?now= solo para simular en modo prueba
        return json(await autoCancelUnconfirmed(env, { dry, now: dry ? url.searchParams.get("now") || undefined : undefined }), 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/reminders/run") {
        if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "Forbidden" }, 403, cors);
        return json(await runReminders(env, {
          dry: url.searchParams.has("dry"),
          hours: url.searchParams.get("hours"),
          testTo: url.searchParams.get("to"),
          testPhone: url.searchParams.get("phone"),
        }), 200, cors);
      }
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

async function services(env, ctx, fresh) {
  const cache = caches.default;
  const key = new Request("https://cache.local/services/" + env.SQUARE_LOCATION_ID);
  const hit = fresh ? null : await cache.match(key);
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
      const isCourse = Object.values(COURSES).some((c) => c.name === item.item_data.name); // los cursos se ocultan en Square pero se reservan desde la web
      const v = (item.item_data.variations || []).find((x) => isCourse || x.item_variation_data?.available_for_booking !== false);
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

async function book(env, b, ctx) {
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

  // ---- pago con gift card de Square: se comprueba el saldo y se vincula a la clienta
  // (en el salón aparece en su perfil y Mely la cobra desde Square)
  let sellerNote = "", giftCard = null;
  const gan = String(b.giftCardGan || "").replace(/\s/g, "");
  if (gan) {
    if (!/^[A-Za-z0-9]{8,20}$/.test(gan)) throw Object.assign(bad("Invalid gift card"), { code: "GIFT" });
    const g = await sq(env, "/v2/gift-cards/from-gan", { gan }).then((r) => r.gift_card).catch((err) => { if (err.status === 400 || err.status === 404) return null; throw err; });
    const balance = g && g.balance_money ? g.balance_money.amount / 100 : 0;
    if (!g || g.state !== "ACTIVE" || balance <= 0) { const e = bad("Gift card not valid"); e.code = "GIFT"; e.status = 402; throw e; }
    giftCard = g;
    sellerNote = "🎁 Paga con gift card •••• " + gan.slice(-4) + " (saldo al reservar $" + balance + ")";
  }

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

  if (giftCard && !(giftCard.customer_ids || []).includes(customerId)) {
    await sq(env, "/v2/gift-cards/" + giftCard.id + "/link-customer", { customer_id: customerId }).catch((err) => console.error("GIFT LINK", err.stack || err));
  }

  // ---- tarjeta de garantía (Web Payments SDK → Cards API)
  if (b.cardToken && !gan) {
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
      ...(sellerNote ? { seller_note: sellerNote } : {}),
      appointment_segments: match.appointment_segments,
    },
  }).catch((err) => {
    if (err.status === 400) { err.code = "SLOT_TAKEN"; err.status = 409; err.public = "Slot taken"; }
    throw err;
  });

  // tarjeta "te espero": por WhatsApp/SMS (Twilio) y por correo (Resend), lo que esté configurado
  if (ctx && (texting(env) || (env.RESEND_API_KEY && env.MAIL_FROM))) {
    ctx.waitUntil((async () => {
      const info = await reminderInfo(env, r.booking);
      info.confirmUrl = (env.SITE_URL || "https://nailsbymelyg.com").replace(/\/$/, "") + "/confirmar.html?t=" + encodeURIComponent(await makeToken(env, r.booking.id));
      if (texting(env) && info.phone) await sendText(env, info.phone, chatText(info, "booked")).catch((e) => console.error("BOOKED TEXT", e.stack || e));
      if (env.RESEND_API_KEY && env.MAIL_FROM && info.email) {
        const mail = reminderMail(env, info, 0, "booked");
        await resend(env, info.email, mail.subject, mail.html, mail.text);
      }
    })().catch((e) => console.error("BOOKED MSG", e.stack || e)));
  }

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

/* ---------------- Confirmación de asistencia ---------------- */
// La clienta confirma en nailsbymelyg.com/confirmar.html (enlace del SMS de Square).
// Confirmar → nota "✅ Confirmada" en la cita de Square. Si 1 h antes no confirmó
// (y reservó con más de 24 h), se cancela y se avisa a la lista de espera.

const CONFIRM_MARK = "✅ Confirmada por la clienta";
const TZ_DEFAULT = "America/Chicago";

function e164(phone) {
  const raw = String(phone || "").trim(), d = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && d.length >= 8 && d.length <= 15 && d[0] !== "1") return "+" + d; // números de fuera de EE. UU.
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return null;
}

async function hmac(env, data) {
  const secret = env.CONFIRM_SECRET || env.ADMIN_KEY;
  if (!secret) throw new Error("Falta CONFIRM_SECRET");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(String.fromCharCode(...new Uint8Array(sig))).slice(0, 32);
}
async function makeToken(env, bookingId) {
  const exp = Date.now() + 3 * 864e5;
  const data = bookingId + "." + exp;
  return data + "." + (await hmac(env, data));
}
async function readToken(env, token) {
  const [id, exp, sig] = String(token || "").split(".");
  if (!id || !exp || !sig || Date.now() > +exp) throw bad("Invalid token");
  if ((await hmac(env, id + "." + exp)) !== sig) throw bad("Invalid token");
  return id;
}

async function bookingSummary(env, b, en) {
  const info = await reminderInfo(env, b);
  return { id: b.id, when: info.when, date: info.date, time: info.time, services: info.services, name: info.name,
    confirmed: String(b.seller_note || "").includes(CONFIRM_MARK), status: b.status, start: b.start_at };
}

async function confirmLookup(env, b) {
  // basta con el teléfono o con el correo de la reserva
  const email = String(b.email || "").trim().toLowerCase();
  const phone = b.phone ? e164(b.phone) : null;
  let filter;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) filter = { email_address: { exact: email } };
  else if (phone) filter = { phone_number: { exact: phone } };
  else throw bad("Invalid data");
  const found = await sq(env, "/v2/customers/search", { query: { filter }, limit: 10 });
  const now = Date.now();
  const out = [];
  for (const c of found.customers || []) {
    const q = new URLSearchParams({ customer_id: c.id, location_id: env.SQUARE_LOCATION_ID,
      start_at_min: new Date(now).toISOString(), start_at_max: new Date(now + 31 * 864e5).toISOString(), limit: "20" });
    const r = await sq(env, "/v2/bookings?" + q.toString());
    for (const bk of r.bookings || []) {
      if (bk.status !== "ACCEPTED" && bk.status !== "PENDING") continue;
      out.push(Object.assign(await bookingSummary(env, bk), { token: await makeToken(env, bk.id) }));
    }
  }
  out.sort((a, b2) => Date.parse(a.start) - Date.parse(b2.start));
  return { bookings: out.slice(0, 5) };
}

// enlace directo del recordatorio: nailsbymelyg.com/confirmar.html?t=… abre la cita sin escribir nada
async function confirmByToken(env, b) {
  const id = await readToken(env, b.token);
  const bk = (await sq(env, "/v2/bookings/" + id)).booking;
  if (bk.status !== "ACCEPTED" && bk.status !== "PENDING") return { bookings: [], cancelled: true };
  return { bookings: [Object.assign(await bookingSummary(env, bk), { token: String(b.token) })] };
}

async function confirmAnswer(env, b, ctx) {
  const id = await readToken(env, b.token);
  const bk = (await sq(env, "/v2/bookings/" + id)).booking;
  if (bk.status !== "ACCEPTED" && bk.status !== "PENDING") return { status: "already_cancelled" };
  if (b.answer === "yes") {
    if (!String(bk.seller_note || "").includes(CONFIRM_MARK)) {
      const note = ((bk.seller_note ? bk.seller_note + "\n" : "") + CONFIRM_MARK + " (" + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC)").slice(0, 4000);
      await sq(env, "/v2/bookings/" + id, { idempotency_key: crypto.randomUUID(), booking: { version: bk.version, seller_note: note } }, "PUT");
    }
    return { status: "confirmed" };
  }
  if (b.answer === "no") {
    await sq(env, "/v2/bookings/" + id + "/cancel", { idempotency_key: crypto.randomUUID(), booking_version: bk.version });
    ctx && ctx.waitUntil(notifyWaitlist(env, bk).catch((e) => console.error("WAITLIST", e.stack || e)));
    return { status: "cancelled" };
  }
  throw bad("Invalid answer");
}

async function autoCancelUnconfirmed(env, opt) {
  if (env.REQUIRE_CONFIRM === "0") return { disabled: true };
  const now = opt.now ? new Date(opt.now) : new Date();
  const list = await listBookings(env, now, new Date(now.getTime() + 60 * 60e3)); // empiezan dentro de 1 h
  const out = [];
  for (const b of list) {
    if (b.status !== "ACCEPTED") continue;
    if (String(b.seller_note || "").includes(CONFIRM_MARK)) continue;
    if (String(b.seller_note || "").includes(COURSE_MARK)) continue; // los cursos ya están pagados a medias
    // solo citas reservadas después de activar la política (las anteriores no la aceptaron)
    // CONFIRM_ALL_FROM: desde esa fecha de cita, también las reservas antiguas (clientas avisadas por el recordatorio)
    const newPolicy = env.CONFIRM_SINCE && Date.parse(b.created_at) >= Date.parse(env.CONFIRM_SINCE);
    const allFrom = env.CONFIRM_ALL_FROM && Date.parse(b.start_at) >= Date.parse(env.CONFIRM_ALL_FROM);
    if (!newPolicy && !allFrom) continue;
    // solo si reservó con más de 24 h (recibió el recordatorio con el enlace para confirmar)
    if (Date.parse(b.start_at) - Date.parse(b.created_at) < 24 * 3600e3) continue;
    if (!opt.dry) {
      await sq(env, "/v2/bookings/" + b.id + "/cancel", { idempotency_key: "auto-" + b.id + "-" + b.version, booking_version: b.version });
      await notifyWaitlist(env, b).catch((e) => console.error("WAITLIST", e.stack || e));
    }
    out.push({ booking: b.id, start: b.start_at, cancelled: !opt.dry });
  }
  return { checkedAt: now.toISOString(), cancelled: out };
}

/* ---------------- Lista de espera ---------------- */
// Se guarda en KV por día (hora de Houston). Cuando se libera una cita ese día,
// se avisa por correo (Resend) a quienes esperaban, con el enlace para reservar.

function ymdTZ(d, tz) { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || TZ_DEFAULT, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }

async function waitlistJoin(env, b) {
  if (!env.WAITLIST) throw new Error("Falta KV WAITLIST");
  const clean = (s, n) => String(s || "").trim().slice(0, n);
  const name = clean(b.name, 60), email = clean(b.email, 120).toLowerCase(), phone = e164(b.phone);
  const date = clean(b.date, 10), service = clean(b.service, 80), lang = b.lang === "en" ? "en" : "es";
  if (!name) throw bad("Name required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad("Invalid email");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad("Invalid date");
  const today = ymdTZ(new Date(), env.TIMEZONE);
  if (date < today) throw bad("Past date");
  const key = "wl:" + date + ":" + email;
  const ttl = Math.max(3600, Math.round((Date.parse(date + "T23:59:59-06:00") - Date.now()) / 1000) + 86400);
  await env.WAITLIST.put(key, JSON.stringify({ name, email, phone, date, service, lang, at: Date.now() }), { expirationTtl: ttl });
  if (env.RESEND_API_KEY && env.MAIL_FROM && env.NOTIFY_EMAIL) {
    resend(env, env.NOTIFY_EMAIL, "Lista de espera: " + name + " para el " + date, `<p>${name} (${email}${phone ? ", " + phone : ""}) se apuntó a la lista de espera para el <b>${date}</b>${service ? " · " + service : ""}.</p>`, "").catch(() => {});
  }
  return { ok: true };
}

async function notifyWaitlist(env, booking) {
  if (!env.WAITLIST) return { sent: 0 };
  const tz = env.TIMEZONE || TZ_DEFAULT;
  const start = new Date(booking.start_at);
  if (start.getTime() < Date.now() + 20 * 60e3) return { sent: 0 }; // demasiado tarde para aprovecharla
  const date = ymdTZ(start, tz);
  const list = await env.WAITLIST.list({ prefix: "wl:" + date + ":" });
  const site = (env.SITE_URL || "https://nailsbymelyg.com").replace(/\/$/, "");
  let sent = 0;
  for (const k of list.keys) {
    const e = JSON.parse((await env.WAITLIST.get(k.name)) || "null");
    if (!e || e.notified) continue;
    const en = e.lang === "en";
    const time = new Intl.DateTimeFormat(en ? "en-US" : "es-US", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(start);
    const subject = en ? "A spot just opened: " + time : "Se liberó un hueco: " + time;
    const html = `<div style="font-family:Arial,sans-serif;color:#4E222C;max-width:520px;margin:auto;padding:24px;background:#FAF6F3;border:1px solid #D9C3C0">
      <p style="font-size:15px">${en ? "Hi" : "Hola"} ${e.name},</p>
      <h2 style="font-family:Georgia,serif;font-weight:400;font-style:italic">${en ? "A spot just opened up 💅" : "Se liberó un hueco 💅"}</h2>
      <p style="font-size:16px"><b>${time}</b></p>
      <p style="font-size:14px;color:#7E5560">${en ? "It goes to whoever books first." : "Es para la primera que lo reserve."}</p>
      <p><a href="${site}/reservar.html" style="display:inline-block;background:#662E3A;color:#F3ECE8;padding:14px 22px;text-decoration:none;font-size:13px;letter-spacing:.14em">${en ? "BOOK NOW" : "RESERVAR AHORA"}</a></p></div>`;
    if (env.RESEND_API_KEY && env.MAIL_FROM) {
      await resend(env, e.email, subject, html, subject + " " + site + "/reservar.html").catch((er) => console.error("WL MAIL", er));
      e.notified = Date.now();
      await env.WAITLIST.put(k.name, JSON.stringify(e), { expirationTtl: 86400 });
      sent++;
    } else {
      console.log("WAITLIST (sin correo configurado) avisar a", e.email, "hueco", booking.start_at);
    }
  }
  return { sent };
}

/* ---------------- Recordatorios de cita ---------------- */
// Cada hora: citas que empiezan dentro de N horas (ventana de 1 hora, así
// cada cita recibe un solo aviso por cada N) → correo personalizado.

// Nombre en Square → nombre de la web [es, en] (copiado de assets/js/data.js, campo "sq")
const SERVICE_NAMES = {"manicure russo & gel (shellac)": ["Manicura rusa + gel", "Russian manicure + gel"], "russian manicure & rubber base": ["Manicura rusa + rubber base", "Russian manicure + rubber base"], "russian manicure & builder gel": ["Manicura rusa + builder gel", "Russian manicure + builder gel"], "manicure russo & gel x": ["Manicura rusa + Gel‑X", "Russian manicure + Gel‑X"], "manicure russo & poly gel": ["Manicura rusa + Poly Gel", "Russian manicure + Poly Gel"], "manicure natural nails & poly gel": ["Uñas naturales + Poly Gel", "Natural nails + Poly Gel"], "manicure extension nails & builder gel": ["Extensiones + builder gel", "Extensions + builder gel"], "russian pedicure & gel (shellac)": ["Pedicura rusa + gel", "Russian pedicure + gel"], "russian pedicure & rubber base": ["Pedicura rusa + rubber base", "Russian pedicure + rubber base"], "manicure & pedicure for men's": ["Manicura y pedicura para hombres", "Men’s manicure & pedicure"], "service to remove previous product": ["Retirada de producto anterior", "Removal of previous product"], "manicure and pedicure service for children": ["Manicura y pedicura para niños", "Kids’ manicure & pedicure"]};

function normName(n) { return String(n).toLowerCase().replace(/[\u2018\u2019`]/g, "'").replace(/\s+/g, " ").trim(); }

async function runReminders(env, opt) {
  const now = opt.now ? new Date(opt.now) : new Date();
  const hoursList = String(opt.hours || env.REMINDER_HOURS || "24").split(",").map((h) => parseInt(h, 10)).filter((h) => h > 0 && h <= 72);
  const report = [];
  for (const h of hoursList) {
    // ventana [ahora+h, ahora+h+1) redondeada a la hora
    const from = new Date(now); from.setUTCMinutes(0, 0, 0); from.setUTCHours(from.getUTCHours() + h);
    const to = new Date(from.getTime() + 3600e3);
    const list = await listBookings(env, from, to);
    for (const b of list) {
      if (b.status !== "ACCEPTED" && b.status !== "PENDING") continue;
      try {
        const info = await reminderInfo(env, b);
        info.confirmUrl = (env.SITE_URL || "https://nailsbymelyg.com").replace(/\/$/, "") + "/confirmar.html?t=" + encodeURIComponent(await makeToken(env, b.id));
        // WhatsApp / SMS (Twilio): no depende de que abra el correo
        let chat = null;
        if (texting(env) && (info.phone || opt.testPhone)) {
          chat = opt.dry ? "dry" : await sendText(env, opt.testPhone || info.phone, chatText(info, h > 3 ? "reminder" : "soon")).catch((e) => "error: " + e.message);
        }
        if (!info.email || info.unsubscribed || !env.RESEND_API_KEY || !env.MAIL_FROM) { report.push({ booking: b.id, chat, mail: "skipped" }); continue; }
        const mail = reminderMail(env, info, h);
        const target = opt.testTo || info.email;
        if (!opt.dry) await resend(env, target, mail.subject, mail.html, mail.text);
        report.push({ booking: b.id, to: target, when: info.when, hours: h, sent: !opt.dry, subject: mail.subject, chat });
      } catch (e) {
        console.error("REMINDER", b.id, e.stack || e);
        report.push({ booking: b.id, error: String(e.message || e) });
      }
    }
  }
  return { checkedAt: now.toISOString(), reminders: report };
}

async function listBookings(env, from, to) {
  const out = [];
  let cursor;
  do {
    const q = new URLSearchParams({ location_id: env.SQUARE_LOCATION_ID, start_at_min: from.toISOString(), start_at_max: to.toISOString(), limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const r = await sq(env, "/v2/bookings?" + q.toString());
    out.push(...(r.bookings || []));
    cursor = r.cursor;
  } while (cursor);
  return out;
}

async function reminderInfo(env, b) {
  const tz = env.TIMEZONE || "America/Chicago";
  const en = /\(EN\)/.test(b.customer_note || "");
  const c = b.customer_id ? (await sq(env, "/v2/customers/" + b.customer_id)).customer : {};
  // nombres de los servicios reservados
  const ids = (b.appointment_segments || []).map((s) => s.service_variation_id).filter(Boolean);
  let services = [];
  let minutes = (b.appointment_segments || []).reduce((n, s) => n + (s.duration_minutes || 0), 0);
  if (ids.length) {
    const r = await sq(env, "/v2/catalog/batch-retrieve", { object_ids: ids, include_related_objects: true });
    const items = {};
    (r.related_objects || []).forEach((o) => { if (o.type === "ITEM") items[o.id] = o.item_data.name; });
    services = (r.objects || []).map((o) => items[o.item_variation_data?.item_id] || o.item_variation_data?.name).filter(Boolean)
      .map((n) => { const w = SERVICE_NAMES[normName(n)]; return w ? w[en ? 1 : 0] : n; });
  }
  const start = new Date(b.start_at);
  const loc = en ? "en-US" : "es-US";
  const date = new Intl.DateTimeFormat(loc, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(start);
  const time = new Intl.DateTimeFormat(loc, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(start);
  return {
    id: b.id, en, start, minutes, services,
    name: c.given_name || "", email: c.email_address || "", phone: c.phone_number || "",
    unsubscribed: !!(c.preferences && c.preferences.email_unsubscribed),
    date: date.charAt(0).toUpperCase() + date.slice(1), time,
    when: date + " " + time,
  };
}

function reminderMail(env, i, hours, kind) {
  const booked = kind === "booked";
  const en = i.en;
  const address = env.ADDRESS || "2727 N Mason Rd, Suite 301, Katy, TX 77449";
  const maps = env.MAPS_URL || "https://maps.app.goo.gl/jeEr8PQE1xyBjdHz8";
  const wa = "https://wa.me/" + (env.WHATSAPP || "18323104747") + "?text=" + encodeURIComponent(en ? "Hi Mely, about my appointment on " + i.when : "Hola Mely, sobre mi cita del " + i.when);
  const site = (env.SITE_URL || "https://nailsbymelyg.com").replace(/\/$/, "");
  const end = new Date(i.start.getTime() + (i.minutes || 90) * 60000);
  const gcal = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent("Nails by MelyG" + (i.services.length ? " · " + i.services.join(" + ") : "")) +
    "&dates=" + stamp(i.start) + "/" + stamp(end) +
    "&location=" + encodeURIComponent(address) +
    "&details=" + encodeURIComponent(en ? "Change or cancel at least 24 h ahead: " + wa : "Cambios o cancelaciones con 24 h de anticipación: " + wa);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hello = i.name ? (en ? "Hi " : "Hola ") + esc(i.name) + "," : (en ? "Hi," : "Hola,");
  const soon = hours <= 3;
  const lead = booked ? (en ? (i.name ? esc(i.name) + ", I can’t wait to see you 💅" : "I can’t wait to see you 💅") : (i.name ? esc(i.name) + ", te espero 💅" : "Te espero 💅"))
    : soon ? (en ? "See you in a little while 💅" : "Te espero en un ratito 💅") : (en ? "See you tomorrow 💅" : "Te espero mañana 💅");
  const svc = i.services.length ? esc(i.services.join(" + ")) : (en ? "Your appointment" : "Tu cita");
  const dur = i.minutes ? (Math.floor(i.minutes / 60) ? Math.floor(i.minutes / 60) + " h " : "") + (i.minutes % 60 ? (i.minutes % 60) + " min" : "") : "";
  const subject = booked
    ? (en ? "You’re booked! " + i.date + " at " + i.time + " 💅" : "¡Tu cita está lista! " + i.date + " a las " + i.time + " 💅")
    : soon
    ? (en ? "Your appointment is at " + i.time + " today 💅" : "Tu cita es hoy a las " + i.time + " 💅")
    : (en ? "Reminder: " + i.date + " at " + i.time + " · Nails by MelyG" : "Recordatorio: " + i.date + " a las " + i.time + " · Nails by MelyG");
  const btn = (href, label, solid) => `<a href="${href}" style="display:inline-block;margin:0 8px 10px 0;padding:14px 22px;text-decoration:none;font:600 13px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;${solid ? "background:#662E3A;color:#F3ECE8" : "border:1px solid #662E3A;color:#662E3A"}">${label}</a>`;
  const html = `<!doctype html><html lang="${en ? "en" : "es"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0"><div style="background:#F3ECE8;padding:32px 12px;color:#4E222C">
  <div style="max-width:560px;margin:0 auto;background:#FAF6F3;border:1px solid #D9C3C0">
    <div style="background:#662E3A;padding:26px 28px;text-align:left">
      <img src="${site}/assets/img/logo-light.png" width="150" alt="Nails by MelyG" style="display:block;border:0">
    </div>
    <div style="padding:30px 28px 10px;font-family:Georgia,serif">
      <p style="font:15px Arial,sans-serif;margin:0 0 6px;color:#7E5560">${hello}</p>
      <h1 style="font-weight:400;font-style:italic;font-size:34px;line-height:1.15;margin:0 0 ${booked ? 12 : 24}px">${lead}</h1>
      ${booked ? `<p style="font:16px Arial,sans-serif;line-height:1.6;margin:0 0 24px;color:#4E222C">${en ? "Your time with me is booked. Come relaxed: that time is all yours and we’re going to enjoy it. A day before, I’ll send you a reminder so you can confirm." : "Ya tienes tu hora conmigo. Ven sin prisa: ese rato es solo tuyo y lo vamos a disfrutar. Un día antes te mando un recordatorio para que la confirmes."}</p>` : ""}
      <table role="presentation" style="width:100%;border-collapse:collapse;font:16px Arial,sans-serif">
        <tr><td style="padding:12px 0;border-top:1px solid #D9C3C0;color:#7E5560;width:34%">${en ? "Service" : "Servicio"}</td><td style="padding:12px 0;border-top:1px solid #D9C3C0">${svc}${dur ? ` <span style="color:#7E5560">· ${dur}</span>` : ""}</td></tr>
        <tr><td style="padding:12px 0;border-top:1px solid #D9C3C0;color:#7E5560">${en ? "When" : "Cuándo"}</td><td style="padding:12px 0;border-top:1px solid #D9C3C0"><b>${esc(i.date)}</b><br>${esc(i.time)} <span style="color:#7E5560">(${en ? "Houston time" : "hora de Houston"})</span></td></tr>
        <tr><td style="padding:12px 0;border-top:1px solid #D9C3C0;border-bottom:1px solid #D9C3C0;color:#7E5560">${en ? "Where" : "Dónde"}</td><td style="padding:12px 0;border-top:1px solid #D9C3C0;border-bottom:1px solid #D9C3C0"><a href="${maps}" style="color:#662E3A">${esc(address)}</a></td></tr>
      </table>
      ${i.confirmUrl ? `<p style="font:15px Arial,sans-serif;line-height:1.6;margin:26px 0 12px">${en ? "Please confirm you’re coming. If it isn’t confirmed 1 hour before, the spot is released." : "Confirma que vienes, por favor. Si no está confirmada 1 hora antes, la cita se libera."}</p><p style="margin:0">${btn(i.confirmUrl, en ? "Confirm my appointment" : "Confirmar mi cita", true)}</p>` : ""}
      <div style="margin:26px 0 8px">${btn(maps, en ? "Get directions" : "Cómo llegar", true)}${btn(gcal, en ? "Add to calendar" : "Añadir al calendario", false)}</div>
      <p style="font:14px Arial,sans-serif;line-height:1.6;color:#7E5560;margin:18px 0">${en
        ? "Coming in with gel or acrylic from another salon? Let me know so I can plan the removal. If you need to change or cancel, please message me at least 24 hours ahead."
        : "¿Vienes con gel o acrílico de otro salón? Avísame para separar el tiempo de la retirada. Si necesitas cambiar o cancelar, escríbeme con al menos 24 horas de anticipación."}</p>
      <p style="margin:0 0 28px">${btn(wa, en ? "Message me on WhatsApp" : "Escribirme por WhatsApp", false)}</p>
    </div>
    <div style="padding:18px 28px;border-top:1px solid #D9C3C0;font:12px Arial,sans-serif;color:#7E5560">Nails by MelyG · ${esc(address)} · <a href="${site}" style="color:#7E5560">nailsbymelyg.com</a></div>
  </div></div></body></html>`;
  const text = `${hello}\n${lead}\n\n${i.confirmUrl ? (en ? "Confirm your appointment: " : "Confirma tu cita: ") + i.confirmUrl + "\n\n" : ""}${i.services.join(" + ") || ""}\n${i.date}, ${i.time}\n${address}\n${maps}\n\n${en ? "Change or cancel 24 h ahead" : "Cambios o cancelaciones con 24 h de anticipación"}: ${wa}`;
  return { subject, html, text };
}

function stamp(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }

/* ---------------- WhatsApp y SMS (Twilio) ----------------
   Secretos: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN. Vars: TWILIO_SMS_FROM (+1…) y/o TWILIO_WA_FROM (whatsapp:+1…).
   Primero intenta WhatsApp; si no llega (o no está configurado), manda SMS. */
function texting(env) { return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_SMS_FROM || env.TWILIO_WA_FROM)); }

function chatText(i, kind) {
  const en = i.en, hi = i.name ? (en ? i.name : i.name) : "";
  const place = "2727 N Mason Rd, Suite 301, Katy";
  if (kind === "booked") return en
    ? `💅 ${hi ? hi + ", " : ""}I can't wait to see you! Your appointment at Nails by MelyG is booked: ${i.date} at ${i.time}. 📍 ${place}. Your card and details: ${i.confirmUrl} — Mely`
    : `💅 ¡${hi ? hi + ", " : ""}te espero! Tu cita en Nails by MelyG ya está lista: ${i.date} a las ${i.time}. 📍 ${place}. Tu tarjeta y los detalles: ${i.confirmUrl} — Mely`;
  if (kind === "soon") return en
    ? `💕 ${hi ? hi + ", " : ""}see you in a little while at ${i.time}! 📍 ${place}. — Mely`
    : `💕 ${hi ? hi + ", " : ""}¡te espero en un ratito, a las ${i.time}! 📍 ${place}. — Mely`;
  return en
    ? `💅 Hi ${hi || "there"}! Tomorrow I'm waiting for you at ${i.time} at Nails by MelyG. Please confirm here (if it's not confirmed 1 h before, the spot is released): ${i.confirmUrl} — Mely`
    : `💅 ¡Hola ${hi || "linda"}! Mañana te espero a las ${i.time} en Nails by MelyG. Confírmame aquí, porfa (si no está confirmada 1 h antes, la cita se libera): ${i.confirmUrl} — Mely`;
}

async function sendText(env, to, body) {
  const phone = e164(to);
  if (!phone) throw new Error("Invalid phone");
  const send = (from, dest) => fetch("https://api.twilio.com/2010-04-01/Accounts/" + env.TWILIO_ACCOUNT_SID + "/Messages.json", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(env.TWILIO_ACCOUNT_SID + ":" + env.TWILIO_AUTH_TOKEN), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: from, To: dest, Body: body }),
  }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error("Twilio " + r.status + " " + (j.message || "")); return j.sid; });
  if (env.TWILIO_WA_FROM) {
    try { return { whatsapp: await send(env.TWILIO_WA_FROM, "whatsapp:" + phone) }; }
    catch (e) { if (!env.TWILIO_SMS_FROM) throw e; console.error("WHATSAPP", e.message); }
  }
  return { sms: await send(env.TWILIO_SMS_FROM, phone) };
}

async function resend(env, to, subject, html, text) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, text, reply_to: env.NOTIFY_EMAIL || undefined }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + " " + (await r.text()).slice(0, 200));
  return true;
}

/* ---------------- Cursos ---------------- */
// Se reservan como una cita privada: la alumna elige un día libre de la agenda (el ruso, dos días seguidos)
// y ese horario queda bloqueado en Square. Al inscribirse paga el 50 % con Square; la tarjeta queda
// guardada y el otro 50 % se cobra solo cuando termina el curso (cron).

const COURSE_MARK = "🎓 Curso";
const COURSES = {
  russian: { name: "Curso Manicura Rusa", days: 2, price: 550, es: "Manicura rusa desde cero", en: "Russian manicure from scratch" },
  gelx: { name: "Curso Gel-X", days: 1, price: 550, es: "Gel-X", en: "Gel-X" },
};
const COURSE_START = "09:00", COURSE_HOURS = 8;

async function coursesSetup(env, dry) {
  const list = (await services(env, { waitUntil() {} }, true)).services;
  const sample = list.find((x) => !/curso/i.test(x.name));
  if (!sample) throw new Error("No hay servicios de ejemplo");
  const v = (await sq(env, "/v2/catalog/object/" + sample.id)).object;
  const team = v.item_variation_data.team_member_ids || [];
  const todo = Object.entries(COURSES).filter(([, c]) => !list.some((x) => x.name === c.name));
  const objects = todo.map(([key, c]) => ({
    type: "ITEM", id: "#" + key, present_at_all_locations: false, present_at_location_ids: [env.SQUARE_LOCATION_ID],
    item_data: {
      name: c.name, product_type: "APPOINTMENTS_SERVICE",
      description: "Curso privado de " + c.days + " día" + (c.days > 1 ? "s" : "") + ", " + COURSE_START + "–" + (9 + COURSE_HOURS) + ":00. Se paga 50 % al inscribirse y 50 % al terminar.",
      variations: [{
        type: "ITEM_VARIATION", id: "#" + key + "-v", present_at_all_locations: false, present_at_location_ids: [env.SQUARE_LOCATION_ID],
        item_variation_data: {
          name: "Día de curso", pricing_type: "FIXED_PRICING", price_money: { amount: Math.round(c.price * 100 / c.days), currency: "USD" },
          service_duration: COURSE_HOURS * 3600e3, available_for_booking: true, team_member_ids: team,
        },
      }],
    },
  }));
  if (dry || !objects.length) return { dry, create: objects.map((o) => o.item_data.name), existing: list.filter((x) => /curso/i.test(x.name)).map((x) => x.name) };
  const r = await sq(env, "/v2/catalog/batch-upsert", { idempotency_key: crypto.randomUUID(), batches: [{ objects }] });
  await caches.default.delete(new Request("https://cache.local/services/" + env.SQUARE_LOCATION_ID));
  return { created: (r.objects || []).filter((o) => o.type === "ITEM").map((o) => ({ name: o.item_data.name, id: o.id })) };
}

// los cursos no se reservan en la página de Square (ahí no se cobra el 50 %): solo desde la web
async function coursesOnline(env, on) {
  const list = (await services(env, { waitUntil() {} }, true)).services.filter((x) => Object.values(COURSES).some((c) => c.name === x.name));
  const objects = [];
  for (const x of list) {
    const v = (await sq(env, "/v2/catalog/object/" + x.id)).object;
    v.item_variation_data.available_for_booking = on;
    objects.push(v);
  }
  if (objects.length) await sq(env, "/v2/catalog/batch-upsert", { idempotency_key: crypto.randomUUID(), batches: [{ objects }] });
  await caches.default.delete(new Request("https://cache.local/services/" + env.SQUARE_LOCATION_ID));
  return { updated: list.map((x) => x.name), available_for_booking: on };
}

async function courseVariation(env, ctx, key) {
  const c = COURSES[key];
  if (!c) throw bad("Invalid course");
  const v = (await services(env, ctx)).services.find((x) => x.name === c.name);
  if (!v) { const e = new Error("Course not set up"); e.status = 503; e.public = "Course not available"; throw e; }
  return { c, v };
}

function localParts(iso, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
}

// días con la jornada del curso libre entera (cada día por separado; la alumna elige cuáles)
async function courseFreeDays(env, v, from, to) {
  const tz = env.TIMEZONE || TZ_DEFAULT;
  const list = await searchAvailability(env, [v.id], from.toISOString(), to.toISOString());
  const byDay = {};
  for (const a of list) { const l = localParts(a.start_at, tz); if (l.time === COURSE_START && !byDay[l.date]) byDay[l.date] = a; }
  return byDay;
}

async function courseAvailability(env, b, ctx) {
  const { c, v } = await courseVariation(env, ctx, b.course);
  const from = new Date(Date.now() + 48 * 3600e3); // con 2 días de margen para preparar el kit
  const byDay = await courseFreeDays(env, v, from, new Date(from.getTime() + 31 * 864e5));
  return { days: Object.keys(byDay).sort().map((date) => ({ date, start: byDay[date].start_at })), price: c.price, deposit: c.price / 2, daysPerCourse: c.days };
}

async function findOrCreateCustomer(env, cu, idem) {
  const found = await sq(env, "/v2/customers/search", { query: { filter: { email_address: { exact: cu.email } } }, limit: 1 });
  if (found.customers && found.customers.length) return found.customers[0].id;
  const created = await sq(env, "/v2/customers", { idempotency_key: idem + "-c", given_name: cu.given, family_name: cu.family, email_address: cu.email, phone_number: cu.phone, reference_id: "web" });
  return created.customer.id;
}

async function courseBook(env, b, ctx) {
  const k = b.customer || {};
  const clean = (x, n) => String(x || "").trim().slice(0, n);
  const cu = { given: clean(k.givenName, 60), family: clean(k.familyName, 60), email: clean(k.email, 120).toLowerCase(), phone: clean(k.phone, 20) };
  if (!cu.given || !cu.family) throw bad("Name required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cu.email)) throw bad("Invalid email");
  if (!/^\+\d{10,15}$/.test(cu.phone)) throw bad("Invalid phone");
  const dates = (Array.isArray(b.dates) ? b.dates : [b.date]).map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!b.cardToken) throw Object.assign(bad("Card required"), { code: "CARD" });
  const idem = clean(b.idempotencyKey, 40) || crypto.randomUUID();
  const { c, v } = await courseVariation(env, ctx, b.course);
  if (dates.length !== c.days || new Set(dates).size !== c.days) throw bad("Invalid dates");

  // ¿siguen libres esos días? (lo que diga Square)
  const from = new Date(Date.parse(dates[0] + "T00:00:00Z") - 864e5);
  const to = new Date(Date.parse(dates[dates.length - 1] + "T00:00:00Z") + 2 * 864e5);
  const byDay = await courseFreeDays(env, v, from, to);
  if (!dates.every((d) => byDay[d])) { const e = new Error("Slot taken"); e.status = 409; e.code = "SLOT_TAKEN"; e.public = "Slot taken"; throw e; }
  const pick = { slots: dates.map((d) => byDay[d]) };

  const customerId = await findOrCreateCustomer(env, cu, idem);
  let cardId;
  try {
    cardId = (await sq(env, "/v2/cards", { idempotency_key: idem + "-k", source_id: String(b.cardToken), card: { customer_id: customerId } })).card.id;
  } catch (err) { err.code = "CARD"; err.public = "Card declined"; err.status = 402; throw err; }

  const half = Math.round(c.price * 100 / 2);
  let payment;
  try {
    payment = (await sq(env, "/v2/payments", {
      idempotency_key: idem + "-p1", source_id: cardId, customer_id: customerId, location_id: env.SQUARE_LOCATION_ID,
      amount_money: { amount: half, currency: "USD" }, autocomplete: true, reference_id: "curso-" + b.course,
      note: c.name + " · 1ª mitad (50 %) · " + cu.given + " " + cu.family,
    })).payment;
  } catch (err) { err.code = "CARD"; err.public = "Card declined"; err.status = 402; throw err; }

  const note = COURSE_MARK + ": " + c.name + " · pagado 50 % ($" + half / 100 + "). El otro 50 % se cobra solo a la tarjeta guardada al terminar el curso.";
  const ids = [];
  try {
    for (let i = 0; i < pick.slots.length; i++) {
      const a = pick.slots[i];
      const r = await sq(env, "/v2/bookings", {
        idempotency_key: idem + "-b" + i,
        booking: {
          start_at: a.start_at, location_id: env.SQUARE_LOCATION_ID, customer_id: customerId,
          appointment_segments: a.appointment_segments,
          customer_note: c.name + (c.days > 1 ? " · día " + (i + 1) + " de " + c.days : "") + " · inscrita desde nailsbymelyg.com (" + (b.lang === "en" ? "EN" : "ES") + ")",
          seller_note: note,
        },
      });
      ids.push(r.booking.id);
    }
  } catch (err) {
    // no se pudo apartar: se deshace todo y se devuelve el dinero
    for (const id of ids) {
      const bk = (await sq(env, "/v2/bookings/" + id).catch(() => ({}))).booking;
      if (bk) await sq(env, "/v2/bookings/" + id + "/cancel", { idempotency_key: "undo-" + id, booking_version: bk.version }).catch(() => {});
    }
    await sq(env, "/v2/refunds", { idempotency_key: idem + "-rf", payment_id: payment.id, amount_money: { amount: half, currency: "USD" }, reason: "No se pudo apartar la fecha del curso" }).catch((e) => console.error("REFUND", e.stack || e));
    const e = new Error("Slot taken"); e.status = 409; e.code = "SLOT_TAKEN"; e.public = "Slot taken"; throw e;
  }

  // segunda mitad: al terminar el último día
  const last = pick.slots[pick.slots.length - 1];
  const chargeAt = new Date(Date.parse(last.start_at) + COURSE_HOURS * 3600e3).toISOString();
  await env.WAITLIST.put("course:" + ids[0], JSON.stringify({ course: b.course, bookingIds: ids, customerId, cardId, amount: c.price * 100 - half, chargeAt, status: "pending", name: cu.given + " " + cu.family, firstPayment: payment.id }));

  return { bookings: ids, dates: pick.slots.map((s) => s.start_at), paid: half / 100, remaining: (c.price * 100 - half) / 100, receiptUrl: payment.receipt_url || null };
}

async function courseSecondHalf(env, opt) {
  const now = opt.now ? new Date(opt.now) : new Date();
  const out = [];
  let cursor;
  do {
    const l = await env.WAITLIST.list({ prefix: "course:", cursor });
    for (const k of l.keys) {
      const rec = await env.WAITLIST.get(k.name, "json");
      if (!rec || rec.status !== "pending" || Date.parse(rec.chargeAt) > now.getTime()) continue;
      // si alguna de las citas del curso se canceló, no se cobra: lo decide Mely
      const states = await Promise.all(rec.bookingIds.map((id) => sq(env, "/v2/bookings/" + id).then((r) => r.booking.status).catch(() => "UNKNOWN")));
      if (states.some((st) => st !== "ACCEPTED")) { rec.status = "skipped:" + states.join(","); }
      else if (!opt.dry) {
        try {
          const p = (await sq(env, "/v2/payments", {
            idempotency_key: "course2-" + rec.bookingIds[0], source_id: rec.cardId, customer_id: rec.customerId, location_id: env.SQUARE_LOCATION_ID,
            amount_money: { amount: rec.amount, currency: "USD" }, autocomplete: true, reference_id: "curso-" + rec.course,
            note: COURSES[rec.course].name + " · 2ª mitad (50 %) · " + rec.name,
          })).payment;
          rec.status = "charged"; rec.secondPayment = p.id;
        } catch (e) { rec.status = "failed"; rec.error = String(e.message || e).slice(0, 200); console.error("COURSE 2", e.stack || e); }
      }
      if (!opt.dry) await env.WAITLIST.put(k.name, JSON.stringify(rec));
      out.push({ key: k.name, status: rec.status });
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return out;
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
