"""
Adversario de prueba para la CAPA 6 de antibot-shield.

NO es un bot: genera arrays sintéticos de intervalos y los enfrenta al
criterio de puntuación de lib/timing.js para encontrar dónde falla el
detector. Red-teaming defensivo: cada agujero que encuentres aquí es una
regla que puedes endurecer antes de que lo haga otro.

Adversarios:
  1. bot_smart        - imita la distribución marginal humana (baseline)
  2. bot_replay_jitter - replay + ruido gaussiano: rompe los duplicados exactos
  3. bot_optimizer    - búsqueda aleatoria sobre los parámetros de la mezcla
                        humana para MINIMIZAR el score del detector

Uso:  python3 analysis/adversarial.py
"""
import numpy as np

rng = np.random.default_rng(7)
N = 400


def features(xs):
    n = len(xs)
    mean, sd = xs.mean(), xs.std()
    cv = sd / mean if mean else 0
    burst = (sd - mean) / (sd + mean) if (sd + mean) else 0
    hist, _ = np.histogram(np.log10(xs + 1) * 3, bins=10, range=(0, 10))
    p = hist / n
    entropy = -(p[p > 0] * np.log2(p[p > 0])).sum()
    dup = 1 - len(np.unique(xs)) / n
    ac = np.corrcoef(xs[:-1], xs[1:])[0, 1] if sd > 0 else 0
    return dict(n=n, mean=mean, cv=cv, burst=burst, entropy=entropy, dup=dup, ac=ac)


def score(f):
    s, sig = 0, []
    if f["entropy"] > 2.8 and f["cv"] < 0.6:
        s += 20; sig.append("timing regular (jitter uniforme)")
    if f["burst"] < -0.2 and f["n"] > 30:
        s += 15; sig.append("sin ráfagas humanas")
    if f["dup"] > 0.35:
        s += 30; sig.append("intervalos repetidos (replay)")
    if abs(f["ac"]) > 0.7 and f["n"] > 30:
        s += 10; sig.append("autocorrelación sospechosa")
    return s, sig


def human_mixture(n, type_mu=4.7, type_sd=0.8, p_pause=0.08,
                  pause_mu=7.0, pause_sd=0.7):
    xs = rng.lognormal(mean=type_mu, sigma=type_sd, size=n)
    pauses = rng.random(n) < p_pause
    xs[pauses] = rng.lognormal(mean=pause_mu, sigma=pause_sd,
                               size=pauses.sum())
    return xs


def show(name, xs):
    f = features(xs)
    s, sig = score(f)
    print(f"{name:<18} {f['mean']:7.0f} {f['cv']:5.2f} {f['burst']:6.2f} "
          f"{f['entropy']:6.2f} {f['dup']:5.2f} {f['ac']:6.2f} | {s:>3}  "
          f"{', '.join(sig) or '—'}")
    return s, f, xs


print(f"{'adversario':<18} {'media':>7} {'CV':>5} {'burst':>6} "
      f"{'entrop':>6} {'dup':>5} {'ac':>6} | score señales")

# 1. Baseline: ya pasaba
show("bot_smart", human_mixture(N))

# 2. Replay con jitter: el replay ingenuo caía por duplicados exactos.
#    ¿Y si el atacante añade 3 ms de ruido?
replay = np.tile(human_mixture(80), 5)
show("bot_replay_jitter", replay + rng.normal(0, 3, N))

# 3. Optimizador: busca los parámetros que minimizan el score.
best = (999, None)
for _ in range(300):
    xs = human_mixture(
        N,
        type_mu=rng.uniform(4.0, 5.5),
        type_sd=rng.uniform(0.3, 1.2),
        p_pause=rng.uniform(0.02, 0.20),
        pause_mu=rng.uniform(6.0, 8.0),
        pause_sd=rng.uniform(0.3, 1.0),
    )
    s, _ = score(features(xs))
    if s < best[0]:
        best = (s, xs)
print(f"\nMejor adversario encontrado: score {best[0]}")

# Diagnóstico: ¿qué regla NUEVA lo pillaría?
f = features(best[1])
fuzzy_dup = 1 - len(np.unique(np.round(best[1] / 5) * 5)) / N
print(f"dup exacto: {f['dup']:.2f} | dup con tolerancia ±5 ms: {fuzzy_dup:.2f}")
print("\nLectura: si el replay con jitter pasa, los duplicados exactos no bastan;")
print("hay que comparar con tolerancia. Cada agujero aquí = una regla a endurecer.")
