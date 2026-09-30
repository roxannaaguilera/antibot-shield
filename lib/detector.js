// Motor de puntuación anti-bots: cada señal suma puntos, ninguna decide sola.
const store = new Map(); // ip -> { hits: [timestamps], telemetry: score }

// Firmas típicas de bots en el User-Agent
const BOT_UA = /bot|crawler|spider|scraper|headless|selenium|playwright|puppeteer|curl|wget|python-requests|httpclient/i;

// Muestra de rangos de datacenters conocidos.
// En producción usa una base de datos ASN real (MaxMind GeoLite2, gratuita).
const DATACENTER_RANGES = [
  '3.0.0.0/8',      // AWS (muestra)
  '18.0.0.0/8',     // AWS (muestra)
  '157.90.0.0/16',  // Hetzner (muestra)
  '159.69.0.0/16',  // Hetzner (muestra)
  '51.38.0.0/16',   // OVH (muestra)
  '159.203.0.0/16', // DigitalOcean (muestra)
];

function ipToInt(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4 || p.some(x => x === '' || isNaN(x))) return null;
  return p.reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

function inCidr(ip, cidr) {
  const [base, bits] = cidr.split('/');
  const n = ipToInt(ip), b = ipToInt(base);
  if (n === null || b === null) return false;
  const mask = bits === '0' ? 0 : (0xFFFFFFFF << (32 - Number(bits))) >>> 0;
  return (n & mask) === (b & mask);
}

function isDatacenterIp(ip) {
  return DATACENTER_RANGES.some(c => inCidr(ip, c));
}

function recordHit(ip) {
  const now = Date.now();
  let e = store.get(ip);
  if (!e) { e = { hits: [], telemetry: 0 }; store.set(ip, e); }
  e.hits = e.hits.filter(t => now - t < 60_000); // ventana de 1 minuto
  e.hits.push(now);
}

function recordTelemetry(ip, score) {
  let e = store.get(ip);
  if (!e) { e = { hits: [], telemetry: 0 }; store.set(ip, e); }
  e.telemetry = score;
}

// CAPA 1-2: señales del lado servidor (IP, cabeceras, ritmo)
function scoreRequest(req, ip) {
  const signals = [];
  let score = 0;
  const add = (pts, name) => { score += pts; signals.push(`${name} (+${pts})`); };

  if (isDatacenterIp(ip)) add(40, 'IP de datacenter');
  const ua = req.headers['user-agent'] || '';
  if (BOT_UA.test(ua)) add(35, 'User-Agent de bot');
  if (!req.headers['accept-language']) add(15, 'sin Accept-Language');
  if (!req.headers.cookie && req.path !== '/') add(10, 'sin cookies en subruta');
  if (req.method === 'POST' && !req.headers.referer) add(10, 'POST sin Referer');

  const e = store.get(ip);
  if (e) {
    if (e.hits.length > 30) add(25, `ritmo alto (${e.hits.length}/min)`);
    if (e.telemetry) { score += e.telemetry; signals.push(`telemetría navegador (+${e.telemetry})`); }
  }
  return { score, signals };
}

// CAPA 3: señales del lado cliente (las recoge el JS de tu página)
function scoreTelemetry(t) {
  let score = 0;
  if (t.webdriver) score += 40;                 // navigator.webdriver === true -> automatizado
  if (t.plugins === 0) score += 15;             // un headless no tiene plugins
  if (!t.languages || t.languages.length === 0) score += 10;
  if (t.hardwareConcurrency === 0) score += 10;
  return score;
}

// Decisión final por umbrales (ajústalos a tu tráfico)
function decide(score) {
  if (score >= 60) return 'block';      // 403
  if (score >= 30) return 'challenge';   // reto matemático
  return 'allow';                        // pasa
}

module.exports = { scoreRequest, scoreTelemetry, recordHit, recordTelemetry, decide, isDatacenterIp };
