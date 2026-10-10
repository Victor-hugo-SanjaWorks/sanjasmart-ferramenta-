/**
 * Persiste a aba ativa do painel (URL ?aba= + localStorage).
 * Refresh / voltar do browser reabre a mesma tela sem perder o fluxo SPA.
 */
(function (global) {
  var VIEWS = [
    'assistente',
    'prompt',
    'conversas',
    'crm',
    'dashboard',
    'calendario',
    'campanhas',
    'proativos',
    'precos',
  ];

  function storageKey() {
    var base = String(global.APP_BASE || '').replace(/\//g, '_') || 'root';
    return 'tilit_aba_ativa:' + base;
  }

  function validar(v) {
    v = String(v || '').trim().toLowerCase();
    return VIEWS.indexOf(v) >= 0 ? v : null;
  }

  function lerDaUrl() {
    try {
      var q = new URLSearchParams(global.location.search);
      var fromQ = validar(q.get('aba'));
      if (fromQ) return fromQ;
      var h = String(global.location.hash || '').replace(/^#\/?/, '').trim().toLowerCase();
      return validar(h.split(/[?/]/)[0]);
    } catch (_) {
      return null;
    }
  }

  function lerStorage() {
    try {
      return validar(global.localStorage.getItem(storageKey()));
    } catch (_) {
      return null;
    }
  }

  function salvar(view) {
    view = validar(view);
    if (!view) return;
    try {
      global.localStorage.setItem(storageKey(), view);
    } catch (_) { /* private mode */ }
    try {
      var url = new URL(global.location.href);
      if (url.searchParams.get('aba') === view && !url.hash) return;
      url.searchParams.set('aba', view);
      // Evita conflito sticky ?aba=prompt#conversas
      url.hash = '';
      global.history.replaceState(
        { aba: view },
        '',
        url.pathname + url.search,
      );
    } catch (_) { /* ignore */ }
  }

  /** Prioridade: URL > storage > default. */
  function resolver(fallback) {
    return lerDaUrl() || lerStorage() || validar(fallback) || 'assistente';
  }

  function abaAtualNoDom() {
    var ativo = document.querySelector('.nav-item.active[data-view]');
    return ativo ? validar(ativo.getAttribute('data-view')) : null;
  }

  global.AbaRota = {
    validar: validar,
    salvar: salvar,
    resolver: resolver,
    lerDaUrl: lerDaUrl,
    abaAtualNoDom: abaAtualNoDom,
  };
})(window);
