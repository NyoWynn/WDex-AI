/**
 * Showdex AI - Background Service Worker (Manifest V3)
 * Recibe el JSON de batalla, llama a Gemini u OpenRouter y devuelve la sugerencia a la UI.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-2.5-flash';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_TIMEOUT_MS = 15000;
const API_RETRY_MAX = 2;
const API_RETRY_DELAY_MS = 2500;
const FALLBACK_MSG = 'No pude analizar la batalla.';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFailedSuggestion(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim();
  return !t || t === FALLBACK_MSG || t.length < 10;
}

// Modelos en OpenRouter (lista para el selector)
const OPENROUTER_DEFAULT_MODEL = 'openrouter/aurora-alpha';

const SYSTEM_PROMPT = `Eres un experto en batallas competitivas de Pokémon (formato Showdown).
Analiza el JSON de estado de batalla y responde SIEMPRE en este formato exacto y breve (en español):

1. Una sola línea con la acción, usando exactamente una de estas frases:
   - "Atacar: [nombre del movimiento]" (si la mejor opción es un ataque)
   - "Usar: [nombre del movimiento]" (si es un movimiento de apoyo/estado)
   - "Cambiar a: [nombre del Pokémon]" (si la mejor opción es cambiar de Pokémon)

2. Una segunda línea que empiece por "Por qué: " y en una sola frase corta expliques la razón (tipos, ventaja, o riesgo principal).

No añadas párrafos largos, listas numeradas ni código. Solo esas dos líneas. Responde completo sin cortarte a mitad de frase.`;

const USER_PROMPT_PREFIX = `Estado de batalla (JSON):\n\n`;
const USER_PROMPT_SUFFIX = `\n\nResponde en exactamente dos líneas: (1) Atacar/Usar/Cambiar a [nombre], (2) Por qué: [una frase]. No te cortes; mantén la respuesta corta y completa.`;

/** Añade al prompt la info del rival (especie y movimientos vistos) para que la IA la tenga en cuenta. */
function buildUserPrompt(payload, opponentSummary) {
  let text = USER_PROMPT_PREFIX + payload;
  if (opponentSummary && (opponentSummary.details || (opponentSummary.moves && opponentSummary.moves.length > 0))) {
    const rival = opponentSummary.details ? opponentSummary.details.split(',')[0].trim() : 'desconocido';
    const moves = Array.isArray(opponentSummary.moves) && opponentSummary.moves.length > 0
      ? opponentSummary.moves.join(', ')
      : 'ninguno visto aún';
    text += `\n\nRival activo: ${rival}. Movimientos que ha usado hasta ahora: ${moves}.`;
  }
  text += USER_PROMPT_SUFFIX;
  return text;
}

/**
 * Normaliza nombre de especie para PokeAPI: minúsculas, sin puntos, espacios → guión.
 * Ej: "Mr. Mime" → "mr-mime", "Noivern" → "noivern".
 */
function toPokeApiId(name) {
  if (!name || typeof name !== 'string') return '';
  const part = name.split(',')[0].trim();
  return part
    .replace(/\s+/g, '-')
    .replace(/\./g, '')
    .replace(/'/g, '')
    .toLowerCase();
}

/**
 * Parsea el request de Showdown y extrae resumen para la UI (nuestro activo, equipo, movimientos).
 * Acepta side.pokemon o side.team; si ningún Pokémon tiene .active, usa el primero cuando hay active[].
 */
function parseBattleSummary(payloadStr) {
  try {
    const req = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
    const side = req?.side;
    const active = req?.active;
    const pokemon = side?.pokemon ?? side?.team ?? null;
    if (!Array.isArray(pokemon) || pokemon.length === 0) return null;

    let activePokemon = pokemon.find((p) => p.active);
    if (!activePokemon && Array.isArray(active) && active.length > 0) {
      activePokemon = pokemon[0];
    }
    const activeMoves = active?.[0]?.moves?.map((m) => m.move || m.id) || [];
    const getDetails = (p) => (p && (p.details ?? p.species ?? p.name)) || '';
    const getIdent = (p) => (p && (p.ident ?? p.details ?? p.species ?? p.name)) || '';

    return {
      ourActive: activePokemon
        ? {
            ident: getIdent(activePokemon),
            details: getDetails(activePokemon),
            speciesId: toPokeApiId(getDetails(activePokemon)),
            condition: activePokemon.condition ?? '',
          }
        : null,
      ourTeam: pokemon.map((p) => ({
        ident: getIdent(p),
        details: getDetails(p),
        speciesId: toPokeApiId(getDetails(p)),
        condition: p.condition ?? '',
        active: !!p.active,
      })),
      ourMoves: activeMoves,
      opponentActive: null,
      opponentMoves: [],
    };
  } catch (_) {
    return null;
  }
}

async function callGemini(apiKey, userPromptText) {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPromptText }],
      },
    ],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 512,
    },
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || FALLBACK_MSG;
  return text;
}

async function callOpenRouter(apiKey, modelId, userPromptText) {
  const body = {
    model: modelId || OPENROUTER_DEFAULT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPromptText },
    ],
    max_tokens: 512,
    temperature: 0.5,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      let friendly = 'Límite de uso alcanzado (429). Los modelos gratis comparten cuota.';
      try {
        const errJson = JSON.parse(errText);
        const raw = errJson?.metadata?.raw || errJson?.error?.message || '';
        if (raw.includes('rate-limited') || raw.includes('rate limit')) {
          friendly += ' Espera un minuto e inténtalo de nuevo. Si pasa seguido, en OpenRouter puedes añadir tu propia clave del proveedor para tener tu cuota: openrouter.ai/settings/integrations';
        }
      } catch (_) {}
      throw new Error(friendly);
    }
    throw new Error(`OpenRouter API error: ${res.status} - ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text =
    data?.choices?.[0]?.message?.content?.trim() || FALLBACK_MSG;
  return text;
}

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (message.type !== 'SHOWDOWN_REQUEST') return;

    const tabId = sender.tab?.id;
    const payload = message.payload;
    const opponentSummary = message.opponentSummary || null;
    let responded = false;
    const done = () => {
      if (responded) return;
      responded = true;
      try {
        sendResponse();
      } catch (_) {}
    };

    (async () => {
      try {
        const { apiKey, provider, openRouterApiKey, openRouterModel } =
          await chrome.storage.local.get([
            'apiKey',
            'provider',
            'openRouterApiKey',
            'openRouterModel',
          ]);

        const battleSummaryBase = parseBattleSummary(payload);
        if (!battleSummaryBase) {
          if (tabId != null) {
            chrome.tabs.sendMessage(tabId, {
              type: 'SHOWDEX_SUGGESTION',
              suggestion: null,
              battleSummary: null,
            });
          }
          done();
          return;
        }

        let battleSummary = battleSummaryBase;
        if (battleSummary && opponentSummary) {
          battleSummary = {
            ...battleSummary,
            opponentActive: {
              details: opponentSummary.details,
              speciesId: opponentSummary.speciesId,
            },
            opponentMoves: Array.isArray(opponentSummary.moves) ? opponentSummary.moves : [],
          };
        } else if (battleSummary && opponentSummary === null) {
          battleSummary = {
            ...battleSummary,
            opponentActive: null,
            opponentMoves: [],
          };
        }

        if (provider === 'solo-datos') {
          if (tabId != null) {
            chrome.tabs.sendMessage(tabId, {
              type: 'SHOWDEX_SUGGESTION',
              suggestion: null,
              battleSummary,
            });
          }
          done();
          return;
        }

        const useOpenRouter = provider === 'openrouter';
        const key = useOpenRouter ? openRouterApiKey : apiKey;
        const keyLabel = useOpenRouter ? 'OpenRouter' : 'Gemini';

        if (!key || typeof key !== 'string') {
          if (tabId != null) {
            chrome.tabs.sendMessage(tabId, {
              type: 'SHOWDEX_SUGGESTION',
              error: `Falta API Key de ${keyLabel}. Abre la configuración del overlay y añade tu clave.`,
            });
          }
          done();
          return;
        }

        const userPrompt = buildUserPrompt(payload, opponentSummary);
        let suggestion = null;
        for (let attempt = 0; attempt <= API_RETRY_MAX; attempt++) {
          suggestion = useOpenRouter
            ? await callOpenRouter(key, openRouterModel || OPENROUTER_DEFAULT_MODEL, userPrompt)
            : await callGemini(key, userPrompt);
          if (!isFailedSuggestion(suggestion)) break;
          if (attempt < API_RETRY_MAX) await sleep(API_RETRY_DELAY_MS);
        }

        if (tabId != null) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SHOWDEX_SUGGESTION',
            suggestion,
            battleSummary,
          });
        }
        done();
      } catch (e) {
        if (tabId != null) {
          const errMsg =
            e.name === 'AbortError'
              ? `La solicitud tardó más de ${API_TIMEOUT_MS / 1000} segundos. Usa Actualizar para intentar de nuevo.`
              : e.message || 'Error al llamar a la API';
          chrome.tabs.sendMessage(tabId, {
            type: 'SHOWDEX_SUGGESTION',
            error: errMsg,
          });
        }
        done();
      }
    })();

    return true;
  }
);
