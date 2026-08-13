/**
 * Bootstrap path no hub ia.sanjaworks.com/{slug}.
 * Define APP_BASE, <base href> e prefixa fetch/EventSource.
 * Carregar ANTES de qualquer script/CSS absoluto.
 */
(function () {
  var hub = location.hostname === 'ia.sanjaworks.com';
  var base = '';
  if (hub) {
    var m = (location.pathname || '/').match(/^\/([a-z0-9-]+)/i);
    if (m && m[1].toLowerCase() !== 'admin') {
      base = '/' + m[1].toLowerCase();
    }
  }
  window.APP_BASE = base;

  if (base && document.head) {
    var el = document.createElement('base');
    el.href = base + '/';
    document.head.insertBefore(el, document.head.firstChild);
  }

  function pref(u) {
    if (!base || typeof u !== 'string') return u;
    if (u.charAt(0) !== '/') return u;
    if (u === base || u.indexOf(base + '/') === 0) return u;
    return base + u;
  }

  var _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === 'string') input = pref(input);
    return _fetch(input, init);
  };

  var ES = window.EventSource;
  if (ES) {
    window.EventSource = function (url, opts) {
      return new ES(pref(url), opts);
    };
    window.EventSource.prototype = ES.prototype;
  }
})();
