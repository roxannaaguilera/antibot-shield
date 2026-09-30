// CAPA 6 — análisis de timing conductual (lado servidor).
//
// Idea: un humano genera intervalos entre acciones con cola pesada
// (ráfagas rápidas + pausas largas de "pensar"), con entropía media-alta
// y sin repeticiones exactas. Un bot ingenuo usa jitter uniforme
// (entropía alta pero CV bajo, sin ráfagas). Uno "listo" imita una
// log-normal y PASA esta capa: por eso ninguna capa decide sola.
// Lo que sí delata al listo: repetir sesiones grabadas (replay) y la
// estacionariedad a largo plazo.
//
// Los umbrales son heurísticos para la demo; ajústalos a tu tráfico real.

const sessions = new Map(); // ip -> { keys: [], moves: [], clicks: [] }
const MAX_EVENTS = 500;

function recordTiming(ip, payload) {
  let s = sessions.get(ip);
  if (!s) { s = { keys: [], moves: [], clicks: [] }; sessions.set(ip, s); }
  for (const k of ['keys', 'moves', 'clicks']) {
    const arr = (payload && payload[k]) || [];
    const clean = arr.filter(x => typeof x === 'number' && x >= 0 && x < 60000);
    s[k] = s[k].concat(clean).slice(-MAX_EVENTS);
  }
}

// Extrae rasgos estadísticos de una serie de intervalos (ms).
function features(xs) {
  const n = xs.length;
  if (n < 10) return null; // pocos datos: no se decide
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const cv = mean > 0 ? sd / mean : 0;                    // coeficiente de variación
  const burst = (sd - mean) / (sd + mean || 1);           // -1 (métronomo) .. +1 (ráfagas)
  // Entropía sobre histograma de 10 bines logarítmicos
  const bins = new Array(10).fill(0);
  for (const x of xs) bins[Math.min(9, Math.floor(Math.log10(x + 1) * 3))]++;
  const entropy = -bins.reduce((a, c) => (c ? a + (c / n) * Math.log2(c / n) : a), 0);
  // Proporción de intervalos EXACTAMENTE duplicados (misma sesión grabada repetida).
  // Se comparan valores sin redondear: en datos humanos genuinos los duplicados
  // exactos son rarísimos; en un replay son la mayoría.
  const dupRatio = 1 - new Set(xs).size / n;
  // Autocorrelación lag-1: un generador ingenuo no tiene memoria
  let ac = 0;
  if (sd > 0 && n > 1) {
    let s = 0;
    for (let i = 1; i < n; i++) s += (xs[i] - mean) * (xs[i - 1] - mean);
    ac = s / (n - 1) / (sd * sd);
  }
  return { n, mean: Math.round(mean), sd: Math.round(sd), cv: +cv.toFixed(2), burst: +burst.toFixed(2), entropy: +entropy.toFixed(2), dupRatio: +dupRatio.toFixed(2), ac: +ac.toFixed(2) };
}

function scoreTiming(ip) {
  const s = sessions.get(ip);
  if (!s) return { score: 0, signals: [], detail: null };
  const f = features(s.keys); // las teclas son la señal más densa
  if (!f) return { score: 0, signals: [], detail: null };
  const signals = [];
  let score = 0;
  const add = (pts, name) => { score += pts; signals.push(`${name} (+${pts})`); };

  // Jitter uniforme: entropía alta pero variación relativa baja y sin ráfagas
  if (f.entropy > 2.8 && f.cv < 0.6) add(20, 'timing demasiado regular (jitter uniforme)');
  if (f.burst < -0.2 && f.n > 30) add(15, 'sin ráfagas humanas');
  // Replay: la misma sesión grabada repetida deja intervalos idénticos
  if (f.dupRatio > 0.35) add(30, 'intervalos repetidos (posible replay)');
  if (Math.abs(f.ac) > 0.7 && f.n > 30) add(10, 'autocorrelación sospechosa');

  return { score, signals, detail: f };
}

module.exports = { recordTiming, scoreTiming, features };
