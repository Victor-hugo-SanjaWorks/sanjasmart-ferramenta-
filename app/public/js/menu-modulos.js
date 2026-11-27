/**
 * Menu superior por módulos. Os botões .nav-item continuam sendo a fonte da verdade
 * (switchView marca .active e as permissões usam style.display); aqui só refletimos:
 * mostra as telas do módulo aberto e esconde módulo sem tela liberada.
 */
(function () {
  var telas = Array.prototype.slice.call(document.querySelectorAll('.telas .nav-item'));
  var modulos = Array.prototype.slice.call(document.querySelectorAll('.modulos .modulo'));
  var faixa = document.querySelector('.telas');
  var conta = document.querySelector('details.conta');

  function liberada(b) { return b.style.display !== 'none'; }
  function doModulo(m) { return telas.filter(function (b) { return b.dataset.modulo === m && liberada(b); }); }

  function sincronizar() {
    var ativa = telas.filter(function (b) { return b.classList.contains('active'); })[0];
    var atual = ativa ? ativa.dataset.modulo : 'assistente';
    telas.forEach(function (b) { b.classList.toggle('fora-do-modulo', b.dataset.modulo !== atual); });
    modulos.forEach(function (m) {
      var ligado = m.dataset.modulo === atual;
      m.classList.toggle('ativo', ligado);
      m.setAttribute('aria-current', ligado ? 'true' : 'false');
      m.hidden = !doModulo(m.dataset.modulo).length;
    });
    faixa.hidden = doModulo(atual).length < 2;
  }

  modulos.forEach(function (m) {
    m.addEventListener('click', function () {
      var primeira = doModulo(m.dataset.modulo)[0];
      if (primeira) window.switchView(primeira.dataset.view);
    });
  });

  var observador = new MutationObserver(function (lista) {
    // fora-do-modulo é alterada aqui mesmo; toggle sem mudança não gera novo ciclo
    if (lista.length) sincronizar();
  });
  telas.forEach(function (b) { observador.observe(b, { attributes: true, attributeFilter: ['class', 'style'] }); });

  /* Menu da conta: fecha ao clicar fora, no Esc ou ao escolher um item. */
  document.addEventListener('click', function (e) {
    if (conta.open && (!conta.contains(e.target) || e.target.closest('.menu-flutuante'))) conta.open = false;
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') conta.open = false; });

  /* Nome e e-mail do usuário: o painel já os escreve no cabeçalho do Assistente. */
  var saudacao = document.getElementById('dash-greeting');
  var sub = document.getElementById('dash-sub');
  function usuario() {
    var nome = ((saudacao && saudacao.textContent.match(/^Olá, (.+)!$/)) || [])[1];
    if (!nome) return;
    document.getElementById('conta-nome').textContent = nome;
    document.getElementById('conta-email').textContent = sub && sub.textContent.indexOf('@') > 0 ? sub.textContent : '';
    document.getElementById('conta-avatar').textContent = nome.split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
  }
  [saudacao, sub].forEach(function (el) {
    if (el) new MutationObserver(usuario).observe(el, { childList: true, characterData: true, subtree: true });
  });

  sincronizar();
  usuario();
})();
