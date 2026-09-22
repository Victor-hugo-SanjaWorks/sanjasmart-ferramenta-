/**
 * Aplica nome, logo, hero e tema a partir de /api/ui-flags.
 * Clones nao ficam presos no branding hardcode da Tilit.
 */
(function () {
  function base() {
    return typeof window.APP_BASE === 'string' ? window.APP_BASE.replace(/\/$/, '') : '';
  }
  function api(path) {
    return base() + path;
  }
  function absUrl(u) {
    if (!u) return '';
    if (u.charAt(0) === '/') return base() + u;
    return u;
  }

  function aplicar(b) {
    if (!b) return;
    if (b.base_path) window.APP_BASE = b.base_path;

    var nome = b.nome || 'Painel IA';
    var logo = b.logo || '';
    var hero = b.hero || '';
    var fundo = b.fundo || '';
    var tema = (b.tema || 'default').toLowerCase();

    document.title = nome + ' — Painel';
    document.body.classList.toggle('tema-glass', tema === 'glass');

    if (fundo) {
      var bgUrl = 'url("' + absUrl(fundo).replace(/"/g, '%22') + '")';
      document.documentElement.style.setProperty('--app-bg-url', bgUrl);
      document.body.classList.add('tem-fundo');
    } else {
      document.documentElement.style.removeProperty('--app-bg-url');
      document.body.classList.remove('tem-fundo');
    }

    var sub = document.getElementById('app-nome');
    if (sub) sub.textContent = nome;
    document.querySelectorAll('[data-brand-nome]').forEach(function (el) {
      el.textContent = nome;
    });
    var brandText = document.querySelector('.sidebar-brand-text');
    if (brandText) brandText.textContent = nome;
    var brandSub = document.querySelector('.sidebar-brand-sub');
    if (brandSub) brandSub.textContent = 'Assistente de IA';

    var wrap = document.getElementById('app-logo-wrap');
    var img = document.getElementById('app-logo');
    if (!img) img = document.querySelector('.sidebar-logo img');
    if (!wrap) wrap = document.querySelector('.sidebar-logo');
    if (wrap && img) {
      if (logo) {
        wrap.hidden = false;
        wrap.title = nome;
        img.style.display = ''; /* limpa display:none teimoso de um onerror anterior */
        img.src = absUrl(logo);
        img.alt = nome;
      } else {
        wrap.hidden = true;
        wrap.title = nome;
        img.removeAttribute('src');
        img.alt = '';
        img.style.display = 'none';
      }
    }

    /* Favicon da aba = logo do cliente; sem logo, segue vazio (nunca a Tilit). */
    if (logo) {
      var favUrl = absUrl(logo);
      ['app-favicon', 'app-touch-icon'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.href = favUrl;
      });
    }

    var dash = document.getElementById('dash-sub');
    if (dash) dash.textContent = 'Console do assistente — ' + nome;

    var cwFrame = document.getElementById('chatwoot-frame');
    if (cwFrame) cwFrame.title = 'Conversas — ' + nome;

    var heroEl = document.getElementById('app-hero');
    var main = document.querySelector('.main-content');
    var caption = document.getElementById('app-hero-caption');
    if (hero) {
      var cssUrl = 'url("' + absUrl(hero).replace(/"/g, '%22') + '")';
      document.documentElement.style.setProperty('--app-hero-url', cssUrl);
      if (heroEl) {
        heroEl.classList.add('tem-hero');
        heroEl.style.backgroundImage = cssUrl;
      }
      if (main) main.classList.add('has-hero');
      if (caption) {
        caption.textContent = nome;
        var sub = document.createElement('small');
        sub.textContent = 'Assistente de IA';
        caption.appendChild(sub);
      }
    } else if (tema === 'glass') {
      /* glass sem hero ainda usa fundo escuro solido */
      document.documentElement.style.removeProperty('--app-hero-url');
    }
  }

  fetch(api('/api/ui-flags'), { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      window.__UI_FLAGS__ = Object.assign({}, window.__UI_FLAGS__ || {}, d || {});
      aplicar(d && d.branding);
    })
    .catch(function () { /* HTML estatico */ });
})();
