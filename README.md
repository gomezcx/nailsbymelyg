# Nails by MelyG — web

Web de [nailsbymelyg.com](https://nailsbymelyg.com): manicura y pedicura rusa en Katy, TX.
HTML/CSS/JS sin frameworks ni build, publicada con GitHub Pages. Bilingüe ES/EN.

## Páginas

| Archivo | Qué es |
|---|---|
| `index.html` | Inicio: técnica, servicios destacados, estudio de color, fichas del look, cursos, sobre Mely, reseñas, horario y mapa |
| `galeria.html` | Galería de trabajos con filtros por estilo y visor a pantalla completa (fotos en `assets/js/gallery.js`) |
| `giftcard.html` | Gift cards de Square con diseño personalizado: se paga con Square, se crea una gift card real y se entrega por WhatsApp o correo con su enlace (`?c=…` muestra la tarjeta y el saldo en vivo). Sin Worker, el pedido llega por WhatsApp. Demo: `giftcard.html?demo=1` |
| `servicios.html` | Menú completo con precios (sale de `assets/js/data.js`), políticas y FAQ |
| `cursos.html` | Manicura rusa y Gel‑X ($550 cada uno, máx. 6 cupos). Fechas por WhatsApp |
| `reservar.html` | Reserva propia en 4 pasos conectada a Square |
| `confirmar.html` | La clienta confirma o cancela su cita (enlace del SMS de Square). Sin confirmar 1 h antes, el Worker la cancela (solo citas reservadas con +24 h y desde `CONFIRM_SINCE`) y avisa a la lista de espera |
| `privacidad.html` | Aviso de privacidad |

## Uña realista y motion

- `assets/js/nail.js` dibuja la uña en SVG (dedo, cutícula, curvatura, brillo de gel). Se usa con
  `<div data-nail data-polish="#662E3A" data-shape="almond|oval|square|coffin|short" data-finish="gloss|matte|french|chrome" data-skin="light|medium|tan|deep"></div>`.
  Con `data-bare` sale solo la uña (press‑on).
- `assets/js/motion.js` usa GSAP, ScrollTrigger, SplitText y Lenis desde jsDelivr. Si no cargan, o si la persona
  tiene activado "reducir movimiento", la web se ve completa y estática.

## Dónde se cambia cada cosa

- **Precios, servicios y horario:** `assets/js/data.js`. El campo `sq` tiene que ser igual al nombre del servicio en Square.
- **Textos en español:** directamente en cada `.html`.
- **Textos en inglés:** `assets/js/i18n-en.js`, con la misma clave que el `data-i18n` del HTML.
- **WhatsApp, redes, Square:** `assets/js/config.js`.
- **Colores y tipografía:** variables al inicio de `assets/css/styles.css`.
- **Tonos del estudio "Diseña tu manicura":** lista `COLORS` en `assets/js/studio.js` (nombre ES/EN y color).
- **Fichas del look:** fotos y textos en `index.html` (sección `#looks`) y la ficha ampliada en `LOOKS`, dentro de `assets/js/main.js`.
- **Galería:** lista `PICS` en `assets/js/gallery.js`; fotos en `assets/img/galeria/` (800 px y versión `-s` de 400 px, en .webp y .jpg).
- **Vídeos:** `assets/video/` (≈1 MB cada uno, con su póster .jpg). Solo se reproducen cuando están a la vista; con "reducir movimiento" o ahorro de datos muestran controles.
- **Idioma:** se elige solo según el idioma del dispositivo; la primera vez sale un aviso para cambiarlo con un toque y la elección se recuerda.
- **Logo:** `assets/img/logo-wine.*` (fondo claro) y `assets/img/logo-light.*` (fondo burdeos).

> El header y el footer se repiten en cada página: si cambias un enlace, cámbialo en las 5.

## Reserva

`reservar.html` funciona en tres modos:

1. **Sin backend** (`apiBase` vacío en `config.js`): la clienta elige el servicio y el paso 2 la manda a la agenda de Square de siempre.
2. **Demo** (`reservar.html?demo=1`): horarios de ejemplo, no crea citas. Sirve para enseñárselo a Mely.
3. **Conectada** (`apiBase` con la URL del Worker): horarios reales de Square, guarda la tarjeta de garantía y crea la cita en la agenda de Mely.

Para activar el modo conectado, sigue [`worker/README.md`](worker/README.md).

## Pendiente

- [ ] Gift cards: conectar el Worker (ver `worker/README.md` › Gift cards con Square) y probar en sandbox. Hasta entonces el pedido llega por WhatsApp.

- [x] Dirección de la sucursal "Nailsbymelyg" en Square actualizada a 2727 N Mason Rd Ste 301, Katy, TX 77449 (las sucursales "Mely" y "Dilmelys Garcia" no son del salón y no se tocaron).
- [ ] En Square el horario (L–V 10–5:15, S 8:30–3, D 10–4) no coincide con Google Maps (L–S 9–6, D 11–3). La reserva en línea usa el de Square: hay que igualarlos.
- [ ] Fotos: retrato de Mely en buena resolución y fotos de trabajos para una galería.
- [ ] Confirmar qué incluye el kit del curso de manicura rusa y el temario de Gel‑X.
