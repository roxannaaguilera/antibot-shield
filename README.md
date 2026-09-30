# antibot-shield

Demo funcional de **cómo detectan y bloquean bots las webs**, capa por capa.
Sin dependencias raras: solo Express. Código comentado en español, pensado para aprender.

## La idea en 30 segundos

Ninguna señal demuestra por sí sola que eres un bot. El servidor **suma puntos de sospecha**
por cada señal y decide con umbrales:

| Puntuación | Decisión |
|---|---|
| 0 – 29 | `allow` — pasa |
| 30 – 59 | `challenge` — reto matemático |
| 60+ | `block` — 403 |

## Paso a paso: las 5 capas

### Capa 1 — Reputación de la IP (`lib/detector.js` → `isDatacenterIp`)

Cada IP pertenece a un rango registrado públicamente. Con una base de datos ASN
(gratuita: MaxMind GeoLite2) sabes si la IP es de un **datacenter** (AWS, Hetzner, OVH…)
o de una **conexión doméstica** (Telefónica, Orange…).

- IP de datacenter → **+40 puntos**. Es la señal más fuerte: los bots viven en servidores,
  los humanos en casas.
- En esta demo hay una lista de muestra; en producción se consulta la base de datos real.

### Capa 2 — Cabeceras HTTP (`scoreRequest`)

Un navegador real envía cabeceras coherentes. Un script, no:

- `User-Agent` con firmas de bot (`curl`, `python-requests`, `headless`, `selenium`…) → **+35**
- Sin `Accept-Language` → **+15** (todo navegador real dice qué idioma habla)
- Sin cookies al pedir una subruta → **+10** (un humano ya navegó antes)
- `POST` sin `Referer` → **+10** (los formularios reales vienen de tu propia página)
- Más de 30 peticiones/minuto desde la misma IP → **+25** (límite de ritmo)

### Capa 3 — Huella del navegador (`public/index.html` + `scoreTelemetry`)

Un script JavaScript en tu página recoge señales que un bot headless no puede ocultar:

- `navigator.webdriver === true` → **+40** (el chivato oficial de la automatización)
- 0 plugins instalados → **+15**
- Sin idiomas configurados → **+10**

Se envían a `/api/telemetry` y se suman a la puntuación de esa IP.

### Capa 4 — El reto (`public/challenge.html`)

Zona gris (30–59 puntos): ni se bloquea ni se deja pasar. Se pide una prueba barata
de humanidad — aquí una suma, en producción un CAPTCHA o un proof-of-work.
Quien la supera entra en la lista de verificados durante 1 hora.

### Capa 5 — Honeypot (`POST /api/contact`)

El formulario incluye un campo **invisible para humanos** (`name="website"`,
`display:none`). Un bot que rellena todos los campos cae en la trampa → 403 directo.
Cuesta cero y caza al 90% de los scrapers tontos.

## Cómo integrarlo en tu web (3 pasos)

1. Copia `lib/detector.js` a tu proyecto.
2. Añade el middleware antes de tus rutas:
   ```js
   const { scoreRequest, recordHit, decide } = require('./lib/detector');
   app.use((req, res, next) => {
     const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
     recordHit(ip);
     const { score } = scoreRequest(req, ip);
     const action = decide(score);
     if (action === 'block') return res.status(403).send('Bot detectado');
     if (action === 'challenge') return res.redirect('/challenge');
     next();
   });
   ```
3. Añade el snippet de telemetría a tu HTML (ver `public/index.html`) y un campo
   honeypot a tus formularios.

## Pruébalo tú mismo

```bash
npm install && node server.js
```

```bash
# Humano normal -> 200 OK
curl -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -H "Accept-Language: es-ES" http://localhost:3000/

# User-Agent de bot -> 302 al reto (35 puntos)
curl -A "EvilScraperBot/1.0" http://localhost:3000/ -v

# Bot automatizado (telemetría webdriver + UA de bot) -> 403
curl -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{"webdriver":true,"plugins":0,"languages":[],"hardwareConcurrency":0}'
curl -A "EvilScraperBot/1.0" http://localhost:3000/ -v
```

Mira la consola del servidor: cada petición imprime su puntuación y las señales.

## Afínalo a tu tráfico

- Sube el umbral de `block` si tienes usuarios con VPN (suelen salir por datacenters).
- **No bloquees a los crawlers buenos**: pon en lista blanca `Googlebot`, `Bingbot`, etc.
  (verifícalos con DNS inverso, el User-Agent se falsifica fácil).
- El límite de ritmo depende de tu web: una API lo necesita más alto que un blog.

## Limitaciones honestas

Esto frena al 95% de los bots baratos. Un atacante serio usa IPs residenciales rotativas,
navegadores reales automatizados con movimientos de ratón simulados y resuelve CAPTCHAs
con servicios de pago. Contra eso solo hay mitigación, no victoria total: WAF profesional
(Cloudflare, DataDome), proof-of-work en el cliente y monitorización continua.

## CAPA 6 — timing conductual (nuevo)

`public/collector.js` mide intervalos entre teclas, movimientos de ratón y clics
y los envía a `POST /api/timing`. `lib/timing.js` extrae rasgos estadísticos
(CV, burstiness, entropía, duplicados exactos, autocorrelación) y suma puntos
al score del escudo. Ninguna capa decide sola: un bot que imita la distribución
humana pasa esta capa, pero cae en el replay o en las demás.

Demo: `python3 analysis/demo.py` simula 5 perfiles (humano, bot ingenuo,
bot multi-patrón, bot "listo" y replay) y muestra qué detecta la capa.
