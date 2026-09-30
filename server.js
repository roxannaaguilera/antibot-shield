// antibot-shield — demo educativa: cómo detectan y bloquean bots las webs.
// Pruébala:  npm install && node server.js   ->  http://localhost:3000
const express = require('express');
const path = require('path');
const { scoreRequest, scoreTelemetry, recordHit, recordTelemetry, decide } = require('./lib/detector');
const { recordTiming, scoreTiming } = require('./lib/timing');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'desconocida';
}

// IPs que ya superaron el reto (caducan en 1 hora)
const verified = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, exp] of verified) if (exp < now) verified.delete(ip);
}, 60_000);

// 1) Telemetría del navegador (la envía el JS de la página)
app.post('/api/telemetry', (req, res) => {
  recordTelemetry(clientIp(req), scoreTelemetry(req.body || {}));
  res.json({ ok: true });
});

// 1b) Timing conductual (lo envía collector.js desde la página)
app.post('/api/timing', (req, res) => {
  recordTiming(clientIp(req), req.body || {});
  res.json({ ok: true });
});

// 2) Verificación del reto (pregunta matemática simple)
app.post('/api/challenge', (req, res) => {
  const { a, b, answer } = req.body || {};
  if (Number(a) + Number(b) === Number(answer)) {
    verified.set(clientIp(req), Date.now() + 3600_000);
    return res.redirect('/');
  }
  res.status(403).send('<h1>Respuesta incorrecta</h1><a href="/challenge.html">Reintentar</a>');
});

// 3) EL ESCUDO: puntúa cada petición y decide permitir / retar / bloquear
app.use((req, res, next) => {
  if (req.path === '/challenge.html' || req.path.startsWith('/api/')) return next();
  const ip = clientIp(req);
  if (verified.has(ip)) return next();

  recordHit(ip);
  const { score: baseScore, signals } = scoreRequest(req, ip);
  let score = baseScore;
  // CAPA 6: suma la puntuación del timing conductual (si hay datos)
  const t = scoreTiming(ip);
  if (t.score > 0) { score += t.score; signals.push(...t.signals); }
  const action = decide(score);
  console.log(`[${ip}] score=${score} -> ${action} (${signals.join(', ') || 'sin señales'})`);

  if (action === 'block') {
    return res.status(403).send(
      `<h1>403 — Acceso denegado</h1>` +
      `<p>Nuestro sistema te ha identificado como bot.</p>` +
      `<p>Señales: ${signals.join(', ')}</p>`);
  }
  if (action === 'challenge') return res.redirect('/challenge.html');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// 4) CAPA 5 — honeypot: campo invisible que solo rellena un bot
app.post('/api/contact', (req, res) => {
  if (req.body.website) {
    return res.status(403).send('Bot detectado (honeypot).');
  }
  const name = String(req.body.name || 'visitante').slice(0, 50);
  res.send(`<h1>¡Gracias, ${name}!</h1><p>Has pasado todas las capas.</p><a href="/">Volver</a>`);
});

app.listen(PORT, () => console.log(`antibot-shield en http://localhost:${PORT}`));
