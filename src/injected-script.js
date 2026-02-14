/**
 * Showdex AI - Injected Script (MAIN world)
 * Intercepta mensajes de batalla, acumula el log y al recibir |request|
 * extrae payload + datos del rival (|switch|, |move|) y los envía al Content Script.
 */
(function () {
  if (typeof window === 'undefined') return;

  const MAX_LOG_LINES = 5000;
  let logBuffer = [];

  function toPokeApiId(name) {
    if (!name || typeof name !== 'string') return '';
    const part = String(name).split(',')[0].trim();
    return part
      .replace(/\s+/g, '-')
      .replace(/\./g, '')
      .replace(/'/g, '')
      .toLowerCase();
  }

  /** Parsea el buffer del log para obtener el Pokémon activo del rival y movimientos usados. */
  function parseOpponentFromLog(lines, opponentSlotPrefix) {
    var details = null;
    var moves = [];
    var seenMoves = {};
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var parts = line.split('|');
      if (parts.length < 4) continue;
      var kind = (parts[1] && parts[1].trim()) || '';
      var who = (parts[2] && parts[2].trim()) || '';
      if (!who || who.indexOf(opponentSlotPrefix) !== 0) continue;
      if (kind === 'switch' || kind === 'drag') {
        details = parts[3] ? parts[3].trim() : null;
      } else if (kind === 'move') {
        var moveName = parts[3] ? parts[3].trim() : '';
        if (moveName && !seenMoves[moveName]) {
          seenMoves[moveName] = true;
          moves.push(moveName);
        }
      }
    }
    if (!details) return null;
    return {
      details: details,
      speciesId: toPokeApiId(details),
      moves: moves,
    };
  }

  function installHook() {
    if (!window.app || typeof window.app.receive !== 'function') return false;

    const originalReceive = window.app.receive;
    window.app.receive = function (data) {
      if (typeof data === 'string') {
        var chunkLines = data.split('\n');
        for (var i = 0; i < chunkLines.length; i++) {
          var line = chunkLines[i].trim();
          if (line.length) {
            logBuffer.push(line);
            if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
          }
        }

        if (data.includes('|request|')) {
          try {
            var idx = data.indexOf('|request|');
            var payloadStr = data.slice(idx + '|request|'.length).trim();
            var req = {};
            try {
              req = JSON.parse(payloadStr);
            } catch (_) {}
            if (req.requestType === 'wait') {
              return originalReceive.apply(this, arguments);
            }
            var sideId = (req.side && req.side.id) || 'p2';
            var opponentPrefix = sideId === 'p1' ? 'p2a:' : 'p1a:';
            var opponentSummary = parseOpponentFromLog(logBuffer, opponentPrefix);

            window.dispatchEvent(
              new CustomEvent('ShowdownData', {
                detail: {
                  payload: payloadStr,
                  opponentSummary: opponentSummary || null,
                },
              })
            );
          } catch (e) {
            console.warn('[Showdex AI] Error dispatching ShowdownData:', e);
            try {
              window.dispatchEvent(
                new CustomEvent('ShowdownData', { detail: { payload: data.slice(data.indexOf('|request|') + '|request|'.length).trim(), opponentSummary: null } })
              );
            } catch (_) {}
          }
        }
      }
      return originalReceive.apply(this, arguments);
    };
    return true;
  }

  if (installHook()) return;

  const observer = new MutationObserver(function () {
    if (installHook()) observer.disconnect();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const timeout = setTimeout(function () {
    observer.disconnect();
  }, 30000);
  if (installHook()) clearTimeout(timeout);
})();
