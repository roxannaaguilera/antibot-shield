// CAPA 6 (cliente): recolector de timing conductual para antibot-shield.
// Mide intervalos entre pulsaciones de tecla, movimientos de ratón y clics,
// y los envía al servidor cada 10 s. Sin librerías, < 1 KB.
(function () {
  const data = { keys: [], moves: [], clicks: [] };
  let lastKey = 0, lastMove = 0, lastClick = 0, moveCount = 0;

  document.addEventListener('keydown', () => {
    const now = performance.now();
    if (lastKey) data.keys.push(Math.round((now - lastKey) * 100) / 100);
    lastKey = now;
  });

  document.addEventListener('mousemove', () => {
    if (++moveCount % 20) return; // muestrea 1 de cada 20 para no saturar
    const now = performance.now();
    if (lastMove) data.moves.push(Math.round((now - lastMove) * 100) / 100);
    lastMove = now;
  });

  document.addEventListener('click', () => {
    const now = performance.now();
    if (lastClick) data.clicks.push(Math.round((now - lastClick) * 100) / 100);
    lastClick = now;
  });

  function send() {
    if (!data.keys.length && !data.moves.length && !data.clicks.length) return;
    const payload = JSON.stringify({
      keys: data.keys.splice(0),
      moves: data.moves.splice(0),
      clicks: data.clicks.splice(0)
    });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/timing', blob);
    } else {
      fetch('/api/timing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload, keepalive: true
      }).catch(() => {});
    }
  }

  setInterval(send, 10000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send();
  });
})();
