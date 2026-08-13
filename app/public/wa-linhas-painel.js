(function () {
  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function formatarTelefoneBrDisplay(tel) {
    var d = String(tel || '').replace(/\D/g, '');
    if (d.length >= 12 && d.startsWith('55')) {
      var n = d.slice(2);
      if (n.length === 11) return '+55 (' + n.slice(0,2) + ') ' + n.slice(2,7) + '-' + n.slice(7);
      if (n.length === 10) return '+55 (' + n.slice(0,2) + ') ' + n.slice(2,6) + '-' + n.slice(6);
    }
    return tel || '—';
  }
  function setBadgeLite(klass, text, telefone) {
    if (klass === 'open') window.__waConnected = true;
    else window.__waConnected = false;
    var b = document.getElementById('instance-badge');
    if (b) { b.className = 'badge ' + klass; b.textContent = text; }
    var hero = document.getElementById('hero-wa-state');
    if (hero) hero.textContent = klass === 'open' ? 'Conectado' : klass === 'closed' ? 'Desconectado' : 'Indisponível';
    var pill = document.getElementById('dash-text-whatsapp');
    var dot = document.getElementById('dash-dot-whatsapp');
    if (pill) {
      pill.textContent = (klass === 'open' && telefone)
        ? ('WhatsApp: ' + formatarTelefoneBrDisplay(telefone))
        : ('WhatsApp: ' + text);
    }
    if (dot) dot.className = 'dash-pill-dot ' + (klass === 'open' ? 'ok' : klass === 'closed' ? 'off' : 'wait');
    var num = document.getElementById('connected-number');
    if (num && telefone) num.textContent = formatarTelefoneBrDisplay(telefone);
  }
  function aplicarLinhasWhatsapp(data) {
    var linhas = data.linhas || [];
    var conectados = data.conectados || 0;
    var total = linhas.length || 1;
    var comIa = linhas.filter(function (l) { return l.temLicencaIa; });
    var on = comIa.filter(function (l) { return !l.iaPausadaLinha; });
    var destaque = on[0] || comIa[0] || linhas[0];
    setBadgeLite(
      conectados > 0 ? 'open' : 'closed',
      conectados > 0 ? (conectados > 1 ? conectados + ' conectados' : 'Conectado') : 'Desconectado',
      destaque && destaque.telefone
    );
    var cnt = document.getElementById('wa-conectados-count');
    if (cnt) cnt.textContent = conectados + ' / ' + total;
    var resumo = document.getElementById('wa-linhas-resumo');
    if (resumo) {
      if (!linhas.length) resumo.textContent = 'Nenhuma linha cadastrada.';
      else {
        resumo.innerHTML = linhas.map(function (l) {
          var tel = l.telefone ? formatarTelefoneBrDisplay(l.telefone) : l.label;
          var st = l.connected ? 'conectado' : 'desconectado';
          var ia = l.temLicencaIa ? (l.iaPausadaLinha ? ' · plano IA (pausada)' : ' · plano IA') : ' · sem IA';
          var prin = l.principal ? ' · principal' : '';
          return '<div><strong>' + escapeHtml(tel) + '</strong> — ' + st + ia + prin + '</div>';
        }).join('');
      }
    }
    var box = document.getElementById('wa-linhas-toggles');
    if (box) {
      if (comIa.length > 1) {
        box.innerHTML = comIa.map(function (l) {
          var tel = l.telefone ? formatarTelefoneBrDisplay(l.telefone) : l.label;
          var checked = !l.iaPausadaLinha;
          var id = 'wa-ia-' + String(l.nome).replace(/[^a-zA-Z0-9_-]/g, '_');
          return '<div class="wa-linha-row"><div class="wa-linha-meta"><strong>' + escapeHtml(tel) + '</strong>'
            + '<span>' + (l.connected ? 'conectado' : 'off') + ' · ' + escapeHtml(l.label) + '</span></div>'
            + '<label style="display:flex;gap:6px;align-items:center;font-size:12px;">'
            + '<input type="checkbox" data-wa-ia="1" data-instance="' + escapeHtml(l.nome) + '"' + (checked ? ' checked' : '') + '>'
            + (checked ? 'IA on' : 'IA off') + '</label></div>';
        }).join('');
        box.querySelectorAll('input[data-wa-ia]').forEach(function (el) {
          el.addEventListener('change', function () {
            fetch('/api/ia/pausa-linha', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instance: el.getAttribute('data-instance'), pausar: !el.checked }),
            }).finally(carregar);
          });
        });
      } else box.innerHTML = '';
    }
    var lu = document.getElementById('last-update');
    if (lu) lu.textContent = new Date().toLocaleString('pt-BR');
  }
  function carregar() {
    fetch('/api/whatsapp/linhas', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) { if (data && data.ok) aplicarLinhasWhatsapp(data); })
      .catch(function () {
        return fetch('/api/whatsapp/status', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            setBadgeLite(data.connected ? 'open' : 'closed', data.connected ? 'Conectado' : 'Desconectado', data.telefone);
            var cnt = document.getElementById('wa-conectados-count');
            if (cnt) cnt.textContent = data.connected ? '1 / 1' : '0 / 1';
          });
      });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', carregar);
  else carregar();
  setInterval(carregar, 30000);
})();
