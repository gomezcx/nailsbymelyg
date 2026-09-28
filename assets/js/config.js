/* ============================================================
   Configuración — lo único que hay que tocar para activar
   la reserva propia conectada a Square.
   Mientras apiBase esté vacío, la web funciona igual pero el
   último paso de la reserva manda a la página de Square.
   ============================================================ */
window.MELY_CONFIG = {
  // URL del Worker de Cloudflare (ver /worker/README.md). Ej: "https://api.nailsbymelyg.com"
  apiBase: "",

  // Web Payments SDK de Square (para guardar la tarjeta por la política de cancelación)
  squareEnv: "production",        // "sandbox" para pruebas
  squareAppId: "",                // Developer Dashboard › Credentials › Application ID
  squareLocationId: "",           // Developer Dashboard › Locations

  // Respaldo: reserva de Square de siempre
  squareBookingUrl: "https://book.squareup.com/appointments/k5i21phbyenjqm/location/LB3NRH4R7V151",

  whatsapp: "18323104747",
  phoneDisplay: "+1 (832) 310-4747",
  instagram: "https://instagram.com/nailsbymelyg",
  tiktok: "https://tiktok.com/@nailsbymelyg",
  maps: "https://maps.app.goo.gl/jeEr8PQE1xyBjdHz8",
  timezone: "America/Chicago"
};
