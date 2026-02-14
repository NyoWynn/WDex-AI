/**
 * Showdex AI - Overlay flotante (draggable, glassmorphism, estilo gaming)
 * Muestra Pokémon activo, equipo, sugerencia separada (Sugerencia / Por qué) y botón Actualizar.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const POKEAPI = 'https://pokeapi.co/api/v2/pokemon';
const TYPE_COLORS = {
  normal: 'bg-gray-400',
  fire: 'bg-orange-500',
  water: 'bg-blue-500',
  electric: 'bg-yellow-400',
  grass: 'bg-green-500',
  ice: 'bg-cyan-300',
  fighting: 'bg-red-600',
  poison: 'bg-purple-500',
  ground: 'bg-amber-600',
  flying: 'bg-indigo-300',
  psychic: 'bg-pink-500',
  bug: 'bg-lime-500',
  rock: 'bg-amber-700',
  ghost: 'bg-purple-700',
  dragon: 'bg-violet-600',
  dark: 'bg-gray-800',
  steel: 'bg-slate-400',
  fairy: 'bg-pink-300',
};

/** Tipos que hacen 2x de daño a cada tipo (chart estándar). */
const TYPE_WEAKNESSES = {
  normal: ['fighting'],
  fire: ['water', 'ground', 'rock'],
  water: ['electric', 'grass'],
  electric: ['ground'],
  grass: ['fire', 'ice', 'poison', 'flying', 'bug'],
  ice: ['fire', 'fighting', 'rock', 'steel'],
  fighting: ['flying', 'psychic', 'fairy'],
  poison: ['ground', 'psychic'],
  ground: ['water', 'grass', 'ice'],
  flying: ['electric', 'ice', 'rock'],
  psychic: ['bug', 'ghost', 'dark'],
  bug: ['fire', 'flying', 'rock'],
  rock: ['water', 'grass', 'fighting', 'ground', 'steel'],
  ghost: ['ghost', 'dark'],
  dragon: ['ice', 'dragon', 'fairy'],
  dark: ['fighting', 'bug', 'fairy'],
  steel: ['fire', 'fighting', 'ground'],
  fairy: ['poison', 'steel'],
};

function getWeaknesses(types) {
  if (!Array.isArray(types) || types.length === 0) return [];
  const set = new Set();
  for (const t of types) {
    const weak = TYPE_WEAKNESSES[t];
    if (weak) weak.forEach((w) => set.add(w));
  }
  return [...set];
}

const OPENROUTER_MODELS = [
  { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
  { id: 'mistralai/mistral-small-31-2409', label: 'Mistral Small 3.1' },
  { id: 'deepseek/deepseek-r1-distill-qwen-32b', label: 'Qwen QwQ 32B' },
  { id: 'mistralai/devstral-small', label: 'Devstral Small' },
  { id: 'microsoft/phi-4-reasoning-plus', label: 'Microsoft Phi 4 Reasoning Plus' },
  { id: 'openrouter/aurora-alpha', label: 'OpenRouter Aurora Alpha' },
  { id: 'sourceful/riverflow-v2-fast', label: 'Sourceful Riverflow v2 Fast' },
  { id: 'liquid/lfm-2.5-1.2b-thinking:free', label: 'Liquid LFM 2.5 1.2B (free)' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nvidia Nemotron 3 Nano 30B (free)' },
  { id: 'openai/gpt-oss-120b:free', label: 'OpenAI GPT-OSS 120B (free)' },
  { id: 'arcee-ai/trinity-large-preview:free', label: 'Arcee Trinity Large (free)' },
  { id: 'stepfun/step-3.5-flash:free', label: 'StepFun Step 3.5 Flash (free)' },
  { id: 'google/gemma-3n-e2b-it:free', label: 'Google Gemma 3N E2B (free)' },
];

function usePokeData(speciesId) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!speciesId) {
      setData(null);
      return;
    }
    let cancelled = false;
    const url = `${POKEAPI}/${encodeURIComponent(speciesId)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const artwork = d.sprites?.other?.['official-artwork']?.front_default;
        const sprite = artwork || d.sprites?.front_default;
        const types = (d.types || []).map((t) => t.type?.name).filter(Boolean);
        setData({ sprite: sprite || null, types });
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => { cancelled = true; };
  }, [speciesId]);
  return data;
}

function BattleOverlay() {
  const [suggestion, setSuggestion] = useState(null);
  const [battleSummary, setBattleSummary] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [provider, setProvider] = useState('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [openRouterModel, setOpenRouterModel] = useState(OPENROUTER_MODELS[0].id);
  const [position, setPosition] = useState({ x: 24, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const ourActiveId = battleSummary?.ourActive?.speciesId;
  const opponentSpeciesId = battleSummary?.opponentActive?.speciesId;
  const pokeData = usePokeData(ourActiveId);
  const opponentPokeData = usePokeData(opponentSpeciesId);

  useEffect(() => {
    const stored = localStorage.getItem('showdex_api_key');
    if (stored) setApiKey(stored);
  }, []);

  useEffect(() => {
    chrome.storage?.local.get(
      ['apiKey', 'provider', 'openRouterApiKey', 'openRouterModel'],
      (data) => {
        if (data.apiKey != null) setApiKey(data.apiKey);
        if (data.provider === 'gemini' || data.provider === 'openrouter' || data.provider === 'solo-datos') setProvider(data.provider);
        if (data.openRouterApiKey != null) setOpenRouterApiKey(data.openRouterApiKey);
        if (data.openRouterModel != null) setOpenRouterModel(data.openRouterModel);
      }
    );
  }, [configOpen]);

  useEffect(() => {
    const handler = (msg) => {
      if (msg.type !== 'SHOWDEX_SUGGESTION') return;
      setLoading(false);
      if (msg.error) {
        const errMsg =
          typeof msg.error === 'string'
            ? msg.error
            : msg.error?.message || String(msg.error);
        setError(errMsg);
        setSuggestion(null);
        setBattleSummary(null);
      } else {
        setError(null);
        setSuggestion(msg.suggestion || null);
        setBattleSummary(msg.battleSummary || null);
      }
    };
    chrome.runtime?.onMessage.addListener(handler);
    return () => chrome.runtime?.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    const onRequest = () => setLoading(true);
    window.addEventListener('ShowdownData', onRequest);
    window.addEventListener('ShowdexRequestSent', onRequest);
    return () => {
      window.removeEventListener('ShowdownData', onRequest);
      window.removeEventListener('ShowdexRequestSent', onRequest);
    };
  }, []);

  useEffect(() => {
    const onError = (e) => {
      const msg = e?.detail?.message;
      setLoading(false);
      setError(typeof msg === 'string' ? msg : 'Error de conexión con la extensión.');
      setSuggestion(null);
    };
    window.addEventListener('ShowdexError', onError);
    return () => window.removeEventListener('ShowdexError', onError);
  }, []);

  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    setIsDragging(true);
    offsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - offsetRef.current.x,
      y: e.clientY - offsetRef.current.y,
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const suggestionLine =
    suggestion && suggestion.includes('Por qué:')
      ? suggestion.split('Por qué:')[0].replace(/^Sugerencia:\s*/i, '').trim()
      : suggestion;
  const whyLine =
    suggestion && suggestion.includes('Por qué:')
      ? suggestion.split('Por qué:').slice(1).join('Por qué:').trim()
      : null;

  const handleRefresh = () => {
    setError(null);
    setLoading(true);
    try {
      window.dispatchEvent(new CustomEvent('ShowdexRefreshRequest'));
    } catch (_) {}
  };

  const saveConfig = () => {
    const geminiKey = apiKey.trim();
    const openRouterKey = openRouterApiKey.trim();
    chrome.storage?.local.set({
      apiKey: geminiKey,
      provider: provider || 'solo-datos',
      openRouterApiKey: openRouterKey,
      openRouterModel: openRouterModel || OPENROUTER_MODELS[0].id,
    });
    if (provider === 'gemini') localStorage.setItem('showdex_api_key', geminiKey);
    setConfigOpen(false);
  };

  return (
    <>
      <motion.div
        className="fixed z-[2147483646] w-[340px] select-none"
        style={{
          left: position.x,
          top: position.y,
          pointerEvents: 'auto',
        }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div
          role="presentation"
          onMouseDown={handleDragStart}
          className="rounded-2xl border-2 border-cyan-500/40 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-2xl backdrop-blur-xl"
          style={{
            boxShadow: '0 0 0 1px rgba(0,255,255,.15), 0 0 32px rgba(0,255,245,.12), 0 8px 32px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-500/30 bg-cyan-950/40 px-4 py-2.5">
            <span className="flex items-center gap-2 font-bold tracking-wide text-cyan-300 drop-shadow-[0_0_8px_rgba(0,255,245,.4)]">
              {typeof chrome !== 'undefined' && chrome.runtime?.getURL ? (
                <img
                  src={chrome.runtime.getURL('logoWDEX.png')}
                  alt="WDex AI"
                  className="h-8 w-auto object-contain"
                />
              ) : (
                <span className="text-lg">WDex AI</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-cyan-300 bg-cyan-500/20 border border-cyan-500/40 transition hover:bg-cyan-500/30 hover:border-cyan-400/50 disabled:opacity-50 disabled:pointer-events-none"
                title="Actualizar sugerencia (mismo turno)"
              >
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => setConfigOpen((o) => !o)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-cyan-400"
                title="Configuración"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Config panel */}
          <AnimatePresence>
            {configOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-white/10"
              >
                <div className="space-y-3 px-4 py-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Modo
                    </label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                    >
                      <option value="solo-datos">Solo datos (sin IA)</option>
                      <option value="openrouter">OpenRouter (IA)</option>
                      <option value="gemini">Gemini (Google AI Studio)</option>
                    </select>
                  </div>
                  {provider === 'solo-datos' ? (
                    <p className="text-xs text-slate-400">
                      Solo se muestran tus Pokémon, el rival y sus debilidades. No se usa IA ni API key.
                    </p>
                  ) : provider === 'openrouter' ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          API Key de OpenRouter
                        </label>
                        <input
                          type="password"
                          value={openRouterApiKey}
                          onChange={(e) => setOpenRouterApiKey(e.target.value)}
                          placeholder="sk-or-v1-..."
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                        />
                        <p className="mt-1 text-[10px] text-slate-500">
                          Crea una en{' '}
                          <a
                            href="https://openrouter.ai/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:underline"
                          >
                            openrouter.ai/keys
                          </a>
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Modelo
                        </label>
                        <select
                          value={openRouterModel}
                          onChange={(e) => setOpenRouterModel(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                        >
                          {OPENROUTER_MODELS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        API Key de Gemini (Google AI Studio)
                      </label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Ej: AIza..."
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={saveConfig}
                    className="w-full rounded-lg bg-cyan-500/20 py-2 text-sm font-medium text-cyan-400 transition hover:bg-cyan-500/30"
                  >
                    Guardar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pokémon: nuestro activo + equipo / rival */}
          {(battleSummary?.ourActive || (battleSummary?.ourTeam?.length ?? 0) > 0) && (
            <div className="border-b border-cyan-500/20 bg-slate-900/50 px-3 py-2">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center shrink-0">
                  {pokeData?.sprite ? (
                    <img
                      src={pokeData.sprite}
                      alt={battleSummary.ourActive?.details || 'Activo'}
                      className="h-14 w-14 object-contain drop-shadow-[0_0_6px_rgba(0,255,245,.3)]"
                    />
                  ) : (
                    <div
                      className="h-14 w-14 rounded-lg bg-slate-700/80 border border-cyan-500/30 flex items-center justify-center text-slate-400 text-[10px] font-medium"
                      title={ourActiveId ? 'Cargando sprite…' : 'Sin datos del activo'}
                    >
                      {battleSummary.ourActive?.details?.split(',')[0]?.trim() || '?'}
                    </div>
                  )}
                  <span className="text-[10px] font-medium text-cyan-300/90 mt-0.5 uppercase tracking-wide">
                    Tu Pokémon
                  </span>
                  {pokeData?.types && pokeData.types.length > 0 ? (
                    <div className="flex flex-wrap gap-0.5 justify-center mt-1">
                      {pokeData.types.map((t) => (
                        <span
                          key={t}
                          className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold ${TYPE_COLORS[t] || 'bg-slate-500'}`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : ourActiveId ? (
                    <span className="text-[9px] text-slate-500 mt-0.5">Tipos: …</span>
                  ) : null}
                </div>
                {battleSummary?.ourTeam?.length > 0 && (
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Equipo</p>
                    <div className="flex flex-wrap gap-1">
                      {battleSummary.ourTeam.slice(0, 6).map((p) => (
                        <span
                          key={p.ident}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 border border-slate-600/50"
                          title={p.details}
                        >
                          {(p.details || '').split(',')[0].trim() || p.ident}
                        </span>
                      ))}
                    </div>
                    {battleSummary?.ourMoves?.length > 0 && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        Movimientos: {battleSummary.ourMoves.join(', ')}
                      </p>
                    )}
                  </div>
                )}
                <div className="shrink-0 flex flex-col items-center">
                  {battleSummary?.opponentActive ? (
                    <>
                      {opponentPokeData?.sprite ? (
                        <img
                          src={opponentPokeData.sprite}
                          alt={battleSummary.opponentActive.details || 'Rival'}
                          className="h-14 w-14 object-contain drop-shadow-[0_0_6px_rgba(255,100,100,.25)]"
                        />
                      ) : (
                        <div
                          className="h-14 w-14 rounded-lg bg-slate-700/80 border border-red-500/30 flex items-center justify-center text-slate-400 text-[10px] font-medium"
                          title={opponentSpeciesId ? 'Cargando…' : 'Rival'}
                        >
                          {battleSummary.opponentActive.details?.split(',')[0]?.trim() || '?'}
                        </div>
                      )}
                      <span className="text-[10px] font-medium text-red-300/90 mt-0.5 uppercase tracking-wide">
                        Rival
                      </span>
                      {opponentPokeData?.types && opponentPokeData.types.length > 0 ? (
                        <div className="flex flex-wrap gap-0.5 justify-center mt-1">
                          {opponentPokeData.types.map((t) => (
                            <span
                              key={t}
                              className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold ${TYPE_COLORS[t] || 'bg-slate-500'}`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : opponentSpeciesId ? (
                        <span className="text-[9px] text-slate-500 mt-0.5">Tipos: …</span>
                      ) : null}
                      {(battleSummary?.opponentMoves?.length ?? 0) > 0 && (
                        <p className="text-[9px] text-slate-500 mt-1 text-center max-w-[80px]">
                          Vistos: {battleSummary.opponentMoves.join(', ')}
                        </p>
                      )}
                      {(() => {
                        const weak = getWeaknesses(opponentPokeData?.types);
                        if (weak.length === 0) return null;
                        return (
                          <div className="mt-1">
                            <p className="text-[8px] text-amber-400/90 uppercase tracking-wide mb-0.5">Débil contra</p>
                            <div className="flex flex-wrap gap-0.5 justify-center">
                              {weak.map((t) => (
                                <span
                                  key={t}
                                  className={`text-[8px] px-1 py-0.5 rounded text-white font-bold ${TYPE_COLORS[t] || 'bg-slate-500'}`}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <div className="h-14 w-14 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-500 text-xs">
                        VS
                      </div>
                      <span className="text-[10px] text-slate-500 mt-0.5">Rival</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Body: Sugerencia / Por qué */}
          <div className="min-h-[72px] px-4 py-3">
            {loading && provider !== 'solo-datos' && (
              <div className="flex items-center gap-2 text-slate-400">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="inline-block h-4 w-4 rounded-full border-2 border-cyan-500/50 border-t-cyan-400"
                />
                Analizando batalla...
              </div>
            )}
            {loading && provider === 'solo-datos' && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">Cargando datos...</div>
            )}
            {error && !loading && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            {suggestion && !loading && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-2"
              >
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-cyan-400/90 font-semibold mb-0.5">
                    Sugerencia
                  </p>
                  <p className="text-sm font-medium text-cyan-200">
                    {suggestionLine || suggestion}
                  </p>
                </div>
                {whyLine && (
                  <div className="rounded-lg border border-slate-600/50 bg-slate-800/40 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                      Por qué
                    </p>
                    <p className="text-sm text-slate-300 leading-snug">
                      {whyLine}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
            {!suggestion && !loading && !error && (
              <p className="text-sm text-slate-500">
                {provider === 'solo-datos' && (battleSummary?.ourActive || battleSummary?.opponentActive)
                  ? 'Modo solo datos — sin sugerencia de IA.'
                  : 'Esperando tu turno en la batalla...'}
              </p>
            )}
          </div>

          {/* Footer: desarrollador + GitHub */}
          <div className="flex items-center justify-center gap-2 border-t border-cyan-500/20 bg-slate-900/60 px-3 py-2">
            <a
              href="https://github.com/NyoWynn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition"
              title="GitHub — NyoWynn"
            >
              {typeof chrome !== 'undefined' && chrome.runtime?.getURL ? (
                <img
                  src={chrome.runtime.getURL('wynnDevLogo.png')}
                  alt="WynnDev"
                  className="h-6 w-auto object-contain opacity-90 hover:opacity-100"
                />
              ) : (
                <span className="text-xs font-medium">WynnDev</span>
              )}
              <svg
                className="h-5 w-5 shrink-0 text-slate-500"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </motion.div>
    </>
  );
}

export { BattleOverlay };
