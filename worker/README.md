# API de reservas (Cloudflare Worker)

Conecta `reservar.html` con Square sin exponer el token. Es gratis dentro del plan free de Cloudflare Workers.

## 1. Square

1. Entra en <https://developer.squareup.com> con la cuenta de Mely y crea una aplicación (por ejemplo "Web nailsbymelyg").
2. En **Credentials** copia:
   - **Production Access Token**: va como secreto del Worker. No va en la web ni en GitHub.
   - **Production Application ID**: va en `assets/js/config.js` → `squareAppId`.
3. En **Locations** copia el **Location ID** de la ubicación del salón. Va en `wrangler.toml` y en `config.js` → `squareLocationId`.
4. Revisa en Square › Appointments › Settings que los servicios estén marcados como *reservables en línea*.

> Square pide un plan **Appointments Plus o Premium** para crear citas por API desde una web propia. Revisa qué plan tiene Mely antes de activar esto. Mientras tanto, la web funciona en modo "sin backend".

Conviene probar primero con `SQUARE_ENV = "sandbox"` y las credenciales *Sandbox*.

## 2. Publicar el Worker

```bash
cd worker
npm i -g wrangler         # una vez
wrangler login
# edita wrangler.toml: SQUARE_LOCATION_ID
wrangler secret put SQUARE_ACCESS_TOKEN
wrangler deploy
```

Te da una URL tipo `https://nailsbymelyg-api.<tu-cuenta>.workers.dev`. Si el dominio está en Cloudflare, puedes usar `api.nailsbymelyg.com`.

## 3. Conectar la web

En `assets/js/config.js`:

```js
apiBase: "https://nailsbymelyg-api.<tu-cuenta>.workers.dev",
squareAppId: "sq0idp-…",
squareLocationId: "L…",
```

Haz commit y push. Listo.

## Qué hace cada endpoint

| Ruta | Square API |
|---|---|
| `GET /services` | Catalog `search-catalog-items` (servicios de citas; caché de 10 min) |
| `POST /availability` | Bookings `availability/search` (hasta 31 días) |
| `POST /book` | Vuelve a comprobar el hueco → Customers (busca por correo o crea) → Cards (tarjeta de garantía) → Bookings `create` |
| `POST /giftcard/purchase` | Payments (cobro) → Gift Cards `create` (DIGITAL) → Gift Card Activities `ACTIVATE`. Si falla la activación → Refunds |
| `GET /giftcard/balance?gan=` | Gift Cards `from-gan` (estado y saldo) |
| Cron cada hora | Bookings `list` (citas dentro de 24 h) → Customers → Catalog → correo con Resend |
| `POST /reminders/run` | Igual que el cron, a mano. Pide la cabecera `X-Admin-Key`. `?dry=1` solo muestra, `?to=correo` manda la prueba a ese correo, `?hours=24` |

Los errores quedan en `wrangler tail`.

## Gift cards con Square

Con el Worker conectado, `giftcard.html` cobra con el formulario de Square y crea una **gift card digital real de Square** por ese valor:

- **Square guarda el saldo.** En el salón, Mely la cobra desde el Punto de Venta de Square con el número de la tarjeta; Square descuenta el saldo y no deja usarla de más. Lo que sobra queda para la próxima.
- **El diseño es de la web.** Colores, esmalte, nombres y mensaje viajan en el enlace de la tarjeta (`giftcard.html?c=…`). Quien la abre ve su tarjeta personalizada y el **saldo en vivo, consultado a Square**. Si alguien falsifica un diseño o un número, sale "no encontrada".
- **Si el cobro pasa pero la tarjeta no se puede crear, el Worker devuelve el dinero automáticamente.**
- **Entrega:** por WhatsApp, la web abre el chat con el enlace listo para enviar. Por correo, si está configurado Resend (abajo), el Worker lo manda solo; si no, se abre el correo de la persona con el enlace listo.

### Activarlo

1. En Square, revisa que la cuenta pueda vender **gift cards** (Square › Gift Cards). En la app de desarrollador, la aplicación necesita los permisos de *Payments* y *Gift Cards*.
2. Prueba primero en **sandbox** con `?demo=1` quitado y `SQUARE_ENV = "sandbox"`: paga con una tarjeta de prueba de Square y comprueba que la gift card aparece en el panel de Square con su saldo.
3. (Opcional) Correo automático con [Resend](https://resend.com): verifica el dominio y luego:
   ```bash
   wrangler secret put RESEND_API_KEY
   ```
   y en `wrangler.toml` pon `MAIL_FROM` (ej. `Nails by MelyG <giftcards@nailsbymelyg.com>`) y `NOTIFY_EMAIL` (el correo de Mely, para que le llegue un aviso de cada venta).

Mientras el Worker no esté conectado, la página funciona igual pero el pedido llega a Mely por WhatsApp y ella activa la tarjeta a mano en Square. Para enseñárselo sin cobrar: `giftcard.html?demo=1`.

## Recordatorios de cita personalizados

Cada hora, el Worker pregunta a Square qué citas empiezan dentro de 24 horas y le manda a cada clienta un correo con el diseño de la marca: su nombre, el servicio (con el nombre de la web, en su idioma), fecha y hora de Houston, la dirección con el mapa, "Añadir al calendario", WhatsApp para cambios y la política de 24 horas. Las citas canceladas no reciben aviso, y tampoco las clientas que se dieron de baja de los correos en Square.

- `REMINDER_HOURS = "24,2"` manda también un aviso 2 horas antes.
- Si la reserva se hizo en inglés desde la web, el correo sale en inglés.
- **Apaga el recordatorio por correo de Square** (Square › Appointments › Settings › Communications) para que no les lleguen dos. El de SMS de Square se puede dejar.

### Activarlo

1. Crea una cuenta gratis en [Resend](https://resend.com), añade el dominio `nailsbymelyg.com` y copia los registros DNS que te da en donde esté el dominio.
2. En `wrangler.toml` pon `MAIL_FROM = "Nails by MelyG <citas@nailsbymelyg.com>"` y `NOTIFY_EMAIL` con el correo de Mely (las respuestas de las clientas le llegan ahí).
3. Guarda los secretos (se pegan en la terminal, no en ningún archivo):
   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put ADMIN_KEY
   npx wrangler deploy
   ```
4. Prueba sin enviar nada y después mándate una prueba:
   ```bash
   curl -X POST -H "X-Admin-Key: TU_CLAVE" "https://nailsbymelyg-api.<cuenta>.workers.dev/reminders/run?dry=1&hours=24"
   curl -X POST -H "X-Admin-Key: TU_CLAVE" "https://nailsbymelyg-api.<cuenta>.workers.dev/reminders/run?hours=24&to=correo-de-mely@ejemplo.com"
   ```

La app de Square necesita permisos para leer citas (`APPOINTMENTS_READ`), clientas (`CUSTOMERS_READ`) y catálogo (`ITEMS_READ`).

