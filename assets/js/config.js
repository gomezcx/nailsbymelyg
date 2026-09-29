/* ============================================================
   Configuración — lo único que hay que tocar para activar
   la reserva propia conectada a Square.
   Mientras apiBase esté vacío, la web funciona igual pero el
   último paso de la reserva manda a la página de Square.
   ============================================================ */
window.MELY_CONFIG = {
  // URL del Worker de Cloudflare (ver /worker/README.md). Ej: "https://api.nailsbymelyg.com"
  apiBase: "https://nailsbymelyg-api.nailsbymelyg.workers.dev",

  // Web Payments SDK de Square (tarjeta de garantía de la reserva y pago de gift cards).
  // App de Square: "Web nailsbymelyg", en PRODUCCIÓN. Para volver a pruebas:
  //   squareEnv: "sandbox", squareAppId: "sandbox-sq0idb-SWer2OtA1EUd0pcITtaXcw", squareLocationId: "L12K90NNX8GG7"
  squareEnv: "production",
  squareAppId: "sq0idp-as0w6-6pNTmIv70WkB-yyw",
  squareLocationId: "LB3NRH4R7V151",

  // Respaldo: reserva de Square de siempre
  squareBookingUrl: "https://book.squareup.com/appointments/k5i21phbyenjqm/location/LB3NRH4R7V151",

  whatsapp: "18323104747",
  // Correo de Mely (opcional). Si se rellena, los pedidos de gift card también se pueden mandar por correo.
  email: "",
  phoneDisplay: "+1 (832) 310-4747",
  instagram: "https://instagram.com/nailsbymelyg",
  tiktok: "https://tiktok.com/@nailsbymelyg",
  maps: "https://maps.app.goo.gl/jeEr8PQE1xyBjdHz8",
  timezone: "America/Chicago"
};
