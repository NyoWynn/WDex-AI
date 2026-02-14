/**
 * Showdex AI - Content Script (ISOLATED world)
 * Puente: escucha ShowdownData del injected script, limpia datos,
 * los envía al Background y monta la UI flotante.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BattleOverlay } from './components/BattleOverlay';
import './index.css';

const ROOT_ID = 'showdex-ai-root';

function ensureRoot() {
  let rootEl = document.getElementById(ROOT_ID);
  if (!rootEl) {
    rootEl = document.createElement('div');
    rootEl.id = ROOT_ID;
    document.body.appendChild(rootEl);
  }
  return rootEl;
}

function mountUI() {
  const el = ensureRoot();
  if (el._showdexMounted) return;
  el._showdexMounted = true;
  const root = createRoot(el);
  root.render(
    <React.StrictMode>
      <BattleOverlay />
    </React.StrictMode>
  );
}

/**
 * Extrae el payload JSON del |request| (para compatibilidad con detail en string).
 * @param {string} raw - Cadena cruda (ej. "|request|{...}")
 * @returns {string|null} - JSON string del request o null
 */
function parseRequestPayload(raw) {
  if (typeof raw !== 'string' || !raw.includes('|request|')) return null;
  const idx = raw.indexOf('|request|');
  const payload = raw.slice(idx + '|request|'.length).trim();
  if (!payload) return null;
  try {
    JSON.parse(payload);
    return payload;
  } catch {
    return payload;
  }
}

/** Convierte chrome.runtime.lastError en string legible (nunca "[object Object]"). */
function getLastErrorMessage(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && typeof err.message === 'string') return err.message;
  try {
    const s = JSON.stringify(err);
    if (s && s !== '{}') return s;
  } catch (_) {}
  return Object.prototype.toString.call(err);
}

let lastRequestPayload = null;
let lastOpponentSummary = null;

function sendShowdownRequest(payload, opponentSummary = null) {
  try {
    window.dispatchEvent(new CustomEvent('ShowdexRequestSent'));
  } catch (_) {}
  try {
    chrome.runtime.sendMessage(
      { type: 'SHOWDOWN_REQUEST', payload, opponentSummary: opponentSummary ?? lastOpponentSummary },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          const msg = getLastErrorMessage(err);
          console.warn('[Showdex AI] Background error:', msg);
          const friendly =
            msg.includes('Extension context invalidated') || msg.includes('context invalidated')
              ? 'Extensión recargada. Refresca la página de la batalla (F5).'
              : msg.includes('message channel closed')
                ? 'El servicio se cerró antes de responder. Refresca la página e inténtalo de nuevo.'
                : msg;
          try {
            window.dispatchEvent(new CustomEvent('ShowdexError', { detail: { message: friendly } }));
          } catch (_) {}
        }
        }
      );
  } catch (e) {
    const msg = e?.message || String(e);
    console.warn('[Showdex AI] Send error:', msg);
    try {
      window.dispatchEvent(
        new CustomEvent('ShowdexError', {
          detail: {
            message: msg.includes('Extension context invalidated')
              ? 'Extensión recargada. Refresca la página de la batalla (F5).'
              : msg,
          },
        })
      );
    } catch (_) {}
  }
}

function handleShowdownData(event) {
  const detail = event.detail;
  let payload = null;
  let opponentSummary = null;
  if (detail && typeof detail === 'object' && 'payload' in detail) {
    payload = detail.payload || null;
    opponentSummary = detail.opponentSummary ?? null;
  } else if (typeof detail === 'string') {
    payload = parseRequestPayload(detail);
  }
  if (!payload) return;
  lastRequestPayload = payload;
  if (opponentSummary != null) lastOpponentSummary = opponentSummary;
  sendShowdownRequest(payload, opponentSummary);
}

function handleRefreshRequest() {
  if (!lastRequestPayload) return;
  sendShowdownRequest(lastRequestPayload);
}

function init() {
  window.addEventListener('ShowdownData', handleShowdownData);
  window.addEventListener('ShowdexRefreshRequest', handleRefreshRequest);
  mountUI();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
