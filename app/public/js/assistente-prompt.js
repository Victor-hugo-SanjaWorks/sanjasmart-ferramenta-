/**
 * Assistente: atualiza a "Atividade recente" logo após uma ação (antes só a cada 5 min).
 * Prompt: monta o sumário de seções ao lado do editor, sem alterar o texto.
 */
(function () {
  var original = window.fetch;
  var agendado;
  window.fetch = function (entrada, opcoes) {
    var resposta = original.apply(this, arguments);
    var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
    var metodo = ((opcoes && opcoes.method) || 'GET').toUpperCase();
    if (metodo !== 'GET' && /\/api\/ia\/(pausa|notificacao)/.test(url)) {
      resposta.then(function () {
        clearTimeout(agendado);
        agendado = setTimeout(function () { if (window.carregarDashboardViz) window.carregarDashboardViz(); }, 700);
      }, function () {});
    }
    return resposta;
  };

  var editor = document.getElementById('prompt-editor');
  var lista = document.getElementById('prompt-sumario-lista');
  if (!editor || !lista) return;
  var vazio = document.querySelector('.prompt-sumario-vazio');
  var assinatura = '';

  /* Entram as seções do editor e as linhas escritas como título ("# Assim"). */
  function titulos() {
    return Array.prototype.slice.call(editor.querySelectorAll('.pl')).map(function (linha) {
      var secao = linha.querySelector('.pl-titulo');
      if (secao) return { el: linha, texto: secao.textContent.trim(), nivel: Number(linha.dataset.nivel) || 1 };
      var m = linha.textContent.match(/^(#{1,3})\s+(.+)$/);
      return m ? { el: linha, texto: m[2].trim(), nivel: m[1].length } : null;
    }).filter(function (t) { return t && t.texto; });
  }

  function montar() {
    var itens = titulos();
    var nova = itens.map(function (t) { return t.nivel + t.texto; }).join('\n');
    if (nova === assinatura && lista.childElementCount === itens.length) return;
    assinatura = nova;
    vazio.hidden = itens.length > 0;
    lista.textContent = '';
    itens.forEach(function (t, i) {
      var item = document.createElement('li');
      var botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'prompt-sumario-item nivel-' + t.nivel;
      botao.textContent = t.texto;
      botao.addEventListener('click', function () {
        var alvo = titulos()[i];
        if (alvo) alvo.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      item.appendChild(botao);
      lista.appendChild(item);
    });
  }

  var espera;
  new MutationObserver(function () { clearTimeout(espera); espera = setTimeout(montar, 250); })
    .observe(editor, { childList: true, subtree: true, characterData: true });
  montar();
})();
