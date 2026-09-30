"""
Demo de la CAPA 6 de antibot-shield: análisis de timing conductual.

Simula 5 perfiles de intervalos entre teclas (ms) y los pasa por el mismo
criterio de puntuación que lib/timing.js:

  1. human      - mezcla log-normal: ráfagas de tecleo + pausas de "pensar"
  2. bot_naive  - jitter uniforme (el bot ingenuo)
  3. bot_multi  - VARIOS patrones uniformes alternados (tu pregunta de hoy)
  4. bot_smart  - imita la distribución marginal humana (log-normal mixta)
  5. bot_replay - repite 5 veces la misma sesión humana grabada

Uso:  python3 analysis/demo.py   -> imprime la tabla y guarda analysis/timing.png
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

rng = np.random.default_rng(42)
N = 400

def human_session(n):
    """Ráfagas rápidas + pausas largas dependientes de 'contexto'."""
    xs = rng.lognormal(mean=4.7, sigma=0.8, size=n)          # tecleo: ~110 ms
    pauses = rng.random(n) < 0.08
    xs[pauses] = rng.lognormal(mean=7.0, sigma=0.7, size=pauses.sum())  # pensar: ~1100 ms
    return xs

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

profiles = {
    "human":     human_session(N),
    "bot_naive": rng.uniform(80, 220, N),
    "bot_multi": np.concatenate([rng.uniform(lo, hi, N // 3)
                                 for lo, hi in [(80, 150), (150, 300), (300, 600)]]),
    "bot_smart": human_session(N),   # misma marginal que el humano
    "bot_replay": np.tile(human_session(80), 5),
}
rng.shuffle(profiles["bot_multi"])

print(f"{'perfil':<10} {'media':>7} {'CV':>5} {'burst':>6} {'entrop':>6} {'dup':>5} {'ac':>6} | score señales")
for name, xs in profiles.items():
    f = features(xs)
    s, sig = score(f)
    print(f"{name:<10} {f['mean']:7.0f} {f['cv']:5.2f} {f['burst']:6.2f} "
          f"{f['entropy']:6.2f} {f['dup']:5.2f} {f['ac']:6.2f} | {s:>3}  {', '.join(sig) or '—'}")

fig, axes = plt.subplots(1, 5, figsize=(16, 3), sharey=True)
for ax, (name, xs) in zip(axes, profiles.items()):
    ax.hist(xs, bins=40, range=(0, 2000))
    ax.set_title(name, fontsize=10)
    ax.set_xlabel("ms")
axes[0].set_ylabel("frecuencia")
fig.suptitle("Distribución de intervalos entre teclas por perfil")
fig.tight_layout()
fig.savefig("analysis/timing.png")
print("\nHistograma guardado en analysis/timing.png")
print("\nLectura: el bot ingenuo cae por regularidad; el multi-patrón sube el CV pero")
print("sigue sin ráfagas reales; el 'listo' PASA esta capa (por eso ninguna capa decide")
print("sola); el replay cae por duplicados exactos. La defensa real combina capas.")
