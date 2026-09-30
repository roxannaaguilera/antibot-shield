# Simulación de la CAPA 6 — timing conductual

`demo.py` simula 5 perfiles de intervalos entre teclas (ms) y los pasa por el
mismo criterio de puntuación que `lib/timing.js`. Sirve para calibrar la capa
sin necesidad de tráfico real.

## Perfiles simulados (n = 400 intervalos)

| Perfil      | Generación |
|-------------|------------|
| `human`     | Mezcla log-normal: tecleo `lognormal(4.7, 0.8)` (~110 ms) + 8 % de pausas de "pensar" `lognormal(7.0, 0.7)` (~1100 ms) |
| `bot_naive` | Jitter uniforme `U(80, 220)` |
| `bot_multi` | Tres patrones uniformes alternados: `U(80,150)`, `U(150,300)`, `U(300,600)` |
| `bot_smart` | Imita la distribución marginal humana (misma mezcla que `human`) |
| `bot_replay`| Una sesión humana de 80 intervalos, repetida 5 veces (valores idénticos) |

## Rasgos extraídos

- **media**: media de los intervalos (ms)
- **CV**: coeficiente de variación (desviación / media)
- **burst**: burstiness `(sd − media) / (sd + media)`; −1 = metrónomo, +1 = ráfagas
- **entrop**: entropía del histograma en 10 bines logarítmicos
- **dup**: proporción de intervalos exactamente duplicados (delata el replay)
- **ac**: autocorrelación lag-1

## Reglas de puntuación (heurísticas, ajústalas a tu tráfico)

| Regla | Puntos | Señal |
|-------|--------|-------|
| entropía > 2.8 y CV < 0.6 | +20 | timing demasiado regular (jitter uniforme) |
| burst < −0.2 (n > 30) | +15 | sin ráfagas humanas |
| dup > 0.35 | +30 | intervalos repetidos (posible replay) |
| \|ac\| > 0.7 (n > 30) | +10 | autocorrelación sospechosa |

## Resultado de la simulación

```
perfil       media    CV  burst entrop   dup     ac | score señales
human          245  1.58   0.23   2.29  0.00   0.02 |   0  —
bot_naive      150  0.27  -0.57   0.77  0.00   0.03 |  15  sin ráfagas humanas
bot_multi      264  0.57  -0.28   1.73  0.00  -0.00 |  15  sin ráfagas humanas
bot_smart      261  2.24   0.38   2.30  0.00  -0.00 |   0  —
bot_replay     161  0.80  -0.11   2.11  0.80   0.03 |  30  intervalos repetidos (replay)
```

## Lectura

- El bot ingenuo cae por regularidad (sin ráfagas humanas).
- El multi-patrón sube el CV pero sigue sin ráfagas reales: varios patrones
  ayudan, pero el cambio de patrón es en sí mismo detectable.
- El bot "listo" **pasa** esta capa con 0 puntos: imitar bien la distribución
  marginal basta para una sola capa. Por eso ninguna capa decide sola.
- El replay cae por duplicados exactos.

La defensa real combina capas: timing + IP + cabeceras + huella del navegador
+ honeypot. El atacante necesita ser perfecto en todo; el defensor solo
necesita una grieta.

## Adversario de prueba (`adversarial.py`)

Red-teaming defensivo: genera arrays sintéticos y los enfrenta al detector
para encontrar agujeros antes que un atacante real.

```
python3 analysis/adversarial.py
```

| Adversario | Resultado |
|------------|-----------|
| `bot_smart` | 0 puntos — imitar la marginal humana basta (ya se sabía) |
| `bot_replay_jitter` | **0 puntos** — replay + 3 ms de ruido rompe los duplicados exactos |
| `bot_optimizer` | 0 puntos — la búsqueda aleatoria siempre encuentra parámetros que pasan |

Diagnóstico: con tolerancia ±5 ms el replay con jitter da `dup = 0.75`.
Lección: los duplicados exactos no bastan; hay que comparar con tolerancia.

## Uso

```
python3 analysis/demo.py
```

Genera la tabla en consola y el histograma `analysis/timing.png`.
Requiere `numpy`, `scipy`, `matplotlib`.
