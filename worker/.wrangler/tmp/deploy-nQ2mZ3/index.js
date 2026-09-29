var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var SQUARE_VERSION = "2025-06-18";
var ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
var index_default = {
  // cron: cada hora busca las citas que empiezan dentro de REMINDER_HOURS y avisa
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env, { now: event.scheduledTime }).catch((e) => console.error("REMINDERS", e.stack || e, e.details ? JSON.stringify(e.details) : "")));
  },
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (origin && !allowed.includes(origin)) return json({ error: "Origin not allowed" }, 403, cors);
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/services") return json(await services(env, ctx), 200, cors, 600);
      if (request.method === "POST" && url.pathname === "/availability") return json(await availability(env, await body(request)), 200, cors);
      if (request.method === "POST" && url.pathname === "/book") return json(await book(env, await body(request)), 200, cors);
      if (request.method === "POST" && url.pathname === "/giftcard/purchase") return json(await giftPurchase(env, await body(request)), 200, cors);
      if (request.method === "POST" && url.pathname === "/reminders/run") {
        if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "Forbidden" }, 403, cors);
        return json(await runReminders(env, {
          dry: url.searchParams.has("dry"),
          hours: url.searchParams.get("hours"),
          testTo: url.searchParams.get("to")
        }), 200, cors);
      }
      if (request.method === "GET" && url.pathname === "/giftcard/balance") return json(await giftBalance(env, url.searchParams.get("gan")), 200, cors);
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      console.error(err.stack || err, err.details ? JSON.stringify(err.details) : "");
      return json({ error: err.public || "Server error", code: err.code }, err.status || 500, cors);
    }
  }
};
async function sq(env, path, payload, method) {
  const base = env.SQUARE_ENV === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const res = await fetch(base + path, {
    method: method || (payload ? "POST" : "GET"),
    headers: {
      Authorization: "Bearer " + env.SQUARE_ACCESS_TOKEN,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json"
    },
    body: payload ? JSON.stringify(payload) : void 0
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
__name(sq, "sq");
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
      cursor
    });
    for (const item of r.items || []) {
      const v = (item.item_data.variations || []).find((x) => x.item_variation_data?.available_for_booking !== false);
      if (!v) continue;
      out.push({
        name: item.item_data.name,
        id: v.id,
        version: v.version,
        duration: Math.round((v.item_variation_data.service_duration || 0) / 6e4),
        price: v.item_variation_data.price_money ? v.item_variation_data.price_money.amount / 100 : null
      });
    }
    cursor = r.cursor;
  } while (cursor);
  const result = { services: out };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(result), { headers: { "Cache-Control": "max-age=600" } })));
  return result;
}
__name(services, "services");
async function searchAvailability(env, ids, startAt, endAt) {
  const r = await sq(env, "/v2/bookings/availability/search", {
    query: {
      filter: {
        start_at_range: { start_at: startAt, end_at: endAt },
        location_id: env.SQUARE_LOCATION_ID,
        segment_filters: ids.map((id) => ({ service_variation_id: id }))
      }
    }
  });
  return r.availabilities || [];
}
__name(searchAvailability, "searchAvailability");
async function availability(env, b) {
  const ids = Array.isArray(b.serviceVariationIds) ? b.serviceVariationIds.slice(0, 3) : [];
  if (!ids.length || !ids.every((id) => ID_RE.test(id))) throw bad("Invalid services");
  const days = Math.min(Math.max(parseInt(b.days, 10) || 14, 1), 31);
  const start = new Date(Date.now() + 60 * 60 * 1e3);
  const end = new Date(start.getTime() + days * 864e5);
  const list = await searchAvailability(env, ids, start.toISOString(), end.toISOString());
  const seen = /* @__PURE__ */ new Set();
  const slots = [];
  for (const a of list) {
    if (seen.has(a.start_at)) continue;
    seen.add(a.start_at);
    slots.push({ startAt: a.start_at, segments: a.appointment_segments });
  }
  return { slots };
}
__name(availability, "availability");
async function book(env, b) {
  const c = b.customer || {};
  const clean = /* @__PURE__ */ __name((s, n) => String(s || "").trim().slice(0, n), "clean");
  const given = clean(c.givenName, 60), family = clean(c.familyName, 60);
  const email = clean(c.email, 120).toLowerCase(), phone = clean(c.phone, 20);
  if (!given || !family) throw bad("Name required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("Invalid email");
  if (!/^\+\d{10,15}$/.test(phone)) throw bad("Invalid phone");
  if (!b.startAt || isNaN(Date.parse(b.startAt))) throw bad("Invalid time");
  const ids = (b.segments || []).map((s) => s.service_variation_id).filter((id) => ID_RE.test(id || ""));
  if (!ids.length) throw bad("Invalid services");
  const idem = clean(b.idempotencyKey, 64) || crypto.randomUUID();
  const from = new Date(Date.parse(b.startAt) - 6e4);
  const to = new Date(from.getTime() + 864e5);
  const again = await searchAvailability(env, ids, from.toISOString(), to.toISOString());
  const match = again.find((a) => Date.parse(a.start_at) === Date.parse(b.startAt));
  if (!match) {
    const e = new Error("Slot taken");
    e.status = 409;
    e.code = "SLOT_TAKEN";
    e.public = "Slot taken";
    throw e;
  }
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
      reference_id: "web"
    });
    customerId = created.customer.id;
  }
  if (b.cardToken) {
    try {
      await sq(env, "/v2/cards", { idempotency_key: idem + "-k", source_id: String(b.cardToken), card: { customer_id: customerId } });
    } catch (err) {
      err.code = "CARD";
      err.public = "Card declined";
      err.status = 402;
      throw err;
    }
  }
  const note = clean(b.note, 900);
  const r = await sq(env, "/v2/bookings", {
    idempotency_key: idem,
    booking: {
      start_at: match.start_at,
      location_id: env.SQUARE_LOCATION_ID,
      customer_id: customerId,
      customer_note: (note ? note + "\n" : "") + "Reservada desde nailsbymelyg.com (" + (b.lang === "en" ? "EN" : "ES") + ")",
      appointment_segments: match.appointment_segments
    }
  }).catch((err) => {
    if (err.status === 400) {
      err.code = "SLOT_TAKEN";
      err.status = 409;
      err.public = "Slot taken";
    }
    throw err;
  });
  return { booking: { id: r.booking.id, startAt: r.booking.start_at, status: r.booking.status } };
}
__name(book, "book");
var THEMES = ["burdeos", "rosa", "nude", "noche"];
async function giftPurchase(env, b) {
  const clean = /* @__PURE__ */ __name((s, n) => String(s || "").trim().slice(0, n), "clean");
  const amount = Math.round(Number(b.amount));
  if (!(amount >= 25 && amount <= 1e3)) throw bad("Invalid amount");
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
  let payment;
  try {
    payment = (await sq(env, "/v2/payments", {
      idempotency_key: idem + "-p",
      source_id: String(b.cardToken),
      amount_money: money,
      location_id: env.SQUARE_LOCATION_ID,
      buyer_email_address: buyerEmail,
      reference_id: order || void 0,
      note: ("Gift card web \xB7 Para " + to + " \xB7 De " + from + (label ? " \xB7 " + label : "")).slice(0, 500)
    })).payment;
  } catch (err) {
    err.code = "CARD";
    err.public = "Card declined";
    err.status = 402;
    throw err;
  }
  let card;
  try {
    card = (await sq(env, "/v2/gift-cards", { idempotency_key: idem + "-g", location_id: env.SQUARE_LOCATION_ID, gift_card: { type: "DIGITAL" } })).gift_card;
    await sq(env, "/v2/gift-cards/activities", {
      idempotency_key: idem + "-a",
      gift_card_activity: {
        type: "ACTIVATE",
        location_id: env.SQUARE_LOCATION_ID,
        gift_card_id: card.id,
        activate_activity_details: { amount_money: money, buyer_payment_instrument_ids: [payment.id], reference_id: order || void 0 }
      }
    });
  } catch (err) {
    await sq(env, "/v2/refunds", { idempotency_key: idem + "-r", payment_id: payment.id, amount_money: money, reason: "Gift card could not be activated" }).catch((e) => console.error("REFUND FAILED", payment.id, e.details));
    err.code = "GIFT_FAILED";
    err.public = "Gift card could not be created";
    err.status = 502;
    throw err;
  }
  const design = {
    g: card.gan,
    a: amount,
    l: label,
    t: to,
    f: from,
    m: msg,
    th: THEMES.includes(b.theme) ? b.theme : "burdeos",
    p: Math.max(0, Math.min(7, parseInt(b.polish, 10) || 0)),
    lang: b.lang === "en" ? "en" : "es"
  };
  const link = (env.SITE_URL || "https://nailsbymelyg.com").replace(/\/$/, "") + "/giftcard.html?c=" + b64url(JSON.stringify(design));
  let emailSent = false;
  if (via === "email" && env.RESEND_API_KEY && env.MAIL_FROM) {
    emailSent = await sendMail(env, contact, design, link).catch((e) => {
      console.error("MAIL", e);
      return false;
    });
  }
  if (env.RESEND_API_KEY && env.MAIL_FROM && env.NOTIFY_EMAIL) {
    sendMail(env, env.NOTIFY_EMAIL, design, link, "Nueva gift card vendida: $" + amount + " para " + to + " (de " + from + ")").catch(() => {
    });
  }
  return { gan: card.gan, amount, link, emailSent, receiptUrl: payment.receipt_url || null };
}
__name(giftPurchase, "giftPurchase");
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
__name(giftBalance, "giftBalance");
async function sendMail(env, to, d, link, subject) {
  const dark = d.th === "burdeos" || d.th === "noche";
  const bg = { burdeos: "linear-gradient(135deg,#8A4453,#4E222C)", rosa: "linear-gradient(135deg,#F6E1E2,#C98E96)", nude: "linear-gradient(135deg,#F7EEE8,#C4A694)", noche: "linear-gradient(135deg,#403A47,#16121A)" }[d.th];
  const solid = { burdeos: "#662E3A", rosa: "#E7C2C5", nude: "#E3CDBF", noche: "#2A2430" }[d.th];
  const ink = dark ? "#F3ECE8" : "#4E222C";
  const en = d.lang === "en";
  const esc = /* @__PURE__ */ __name((s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), "esc");
  const html = `<div style="background:#F3ECE8;padding:32px 12px;font-family:Georgia,serif;color:#4E222C">
  <div style="max-width:560px;margin:0 auto">
    <p style="font:14px Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;margin:0 0 16px">${en ? "You got a gift" : "Tienes un regalo"}</p>
    <div style="background:${solid};background-image:${bg};border-radius:20px;padding:28px;color:${ink}">
      <p style="font:12px Arial,sans-serif;letter-spacing:.3em;margin:0 0 40px">NAILS BY MELYG \xB7 GIFT CARD</p>
      <p style="font:13px Arial,sans-serif;letter-spacing:.2em;margin:0">${en ? "FOR" : "PARA"}</p>
      <p style="font-style:italic;font-size:36px;margin:4px 0 8px">${esc(d.t)}</p>
      <p style="font:16px Arial,sans-serif;margin:0 0 36px;opacity:.9">${esc(d.m || "")}</p>
      <p style="font-size:56px;margin:0">$${d.a}</p>
      <p style="font:14px Arial,sans-serif;margin:8px 0 0">${en ? "From" : "De"} ${esc(d.f)} \xB7 ${esc(String(d.g).replace(/(.{4})/g, "$1 ").trim())}</p>
    </div>
    <p style="text-align:center;margin:28px 0"><a href="${link}" style="background:#662E3A;color:#F3ECE8;padding:16px 28px;text-decoration:none;font:14px Arial,sans-serif;letter-spacing:.14em">${en ? "SEE MY GIFT CARD" : "VER MI GIFT CARD"}</a></p>
    <p style="font:14px Arial,sans-serif;line-height:1.6;color:#7E5560">${en ? "Show this card at your appointment at 2727 N Mason Rd, Suite 301, Katy, TX. The balance is kept by Square." : "Muestra esta tarjeta en tu cita en 2727 N Mason Rd, Suite 301, Katy, TX. El saldo lo guarda Square."}</p>
  </div></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: subject || (en ? "Your Nails by MelyG gift card \u{1F485}" : "Tu gift card de Nails by MelyG \u{1F485}"), html })
  });
  return r.ok;
}
__name(sendMail, "sendMail");
function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
var SERVICE_NAMES = { "manicure russo & gel (shellac)": ["Manicura rusa + gel", "Russian manicure + gel"], "russian manicure & rubber base": ["Manicura rusa + rubber base", "Russian manicure + rubber base"], "russian manicure & builder gel": ["Manicura rusa + builder gel", "Russian manicure + builder gel"], "manicure russo & gel x": ["Manicura rusa + Gel\u2011X", "Russian manicure + Gel\u2011X"], "manicure russo & poly gel": ["Manicura rusa + Poly Gel", "Russian manicure + Poly Gel"], "manicure natural nails & poly gel": ["U\xF1as naturales + Poly Gel", "Natural nails + Poly Gel"], "manicure extension nails & builder gel": ["Extensiones + builder gel", "Extensions + builder gel"], "russian pedicure & gel (shellac)": ["Pedicura rusa + gel", "Russian pedicure + gel"], "russian pedicure & rubber base": ["Pedicura rusa + rubber base", "Russian pedicure + rubber base"], "manicure & pedicure for men's": ["Manicura y pedicura para hombres", "Men\u2019s manicure & pedicure"], "manicure and pedicure for children": ["Manicura y pedicura para ni\xF1os", "Kids\u2019 manicure & pedicure"], "service to remove previous product": ["Retirada de producto anterior", "Removal of previous product"] };
async function runReminders(env, opt) {
  const now = opt.now ? new Date(opt.now) : /* @__PURE__ */ new Date();
  const hoursList = String(opt.hours || env.REMINDER_HOURS || "24").split(",").map((h) => parseInt(h, 10)).filter((h) => h > 0 && h <= 72);
  const report = [];
  for (const h of hoursList) {
    const from = new Date(now);
    from.setUTCMinutes(0, 0, 0);
    from.setUTCHours(from.getUTCHours() + h);
    const to = new Date(from.getTime() + 36e5);
    const list = await listBookings(env, from, to);
    for (const b of list) {
      if (b.status !== "ACCEPTED" && b.status !== "PENDING") continue;
      try {
        const info = await reminderInfo(env, b);
        if (!info.email || info.unsubscribed) {
          report.push({ booking: b.id, skipped: "no email" });
          continue;
        }
        const mail = reminderMail(env, info, h);
        const target = opt.testTo || info.email;
        if (!opt.dry) {
          if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error("Falta RESEND_API_KEY o MAIL_FROM");
          await resend(env, target, mail.subject, mail.html, mail.text);
        }
        report.push({ booking: b.id, to: target, when: info.when, hours: h, sent: !opt.dry, subject: mail.subject });
      } catch (e) {
        console.error("REMINDER", b.id, e.stack || e);
        report.push({ booking: b.id, error: String(e.message || e) });
      }
    }
  }
  return { checkedAt: now.toISOString(), reminders: report };
}
__name(runReminders, "runReminders");
async function listBookings(env, from, to) {
  const out = [];
  let cursor;
  do {
    const q = new URLSearchParams({ location_id: env.SQUARE_LOCATION_ID, start_at_min: from.toISOString(), start_at_max: to.toISOString(), limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const r = await sq(env, "/v2/bookings?" + q.toString());
    out.push(...r.bookings || []);
    cursor = r.cursor;
  } while (cursor);
  return out;
}
__name(listBookings, "listBookings");
async function reminderInfo(env, b) {
  const tz = env.TIMEZONE || "America/Chicago";
  const en = /\(EN\)/.test(b.customer_note || "");
  const c = b.customer_id ? (await sq(env, "/v2/customers/" + b.customer_id)).customer : {};
  const ids = (b.appointment_segments || []).map((s) => s.service_variation_id).filter(Boolean);
  let services2 = [];
  let minutes = (b.appointment_segments || []).reduce((n, s) => n + (s.duration_minutes || 0), 0);
  if (ids.length) {
    const r = await sq(env, "/v2/catalog/batch-retrieve", { object_ids: ids, include_related_objects: true });
    const items = {};
    (r.related_objects || []).forEach((o) => {
      if (o.type === "ITEM") items[o.id] = o.item_data.name;
    });
    services2 = (r.objects || []).map((o) => items[o.item_variation_data?.item_id] || o.item_variation_data?.name).filter(Boolean).map((n) => {
      const w = SERVICE_NAMES[n.toLowerCase()];
      return w ? w[en ? 1 : 0] : n;
    });
  }
  const start = new Date(b.start_at);
  const loc = en ? "en-US" : "es-US";
  const date = new Intl.DateTimeFormat(loc, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(start);
  const time = new Intl.DateTimeFormat(loc, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(start);
  return {
    id: b.id,
    en,
    start,
    minutes,
    services: services2,
    name: c.given_name || "",
    email: c.email_address || "",
    unsubscribed: !!(c.preferences && c.preferences.email_unsubscribed),
    date: date.charAt(0).toUpperCase() + date.slice(1),
    time,
    when: date + " " + time
  };
}
__name(reminderInfo, "reminderInfo");
function reminderMail(env, i, hours) {
  const en = i.en;
  const address = env.ADDRESS || "2727 N Mason Rd, Suite 301, Katy, TX 77449";
  const maps = env.MAPS_URL || "https://maps.app.goo.gl/jeEr8PQE1xyBjdHz8";
  const wa = "https://wa.me/" + (env.WHATSAPP || "18323104747") + "?text=" + encodeURIComponent(en ? "Hi Mely, about my appointment on " + i.when : "Hola Mely, sobre mi cita del " + i.when);
  const site = (env.SITE_URL || "https://nailsbymelyg.com").replace(/\/$/, "");
  const end = new Date(i.start.getTime() + (i.minutes || 90) * 6e4);
  const gcal = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("Nails by MelyG" + (i.services.length ? " \xB7 " + i.services.join(" + ") : "")) + "&dates=" + stamp(i.start) + "/" + stamp(end) + "&location=" + encodeURIComponent(address) + "&details=" + encodeURIComponent(en ? "Change or cancel at least 24 h ahead: " + wa : "Cambios o cancelaciones con 24 h de anticipaci\xF3n: " + wa);
  const esc = /* @__PURE__ */ __name((s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), "esc");
  const hello = i.name ? (en ? "Hi " : "Hola ") + esc(i.name) + "," : en ? "Hi," : "Hola,";
  const soon = hours <= 3;
  const lead = soon ? en ? "See you in a little while \u{1F485}" : "Te espero en un ratito \u{1F485}" : en ? "See you tomorrow \u{1F485}" : "Te espero ma\xF1ana \u{1F485}";
  const svc = i.services.length ? esc(i.services.join(" + ")) : en ? "Your appointment" : "Tu cita";
  const dur = i.minutes ? (Math.floor(i.minutes / 60) ? Math.floor(i.minutes / 60) + " h " : "") + (i.minutes % 60 ? i.minutes % 60 + " min" : "") : "";
  const subject = soon ? en ? "Your appointment is at " + i.time + " today \u{1F485}" : "Tu cita es hoy a las " + i.time + " \u{1F485}" : en ? "Reminder: " + i.date + " at " + i.time + " \xB7 Nails by MelyG" : "Recordatorio: " + i.date + " a las " + i.time + " \xB7 Nails by MelyG";
  const btn = /* @__PURE__ */ __name((href, label, solid) => `<a href="${href}" style="display:inline-block;margin:0 8px 10px 0;padding:14px 22px;text-decoration:none;font:600 13px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;${solid ? "background:#662E3A;color:#F3ECE8" : "border:1px solid #662E3A;color:#662E3A"}">${label}</a>`, "btn");
  const html = `<!doctype html><html lang="${en ? "en" : "es"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0"><div style="background:#F3ECE8;padding:32px 12px;color:#4E222C">
  <div style="max-width:560px;margin:0 auto;background:#FAF6F3;border:1px solid #D9C3C0">
    <div style="background:#662E3A;padding:26px 28px;text-align:left">
      <img src="${site}/assets/img/logo-light.png" width="150" alt="Nails by MelyG" style="display:block;border:0">
    </div>
    <div style="padding:30px 28px 10px;font-family:Georgia,serif">
      <p style="font:15px Arial,sans-serif;margin:0 0 6px;color:#7E5560">${hello}</p>
      <h1 style="font-weight:400;font-style:italic;font-size:34px;line-height:1.15;margin:0 0 24px">${lead}</h1>
      <table role="presentation" style="width:100%;border-collapse:collapse;font:16px Arial,sans-serif">
        <tr><td style="padding:12px 0;border-top:1px solid #D9C3C0;color:#7E5560;width:34%">${en ? "Service" : "Servicio"}</td><td style="padding:12px 0;border-top:1px solid #D9C3C0">${svc}${dur ? ` <span style="color:#7E5560">\xB7 ${dur}</span>` : ""}</td></tr>
        <tr><td style="padding:12px 0;border-top:1px solid #D9C3C0;color:#7E5560">${en ? "When" : "Cu\xE1ndo"}</td><td style="padding:12px 0;border-top:1px solid #D9C3C0"><b>${esc(i.date)}</b><br>${esc(i.time)} <span style="color:#7E5560">(${en ? "Houston time" : "hora de Houston"})</span></td></tr>
        <tr><td style="padding:12px 0;border-top:1px solid #D9C3C0;border-bottom:1px solid #D9C3C0;color:#7E5560">${en ? "Where" : "D\xF3nde"}</td><td style="padding:12px 0;border-top:1px solid #D9C3C0;border-bottom:1px solid #D9C3C0"><a href="${maps}" style="color:#662E3A">${esc(address)}</a></td></tr>
      </table>
      <div style="margin:26px 0 8px">${btn(maps, en ? "Get directions" : "C\xF3mo llegar", true)}${btn(gcal, en ? "Add to calendar" : "A\xF1adir al calendario", false)}</div>
      <p style="font:14px Arial,sans-serif;line-height:1.6;color:#7E5560;margin:18px 0">${en ? "Coming in with gel or acrylic from another salon? Let me know so I can plan the removal. If you need to change or cancel, please message me at least 24 hours ahead." : "\xBFVienes con gel o acr\xEDlico de otro sal\xF3n? Av\xEDsame para separar el tiempo de la retirada. Si necesitas cambiar o cancelar, escr\xEDbeme con al menos 24 horas de anticipaci\xF3n."}</p>
      <p style="margin:0 0 28px">${btn(wa, en ? "Message me on WhatsApp" : "Escribirme por WhatsApp", false)}</p>
    </div>
    <div style="padding:18px 28px;border-top:1px solid #D9C3C0;font:12px Arial,sans-serif;color:#7E5560">Nails by MelyG \xB7 ${esc(address)} \xB7 <a href="${site}" style="color:#7E5560">nailsbymelyg.com</a></div>
  </div></div></body></html>`;
  const text = `${hello}
${lead}

${i.services.join(" + ") || ""}
${i.date}, ${i.time}
${address}
${maps}

${en ? "Change or cancel 24 h ahead" : "Cambios o cancelaciones con 24 h de anticipaci\xF3n"}: ${wa}`;
  return { subject, html, text };
}
__name(reminderMail, "reminderMail");
function stamp(d) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
__name(stamp, "stamp");
async function resend(env, to, subject, html, text) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, text, reply_to: env.NOTIFY_EMAIL || void 0 })
  });
  if (!r.ok) throw new Error("Resend " + r.status + " " + (await r.text()).slice(0, 200));
  return true;
}
__name(resend, "resend");
async function body(request) {
  const text = await request.text();
  if (text.length > 1e4) throw bad("Too large");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw bad("Invalid JSON");
  }
}
__name(body, "body");
function bad(msg) {
  const e = new Error(msg);
  e.status = 400;
  e.public = msg;
  return e;
}
__name(bad, "bad");
function json(data, status, headers, maxAge) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": maxAge ? "public, max-age=" + maxAge : "no-store" }
  });
}
__name(json, "json");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
