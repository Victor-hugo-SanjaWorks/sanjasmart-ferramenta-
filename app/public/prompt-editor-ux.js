/**
 * Editor de prompt = texto corrido interpretado ao vivo.
 *
 * Regras:
 * - TUDO é texto livre. Não existe "campo".
 * - Seção é só pintura: as linhas entre
 *     ~abertura da seção: Título~  e  ~fim da seção: Título~
 *   ganham fundo colorido. Apagou a linha do marcador, a pintura some.
 * - Formatação inline padrão WhatsApp: *negrito* _itálico_ ~tachado~ ```mono```
 *
 * Fonte de verdade = texto. O HTML é sempre derivado dele.
 */
(function () {
  var LS_FONT = 'tea_prompt_font_size';
  var LS_REGUA = 'tea_prompt_regua';
  var LS_LEGEND = 'tea_prompt_legend';
  var LS_COLLAPSE = 'tea_prompt_sec_collapse';
  var LS_AUTO_FECHAR = 'tea_prompt_auto_fechar_secoes';
  var boundEditor = null;
  var renderTimer = null;
  var renderizando = false;
  var salvarColapsoTimer = null;

  function editor() {
    return document.getElementById('prompt-editor');
  }

  function markup() {
    return window.teaPromptMarkup || null;
  }

  /* ---------------------------------------------------------------- texto */

  function escaparHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var RE_ABERTURA = /^\s*~abertura da seção:\s*([^~]*?)~\s*$/i;
  var RE_FIM = /^\s*~fim da seção:\s*([^~]*?)~\s*$/i;

  function inlineParaHtml(linha) {
    var m = markup();
    if (m && m.inlineWhatsappParaHtml) return m.inlineWhatsappParaHtml(linha);
    var s = escaparHtml(linha);
    s = s.replace(/```([^`]+?)```/g, '<code>$1</code>');
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<strong>$2</strong>');
    s = s.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, '$1<em>$2</em>');
    s = s.replace(/~(?!(?:abertura|fim) da seção:)([^~\n]+?)~/gi, '<s>$1</s>');
    return s;
  }

  /**
   * Sempre sobra uma linha vazia no fim, fora de qualquer seção: é onde o
   * usuário clica para continuar escrevendo sem cair dentro da última seção.
   */
  function garantirLinhaFinal(texto) {
    var t = String(texto == null ? '' : texto).replace(/\r\n/g, '\n');
    var linhas = t.split('\n');
    if (String(linhas[linhas.length - 1] || '').trim() !== '') linhas.push('');
    return linhas.join('\n');
  }

  /** Texto → HTML: uma div por linha; seções envolvem um range de linhas. */
  function textoParaHtml(textoBruto) {
    var texto = garantirLinhaFinal(textoBruto);
    var m = markup();
    if (m && m.textoParaHtmlEditor) return m.textoParaHtmlEditor(texto);
    var linhas = String(texto == null ? '' : texto).replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var aberta = false;

    function linhaHtml(l, classe) {
      var conteudo = l ? inlineParaHtml(l) : '<br>';
      return '<div class="pl' + (classe ? ' ' + classe : '') + '">' + conteudo + '</div>';
    }

    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i];
      var mA = l.match(RE_ABERTURA);
      var mF = l.match(RE_FIM);

      if (mA) {
        if (aberta) out.push('</div>');
        out.push('<div class="prompt-sec">');
        aberta = true;
        out.push(linhaHtml(l, 'pl-marca pl-marca-abre'));
        continue;
      }
      if (mF) {
        out.push(linhaHtml(l, 'pl-marca pl-marca-fecha'));
        if (aberta) {
          out.push('</div>');
          aberta = false;
        }
        continue;
      }
      out.push(linhaHtml(l, aberta ? 'pl-dentro' : ''));
    }
    if (aberta) out.push('</div>');
    if (!out.length) out.push('<div class="pl"><br></div>');
    return out.join('');
  }

  var MARCA_TAG = {
    STRONG: '*',
    B: '*',
    EM: '_',
    I: '_',
    U: '_',
    S: '~',
    STRIKE: '~',
    DEL: '~',
    CODE: '```',
  };

  /**
   * HTML do editor → texto. Percorre o DOM porque o contenteditable inventa
   * divs sem classe quando o usuário aperta Enter.
   */
  function htmlParaTexto(root) {
    if (!root) return '';
    var linhas = [];

    function novaLinha() {
      linhas.push('');
    }
    function add(s) {
      if (!linhas.length) novaLinha();
      linhas[linhas.length - 1] += s;
    }

    function walk(node) {
      if (node.nodeType === 3) {
        add(node.textContent.replace(/\u00a0/g, ' '));
        return;
      }
      if (node.nodeType !== 1) return;
      var tag = node.nodeName;

      if (tag === 'BR') {
        // <br> sozinho num bloco só marca a linha vazia que o bloco já criou
        var sozinho = node.parentNode && node.parentNode.childNodes.length === 1;
        if (!sozinho) novaLinha();
        return;
      }

      var marca = MARCA_TAG[tag];
      if (marca) {
        add(marca);
        for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
        add(marca);
        return;
      }

      if (node.classList && node.classList.contains('pl-tool')) {
        add((node.getAttribute('data-token') || node.textContent || '').replace(/\u00a0/g, ' '));
        return;
      }

      // Botão ▾/▸ não faz parte do texto do prompt
      if (tag === 'BUTTON' || (node.classList && node.classList.contains('pl-fold'))) {
        return;
      }

      // Abertura: reconstrói com cor de data-sec-cor (não aparece no título visível)
      if (node.classList && node.classList.contains('pl-marca-abre')) {
        novaLinha();
        var secCor = node.closest ? node.closest('.prompt-sec') : null;
        var corSec = secCor && secCor.getAttribute('data-sec-cor');
        var titEl = node.querySelector('.pl-titulo');
        var titVis = titEl ? String(titEl.textContent || '').replace(/\u00a0/g, ' ').trim() : '';
        var titOut = corSec ? titVis + ' [' + corSec + ']' : titVis;
        add('~abertura da seção: ' + titOut + '~');
        return;
      }

      var cor = node.getAttribute && node.getAttribute('data-cor');
      var tam = node.getAttribute && node.getAttribute('data-tam');
      if (cor || tam) {
        // data-ab/data-fe = ponta que o render inventou para pintar linhas
        // seguidas; ela não pertence ao texto do usuário.
        var abre = cor ? '{cor:' + cor + '}' : '{tam:' + tam + '}';
        var fecha = cor ? '{/cor}' : '{/tam}';
        if (!node.getAttribute('data-ab')) add(abre);
        for (var c = 0; c < node.childNodes.length; c++) walk(node.childNodes[c]);
        if (!node.getAttribute('data-fe')) add(fecha);
        return;
      }

      var wrapper = node.classList && node.classList.contains('prompt-sec');
      var bloco = tag === 'DIV' || tag === 'P' || tag === 'LI' || /^H[1-6]$/.test(tag);
      if (bloco && !wrapper) novaLinha();
      for (var j = 0; j < node.childNodes.length; j++) walk(node.childNodes[j]);
    }

    for (var k = 0; k < root.childNodes.length; k++) walk(root.childNodes[k]);
    // Não apagar linhas vazias (topo ou fim) — Enter depende disso.
    return linhas.join('\n');
  }

  function textoAtual() {
    return htmlParaTexto(editor());
  }

  /* ---------------------------------------------------------------- caret */

  /** Caret dentro do span colorido do título da seção (.pl-titulo). */
  function caretEmTituloSecao() {
    var el = editor();
    if (!el) return null;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.anchorNode || !el.contains(sel.anchorNode)) return null;
    var n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    if (!n || !n.closest) return null;
    var tit = n.closest('.pl-titulo');
    return tit && el.contains(tit) ? tit : null;
  }

  /**
   * Fecha a edição do título: título vazio → "Nova seção"; ~fim~ acompanha a abertura
   * (repararParesSecao já reescreve o fim com o título da abertura).
   */
  function confirmarEdicaoTituloSecao() {
    var el = editor();
    if (!el || renderizando) return;
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }
    var bruto = htmlParaTexto(el);
    var texto = repararParesSecao(bruto, { fecharNoFim: false });
    var html = textoParaHtml(texto);
    if (html === el.innerHTML) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    renderizando = true;
    preservandoScroll(function () {
      preservandoColapso(function () {
        el.innerHTML = html;
      });
    });
    renderizando = false;
    atualizarNumerosLinha();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function posicaoCaret(root) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var node = sel.anchorNode;
    if (!node || !root.contains(node)) return null;
    var elNode = node.nodeType === 1 ? node : node.parentElement;
    var linha = elNode && elNode.closest ? elNode.closest('.pl') : null;
    if (!linha) return null;
    var linhas = Array.prototype.slice.call(root.querySelectorAll('.pl'));
    var idx = linhas.indexOf(linha);
    if (idx < 0) return null;

    var range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(linha);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return {
      linha: idx,
      offset: range.toString().length,
      tamanho: linha.textContent.length,
    };
  }

  function aplicarRange(sel, range) {
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function restaurarCaret(root, pos) {
    if (!pos) return;
    var linhas = root.querySelectorAll('.pl');
    if (!linhas.length) return;
    var alvo = linhas[Math.min(pos.linha, linhas.length - 1)];
    if (!alvo) return;

    // Quando *isto* vira negrito, os asteriscos somem: o caret precisa andar
    // para trás o tanto que a linha encolheu, senão ele fica preso na marcação.
    var encolheu = Math.max(0, (pos.tamanho || 0) - alvo.textContent.length);
    var restante = Math.max(0, Math.min(pos.offset - encolheu, alvo.textContent.length));

    var sel = window.getSelection();
    var range = document.createRange();
    var fimDaLinha = function () {
      range.setStart(alvo, alvo.childNodes.length);
      aplicarRange(sel, range);
    };

    var walker = document.createTreeWalker(alvo, NodeFilter.SHOW_TEXT, null);
    var node = walker.nextNode();
    if (!node) {
      fimDaLinha();
      return;
    }
    while (node) {
      var len = node.textContent.length;
      if (restante < len) {
        range.setStart(node, restante);
        aplicarRange(sel, range);
        return;
      }
      if (restante === len) {
        // no limite de um <strong>/<em>: cai no nó seguinte para continuar
        // digitando texto normal
        var vizinho = walker.nextNode();
        if (vizinho) range.setStart(vizinho, 0);
        else {
          fimDaLinha();
          return;
        }
        aplicarRange(sel, range);
        return;
      }
      restante -= len;
      var prox = walker.nextNode();
      if (!prox) {
        fimDaLinha();
        return;
      }
      node = prox;
    }
  }

  /* --------------------------------------------------------------- render */

  /**
   * Trocar o innerHTML inteiro zera o scroll do editor e dos painéis acima —
   * era isso que fazia a tela "subir" a cada Enter. Guarda e devolve a posição.
   */
  function preservandoScroll(fn) {
    var el = editor();
    var alvos = [];
    for (var n = el; n; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1) alvos.push([n, n.scrollTop, n.scrollLeft]);
    }
    var doc = document.scrollingElement || document.documentElement;
    var pageY = window.pageYOffset || (doc && doc.scrollTop) || 0;
    var pageX = window.pageXOffset || (doc && doc.scrollLeft) || 0;

    fn();

    for (var i = 0; i < alvos.length; i++) {
      alvos[i][0].scrollTop = alvos[i][1];
      alvos[i][0].scrollLeft = alvos[i][2];
    }
    if (window.scrollTo) window.scrollTo(pageX, pageY);
  }

  /**
   * Identidade estável da seção entre renders: títulos da raiz até ela, mais a
   * ordem entre irmãs de mesmo título. Editar o corpo não muda a chave.
   */
  function chaveSecao(sec, contagem) {
    var partes = [];
    for (var n = sec; n && n.classList; n = n.parentElement) {
      if (!n.classList.contains('prompt-sec')) continue;
      var marca = n.querySelector(':scope > .pl-marca-abre');
      var titEl = marca && marca.querySelector('.pl-titulo');
      var titulo = titEl
        ? titEl.textContent
        : marca
          ? marca.textContent
          : '';
      partes.unshift(String(titulo).replace(/\s+/g, ' ').trim());
    }
    var base = partes.join(' / ');
    var vezes = (contagem[base] = (contagem[base] || 0) + 1);
    return base + '#' + vezes;
  }

  /** Enter recriava o HTML e reabria tudo: guarda e devolve quem estava recolhida. */
  function preservandoColapso(fn) {
    var el = editor();
    if (!el) return fn();
    var antes = {};
    var contagem = {};
    var secoes = el.querySelectorAll('.prompt-sec');
    for (var i = 0; i < secoes.length; i++) {
      var chave = chaveSecao(secoes[i], contagem);
      if (secoes[i].classList.contains('is-collapsed')) antes[chave] = true;
    }

    fn();

    var alguma = false;
    for (var k in antes) {
      if (Object.prototype.hasOwnProperty.call(antes, k)) alguma = true;
    }
    if (!alguma) return;

    var depois = el.querySelectorAll('.prompt-sec');
    var contagem2 = {};
    for (var j = 0; j < depois.length; j++) {
      if (antes[chaveSecao(depois[j], contagem2)]) depois[j].classList.add('is-collapsed');
    }
  }

  function autoFecharSecoesAtivo() {
    try {
      return localStorage.getItem(LS_AUTO_FECHAR) === '1';
    } catch (_) {
      return false;
    }
  }

  function lerMapaColapso() {
    try {
      var raw = localStorage.getItem(LS_COLLAPSE);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch (_) {
      return {};
    }
  }

  function salvarEstadoColapso() {
    var el = editor();
    if (!el) return;
    var mapa = {};
    var contagem = {};
    var secoes = el.querySelectorAll('.prompt-sec');
    for (var i = 0; i < secoes.length; i++) {
      var chave = chaveSecao(secoes[i], contagem);
      if (secoes[i].classList.contains('is-collapsed')) mapa[chave] = true;
    }
    try {
      localStorage.setItem(LS_COLLAPSE, JSON.stringify(mapa));
    } catch (_) {}
  }

  function agendarSalvarColapso() {
    if (salvarColapsoTimer) clearTimeout(salvarColapsoTimer);
    salvarColapsoTimer = setTimeout(function () {
      salvarColapsoTimer = null;
      salvarEstadoColapso();
    }, 120);
  }

  /**
   * Após F5/carga: restaura quais estavam fechadas.
   * (Auto fechar = acordeão entre irmãos ao abrir — não força tudo fechado no reload.)
   */
  function aplicarEstadoColapsoSalvo() {
    var el = editor();
    if (!el) return;
    var mapa = lerMapaColapso();
    var contagem = {};
    var secoes = el.querySelectorAll('.prompt-sec');
    for (var i = 0; i < secoes.length; i++) {
      var chave = chaveSecao(secoes[i], contagem);
      if (mapa[chave]) secoes[i].classList.add('is-collapsed');
      else secoes[i].classList.remove('is-collapsed');
    }
    atualizarNumerosLinha();
    salvarEstadoColapso();
  }

  function atualizarBotaoAutoFechar() {
    var btn = document.getElementById('prompt-auto-fechar-btn');
    if (!btn) return;
    var on = autoFecharSecoesAtivo();
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on
      ? 'Auto fechar ligado: ao abrir uma seção, as irmãs fecham (pais/avós ficam abertos). Clique para desligar.'
      : 'Auto fechar desligado. Clique para ligar o modo acordeão (só irmãos).';
  }

  function toggleAutoFecharSecoes() {
    var on = !autoFecharSecoesAtivo();
    try {
      localStorage.setItem(LS_AUTO_FECHAR, on ? '1' : '0');
    } catch (_) {}
    atualizarBotaoAutoFechar();
    return on;
  }

  /** Irmãos = .prompt-sec no mesmo pai (não sobrinhos, não ancestrais). */
  function irmaosDaSecao(sec) {
    if (!sec || !sec.parentElement) return [];
    return Array.prototype.filter.call(sec.parentElement.children, function (n) {
      return n !== sec && n.classList && n.classList.contains('prompt-sec');
    });
  }

  /**
   * Abre a seção; com Auto fechar, fecha só as irmãs.
   * Ancestrais (mães) abrem se estavam fechados — senão a filha ficaria invisível.
   * Ancestrais NÃO são fechados; sobrinhos/tios (não-irmãos) não mudam.
   */
  function abrirSecao(sec) {
    if (!sec) return;
    for (var p = sec.parentElement; p; p = p.parentElement) {
      if (p.classList && p.classList.contains('prompt-sec')) {
        p.classList.remove('is-collapsed');
      }
    }
    sec.classList.remove('is-collapsed');
    if (!autoFecharSecoesAtivo()) return;
    irmaosDaSecao(sec).forEach(function (irma) {
      irma.classList.add('is-collapsed');
    });
  }

  function toggleSecao(sec) {
    if (!sec) return;
    if (sec.classList.contains('is-collapsed')) abrirSecao(sec);
    else sec.classList.add('is-collapsed');
    atualizarNumerosLinha();
    agendarSalvarColapso();
  }

  /** Snapshot de todas as seções (abertas ou não) — usado no paste. */
  function snapshotChavesSecao() {
    var el = editor();
    var mapa = {};
    var contagem = {};
    if (!el) return mapa;
    var secoes = el.querySelectorAll('.prompt-sec');
    for (var i = 0; i < secoes.length; i++) {
      mapa[chaveSecao(secoes[i], contagem)] = true;
    }
    return mapa;
  }

  /**
   * Colar seção aberta atrapalha arrastar/localizar: seções novas no paste
   * chegam recolhidas (abre com clique no ▸).
   */
  function colapsarSecoesAposPaste(plain, chavesAntes) {
    var el = editor();
    if (!el) return;
    if (!/~abertura da seção:/i.test(String(plain || ''))) return;
    var antes = chavesAntes || {};
    var contagem = {};
    var secoes = el.querySelectorAll('.prompt-sec');
    for (var i = 0; i < secoes.length; i++) {
      var chave = chaveSecao(secoes[i], contagem);
      if (!antes[chave]) secoes[i].classList.add('is-collapsed');
    }
  }

  /**
   * Linha escondida por seção recolhida (corpo/aninhadas/~fim~ zero-height).
   * A abertura da própria seção recolhida continua visível.
   */
  function linhaOcultaPorColapso(pl) {
    if (!pl || !pl.closest) return false;
    var sec = pl.closest('.prompt-sec.is-collapsed');
    if (!sec) return false;
    if (pl.classList.contains('pl-marca-abre') && pl.parentElement === sec) return false;
    return true;
  }

  /**
   * Numeração absoluta do documento (1…N do início ao fim).
   * Seção recolhida: linhas ocultas ficam sem número; as visíveis mantêm o
   * índice real (ex.: 4, depois 8) — a contagem nunca recomeça por seção.
   * Retorna o total de linhas do texto (incluindo ocultas).
   */
  function atualizarNumerosLinha() {
    var el = editor();
    if (!el) return 0;
    var pls = el.querySelectorAll('.pl');
    for (var i = 0; i < pls.length; i++) {
      var pl = pls[i];
      var abs = i + 1;
      if (linhaOcultaPorColapso(pl)) {
        pl.removeAttribute('data-ln');
        pl.classList.add('pl-sem-ln');
        continue;
      }
      pl.setAttribute('data-ln', String(abs));
      pl.classList.remove('pl-sem-ln');
    }
    return pls.length;
  }

  /** Rola o mínimo: só entra em ação se o caret saiu da área visível. */
  function manterCaretVisivel(el) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el) return;
    var no = sel.anchorNode;
    var alvo = no && no.nodeType === 1 ? no : no && no.parentElement;
    if (!alvo || !alvo.getBoundingClientRect) return;
    var caixa = alvo.getBoundingClientRect();
    var area = el.getBoundingClientRect();
    var margem = 8;
    if (caixa.bottom > area.bottom - margem) {
      el.scrollTop += caixa.bottom - area.bottom + margem;
    } else if (caixa.top < area.top + margem) {
      el.scrollTop -= area.top + margem - caixa.top;
    }
  }

  /**
   * Diagnóstico de paradoxos estruturais (seção + formatação).
   * Usado no blur e em testes — não reescreve sozinho.
   */
  function diagnosticarSecoes(texto) {
    var linhas = String(texto || '').replace(/\r\n/g, '\n').split('\n');
    var avisos = [];
    var pilha = [];
    var i;
    for (i = 0; i < linhas.length; i++) {
      var l = linhas[i];
      var a = l.match(RE_ABERTURA);
      var f = l.match(RE_FIM);
      if (a) {
        pilha.push({ titulo: String(a[1] || '').trim(), linha: i });
        continue;
      }
      if (f) {
        var titF = String(f[1] || '').trim();
        if (!pilha.length) {
          avisos.push({
            codigo: 'fim_sem_abertura',
            linha: i,
            detalhe: '~fim~ sem abertura: "' + titF + '"',
          });
          continue;
        }
        var topo = pilha[pilha.length - 1];
        if (
          tituloSecaoLimpo(topo.titulo).toLocaleLowerCase('pt-BR') !==
          tituloSecaoLimpo(titF).toLocaleLowerCase('pt-BR')
        ) {
          avisos.push({
            codigo: 'titulo_divergente',
            linha: i,
            detalhe:
              'Abertura "' +
              tituloSecaoLimpo(topo.titulo) +
              '" (L' +
              (topo.linha + 1) +
              ') × fim "' +
              tituloSecaoLimpo(titF) +
              '"',
          });
        }
        pilha.pop();
        continue;
      }
      // *negrito* cru dentro de linha de marcador (não deveria existir)
      if ((linhaEhAbertura(l) || linhaEhFim(l)) && /(\*[^*]+\*|_[^_]+_|~(?!abertura|fim)[^~]+~)/.test(l)) {
        avisos.push({
          codigo: 'formato_em_marcador',
          linha: i,
          detalhe: 'Formatação WhatsApp na linha de seção',
        });
      }
    }
    for (i = 0; i < pilha.length; i++) {
      avisos.push({
        codigo: 'abertura_sem_fim',
        linha: pilha[i].linha,
        detalhe: 'Sem ~fim~ para "' + pilha[i].titulo + '" — engole o que vem abaixo',
      });
    }
    // ** empilhado (toggle quebrado clássico)
    if (/\*\*[^*\n]+\*\*/.test(String(texto || ''))) {
      avisos.push({
        codigo: 'negrito_empilhado',
        detalhe: 'Há **texto** (negrito aplicado 2x). Use o botão B de novo no trecho para limpar.',
      });
    }
    return avisos;
  }

  function avisarDesbalanceamentoSePreciso() {
    var antes = textoAtual();
    var depois = repararParesSecao(antes, { fecharNoFim: true });
    if (depois !== antes) {
      var el = editor();
      var pos = posicaoCaret(el);
      renderizando = true;
      preservandoScroll(function () {
        preservandoColapso(function () {
          el.innerHTML = textoParaHtml(depois);
        });
        if (pos) restaurarCaret(el, pos);
      });
      renderizando = false;
      atualizarNumerosLinha();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function renderizar(forcar) {
    var el = editor();
    if (!el || renderizando) return;
    /* No meio da edição do título colorido: não re-render (senão volta "Nova seção"
     * e o ~fim~ deixa de casar — seção “quebra”). */
    if (!forcar && caretEmTituloSecao()) return;
    var texto = repararParesSecao(textoAtual(), { fecharNoFim: false });
    var html = textoParaHtml(texto);
    if (!forcar && html === el.innerHTML) return;
    renderizando = true;
    var pos = posicaoCaret(el);
    preservandoScroll(function () {
      preservandoColapso(function () {
        el.innerHTML = html;
      });
      if (pos && document.activeElement === el) restaurarCaret(el, pos);
    });
    renderizando = false;
    atualizarNumerosLinha();
  }

  function agendarRender() {
    if (caretEmTituloSecao()) return;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
      renderTimer = null;
      if (caretEmTituloSecao()) return;
      renderizar(false);
    }, 80);
  }

  function definirTexto(texto, opts) {
    opts = opts || {};
    var el = editor();
    if (!el) return;
    var tinhaSecao = !!el.querySelector('.prompt-sec');
    renderizando = true;
    preservandoScroll(function () {
      preservandoColapso(function () {
        el.innerHTML = textoParaHtml(repararParesSecao(texto, { fecharNoFim: true }));
      });
    });
    renderizando = false;
    // F5 / 1ª carga / reload do prompt: restaura colapso (ou auto-fecha).
    // Undo/mid-edit com seções já na tela: preservandoColapso basta.
    if (opts.restaurarColapso || !tinhaSecao) {
      aplicarEstadoColapsoSalvo();
    } else {
      atualizarNumerosLinha();
      agendarSalvarColapso();
    }
  }

  /* --------------------------------------------------------------- régua */

  var FONTE_MIN = 9;
  var FONTE_MAX = 56;

  function aplicarFonteGlobal(px) {
    var el = editor();
    if (!el) return;
    var n = Number(px);
    if (!isFinite(n) || !n) n = 15;
    n = Math.min(Math.max(Math.round(n), FONTE_MIN), FONTE_MAX);
    el.style.fontSize = n + 'px';
    el.style.lineHeight = Math.round(n * 1.6) + 'px';
    try {
      localStorage.setItem(LS_FONT, String(n));
    } catch (_) {}
    atualizarRegua();
  }

  function atualizarRegua() {
    var el = editor();
    if (!el) return;
    var on = true;
    try {
      on = localStorage.getItem(LS_REGUA) !== '0';
    } catch (_) {}
    var lh = parseInt(getComputedStyle(el).lineHeight, 10) || 24;
    el.style.setProperty('--regua-lh', lh + 'px');
    if (on) {
      el.classList.add('prompt-regua');
      // important: tema-glass e outros CSS usam background !important
      el.style.setProperty(
        'background-image',
        'repeating-linear-gradient(to bottom, transparent 0, transparent ' +
          (lh - 1) +
          'px, rgba(13,115,119,0.2) ' +
          (lh - 1) +
          'px, rgba(13,115,119,0.2) ' +
          lh +
          'px)',
        'important',
      );
      el.style.setProperty('background-attachment', 'local', 'important');
    } else {
      el.classList.remove('prompt-regua');
      el.style.removeProperty('background-image');
      el.style.removeProperty('background-attachment');
    }
    var btn = document.querySelector('.pte-btn-regua');
    if (btn) {
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on ? 'Linhas guia ligadas — clique para desligar' : 'Linhas guia desligadas — clique para ligar';
    }
  }

  /* ------------------------------------------------------ texto + caret */

  function aplicarTextoComCaret(novoTexto, linha, offset, tamanho) {
    var el = editor();
    if (!el) return;
    preservandoScroll(function () {
      definirTexto(novoTexto);
      restaurarCaret(el, { linha: linha, offset: offset || 0, tamanho: tamanho || 0 });
    });
    manterCaretVisivel(el);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Abrir o seletor de cor tira o foco do editor e o navegador descarta a
   * seleção. Guardamos a última boa para conseguir pintar depois do clique.
   */
  var selecaoSalva = null;
  var linhaSalva = null;

  function memorizarSelecao() {
    var el = editor();
    var sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    var pos = posicaoCaret(el);
    if (pos) linhaSalva = pos.linha;
    if (!sel.isCollapsed) selecaoSalva = range.cloneRange();
  }

  function selecaoParaFormatar() {
    var el = editor();
    var sel = window.getSelection();
    if (!el || !sel) return null;
    if (sel.rangeCount && !sel.isCollapsed && el.contains(sel.anchorNode)) return sel;
    if (!selecaoSalva) return null;
    try {
      el.focus();
      sel.removeAllRanges();
      sel.addRange(selecaoSalva);
    } catch (_) {
      selecaoSalva = null;
      return null;
    }
    // Um render no meio do caminho deixa o range apontando para nós mortos.
    var viva = sel.rangeCount && !sel.isCollapsed && el.contains(sel.anchorNode);
    if (!viva) selecaoSalva = null;
    return viva ? sel : null;
  }

  /* -------------------------------------------------------------- seções */

  function linhaDoCaret(root) {
    var pos = posicaoCaret(root);
    return pos ? pos.linha : null;
  }

  function linhaEhAbertura(l) {
    return /^~abertura da seção:\s*([^~]+?)~\s*$/i.test(String(l || '').trim());
  }
  function linhaEhFim(l) {
    return /^~fim da seção:\s*([^~]+?)~\s*$/i.test(String(l || '').trim());
  }

  /**
   * Nova seção = irmã (mesmo nível), não filha da de baixo.
   * Caret/seleção colapsada: troca a linha atual por abertura+corpo+fim.
   * Se a linha já é marcador, insere a nova seção DEPOIS do bloco atual.
   */
  function formatTitulo() {
    var el = editor();
    if (!el) return;
    el.focus();
    var texto = textoAtual();
    var linhas = texto.split('\n');

    var sel = window.getSelection();
    var iniLinha = null;
    var fimLinha = null;
    var titulo = '';
    var selecaoAmpla = false;

    if (sel && sel.rangeCount && !sel.isCollapsed && el.contains(sel.anchorNode)) {
      var todas = Array.prototype.slice.call(el.querySelectorAll('.pl'));
      var aEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      var fEl = sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement;
      var a = todas.indexOf(aEl && aEl.closest ? aEl.closest('.pl') : null);
      var f = todas.indexOf(fEl && fEl.closest ? fEl.closest('.pl') : null);
      if (a >= 0 && f >= 0) {
        iniLinha = Math.min(a, f);
        fimLinha = Math.max(a, f);
        selecaoAmpla = fimLinha > iniLinha;
      }
      titulo = String(sel.toString() || '').split('\n')[0].trim();
    }

    if (iniLinha == null) {
      var cur = linhaDoCaret(el);
      iniLinha = cur == null ? Math.max(0, linhas.length - 1) : cur;
      fimLinha = iniLinha;
      titulo = String(linhas[iniLinha] || '').trim();
    }

    // Não reempacotar marcadores existentes como título — usa default.
    if (linhaEhAbertura(titulo) || linhaEhFim(titulo)) {
      titulo = 'Nova seção';
    }
    if (!titulo) titulo = 'Nova seção';
    titulo = titulo.replace(/~/g, '').replace(/^(abertura|fim) da seção:\s*/i, '').trim() || 'Nova seção';

    function profundidadeIntervalo(de, ate) {
      var p = 0;
      for (var j = de; j <= ate; j++) {
        if (linhaEhAbertura(linhas[j])) p++;
        else if (linhaEhFim(linhas[j])) p--;
      }
      return p;
    }

    /**
     * Sem devolver o caret, o contenteditable volta para o começo do texto e a
     * tela pula para o topo. Deixa o cursor no corpo da seção recém-criada.
     */
    function aplicarComCaret(novoTexto, linhaAbertura) {
      aplicarTextoComCaret(novoTexto, linhaAbertura + 1, 0, 0);
    }

    function inserirIrmaApos(idxInicio) {
      var profundidade = 0;
      var i = idxInicio;
      if (linhaEhAbertura(linhas[idxInicio])) {
        profundidade = 1;
        for (i = idxInicio + 1; i < linhas.length; i++) {
          if (linhaEhAbertura(linhas[i])) profundidade++;
          else if (linhaEhFim(linhas[i])) {
            profundidade--;
            if (profundidade <= 0) break;
          }
        }
      } else if (linhaEhFim(linhas[idxInicio])) {
        i = idxInicio;
      } else {
        // Dentro de corpo: sobe até achar abertura e fecha no fim correspondente.
        var sobe = idxInicio;
        while (sobe > 0 && !linhaEhAbertura(linhas[sobe])) sobe--;
        if (linhaEhAbertura(linhas[sobe])) {
          profundidade = 1;
          for (i = sobe + 1; i < linhas.length; i++) {
            if (linhaEhAbertura(linhas[i])) profundidade++;
            else if (linhaEhFim(linhas[i])) {
              profundidade--;
              if (profundidade <= 0) break;
            }
          }
        } else {
          i = idxInicio;
        }
      }
      var insertAt = Math.min(linhas.length, i + 1);
      var bloco = [
        '~abertura da seção: ' + titulo + '~',
        '',
        '~fim da seção: ' + titulo + '~',
        '',
      ];
      var novoIrm = linhas.slice(0, insertAt).concat(bloco).concat(linhas.slice(insertAt)).join('\n');
      aplicarComCaret(novoIrm, insertAt);
    }

    // Seleção que atravessa marcadores (desbalanceada) → irmã, não engolir a de baixo.
    if (selecaoAmpla && profundidadeIntervalo(iniLinha, fimLinha) !== 0) {
      inserirIrmaApos(iniLinha);
      return;
    }

    // Caret em marcador → irmã depois do bloco.
    if (!selecaoAmpla && (linhaEhAbertura(linhas[iniLinha]) || linhaEhFim(linhas[iniLinha]))) {
      inserirIrmaApos(iniLinha);
      return;
    }

    var antes = linhas.slice(0, iniLinha);
    var meio = linhas.slice(iniLinha, fimLinha + 1);
    var depois = linhas.slice(fimLinha + 1);

    // Seleção colapsada: nunca engolir a seção de baixo no corpo.
    if (!selecaoAmpla) {
      meio = [String(linhas[iniLinha] || '')];
      depois = linhas.slice(iniLinha + 1);
    }

    var corpo =
      meio.join('\n').trim() === titulo || !String(meio.join('\n') || '').trim()
        ? ['']
        : meio;

    var novo = antes
      .concat(['~abertura da seção: ' + titulo + '~'])
      .concat(corpo)
      .concat(['~fim da seção: ' + titulo + '~', ''])
      .concat(depois)
      .join('\n');

    aplicarComCaret(novo, iniLinha);
  }

  var TAGS_DA_MARCA = {
    '*': ['STRONG', 'B'],
    _: ['EM', 'I', 'U'],
    '~': ['S', 'STRIKE', 'DEL'],
    '```': ['CODE'],
  };

  function jaEnvoltoPorMarca(txt, marca) {
    var t = String(txt || '');
    var m = String(marca || '');
    if (!m || t.length < m.length * 2) return false;
    if (!(t.slice(0, m.length) === m && t.slice(-m.length) === m)) return false;
    var miolo = t.slice(m.length, t.length - m.length);
    // evita tratar *a*b* como envolto
    return miolo.indexOf(m) === -1;
  }

  function noFormatavelDaSelecao(marca) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var tags = TAGS_DA_MARCA[marca] || [];
    if (!tags.length) return null;
    var node = sel.getRangeAt(0).commonAncestorContainer;
    var elN = node.nodeType === 1 ? node : node.parentElement;
    if (!elN || !elN.closest) return null;
    for (var i = 0; i < tags.length; i++) {
      var w = elN.closest(tags[i]);
      if (w) return w;
    }
    return null;
  }

  function selecaoTocaMarcadorOuTool() {
    var sel = window.getSelection();
    var el = editor();
    if (!sel || !sel.rangeCount || !el) return null;
    var r = sel.getRangeAt(0);
    var n = r.commonAncestorContainer;
    var elN = n.nodeType === 1 ? n : n.parentElement;
    if (!elN || !el.contains(elN)) return null;
    if (elN.closest('.pl-marca')) return 'marca';
    if (elN.closest('.pl-tool')) return 'tool';
    // seleção que atravessa vários nós
    try {
      var frag = r.cloneContents();
      if (frag.querySelector && (frag.querySelector('.pl-marca') || frag.querySelector('.pl-tool'))) {
        return frag.querySelector('.pl-marca') ? 'marca' : 'tool';
      }
    } catch (_) {}
    return null;
  }

  /**
   * Toggle WhatsApp: *negrito* _itálico_ ~tachado~ ```mono```.
   * Se já estiver formatado, REMOVE a marca (não empilha outro * *).
   */
  function envolverInline(marca) {
    var el = editor();
    if (!el) return;
    el.focus();
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;

    var toque = selecaoTocaMarcadorOuTool();
    if (toque === 'marca') {
      window.alert(
        'Não dá para aplicar formatação na linha de marcador de seção (~abertura~/~fim~).',
      );
      return;
    }
    if (toque === 'tool') {
      window.alert('Não dá para formatar um @tool — selecione só o texto ao redor.');
      return;
    }

    // ~tachado~ não pode nascer em cima de linha de seção (paradoxo com ~abertura~)
    if (marca === '~') {
      var plNodes = el.querySelectorAll('.pl');
      var aEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      var pl = aEl && aEl.closest ? aEl.closest('.pl') : null;
      if (pl && (pl.classList.contains('pl-marca') || linhaEhAbertura(pl.textContent) || linhaEhFim(pl.textContent))) {
        window.alert('Tachado (~) não pode ser usado na linha de seção.');
        return;
      }
    }

    var txt = String(sel.toString() || '');
    if (!txt) return;

    function aplicarTextoSelecionado(novo) {
      var ok = false;
      try {
        ok = document.execCommand('insertText', false, novo);
      } catch (_) {
        ok = false;
      }
      if (!ok) {
        // fallback: range.deleteContents + insert
        try {
          var range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(novo));
        } catch (_) {}
      }
      renderizar(true);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 1) Seleção já inclui as marcas tipadas (*texto*)
    if (jaEnvoltoPorMarca(txt, marca)) {
      aplicarTextoSelecionado(txt.slice(marca.length, txt.length - marca.length));
      return;
    }

    // 2) Seleção dentro de <strong>/<em>/<s> → remove formatação do trecho inteiro
    var wrap = noFormatavelDaSelecao(marca);
    if (wrap && el.contains(wrap)) {
      var plain = String(wrap.textContent || '');
      var parent = wrap.parentNode;
      if (parent) {
        var textNode = document.createTextNode(plain);
        parent.replaceChild(textNode, wrap);
        try {
          var rPlain = document.createRange();
          rPlain.setStart(textNode, 0);
          rPlain.setEnd(textNode, plain.length);
          sel.removeAllRanges();
          sel.addRange(rPlain);
        } catch (_) {}
      }
      renderizar(true);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // 3) Ainda formatado? (ex.: sel parcial) — se o miolo visual já está bold na linha-fonte
    var plLinha = (function () {
      var n = sel.anchorNode;
      var e = n && (n.nodeType === 1 ? n : n.parentElement);
      return e && e.closest ? e.closest('.pl') : null;
    })();
    if (plLinha && !plLinha.classList.contains('pl-marca')) {
      var idx = Array.prototype.indexOf.call(el.querySelectorAll('.pl'), plLinha);
      var linhas = textoAtual().split('\n');
      var fonte = String(linhas[idx] || '');
      var candidato = marca + txt + marca;
      var pos = fonte.indexOf(candidato);
      if (pos >= 0) {
        // já estava no texto-fonte: toggle off sem depender do DOM
        linhas[idx] = fonte.slice(0, pos) + txt + fonte.slice(pos + candidato.length);
        aplicarTextoComCaret(linhas.join('\n'), idx, pos, txt.length);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    // 4) Envolver
    aplicarTextoSelecionado(marca + txt + marca);
  }

  function minimizarSecoes() {
    var el = editor();
    if (!el) return;
    el.querySelectorAll('.prompt-sec').forEach(function (s) {
      s.classList.add('is-collapsed');
    });
    atualizarNumerosLinha();
    salvarEstadoColapso();
  }

  function expandirSecoes() {
    var el = editor();
    if (!el) return;
    el.querySelectorAll('.prompt-sec').forEach(function (s) {
      s.classList.remove('is-collapsed');
    });
    atualizarNumerosLinha();
    salvarEstadoColapso();
  }

  function esconderLegenda() {
    var leg = document.getElementById('prompt-ux-legend');
    if (leg) leg.hidden = true;
    try {
      localStorage.setItem(LS_LEGEND, '0');
    } catch (_) {}
  }

  function mostrarLegendaSePreciso() {
    var leg = document.getElementById('prompt-ux-legend');
    if (!leg) return;
    var show = true;
    try {
      show = localStorage.getItem(LS_LEGEND) !== '0';
    } catch (_) {}
    leg.hidden = !show;
  }

  /* -------------------------------------------------------- @ autocomplete */

  var atItens = [];
  var atCarregando = false;
  var atIdx = 0;
  var atMenu = null;
  var atAtivo = false;
  var atQuery = '';

  function garantirMenuAt() {
    if (atMenu) return atMenu;
    atMenu = document.createElement('div');
    atMenu.id = 'prompt-at-menu';
    atMenu.className = 'prompt-at-menu';
    atMenu.hidden = true;
    document.body.appendChild(atMenu);
    return atMenu;
  }

  function carregarItensAt() {
    if (atCarregando) return Promise.resolve(atItens);
    atCarregando = true;
    return fetch((typeof window.APP_BASE === 'string' ? window.APP_BASE.replace(/\/$/, '') : '') + '/api/ia/prompt-tools', {
      credentials: 'same-origin',
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        atItens = (data && data.itens) || [];
        return atItens;
      })
      .catch(function () {
        atItens = [
          {
            token: '@tool-enviar_midia_gatilho',
            label: 'enviar_midia_gatilho',
            tipo: 'tool',
            hint: 'Envia mídia',
          },
        ];
        return atItens;
      })
      .finally(function () {
        atCarregando = false;
      });
  }

  function contextoAt() {
    var el = editor();
    var sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
    var node = sel.anchorNode;
    if (node.nodeType !== 3) return null;
    var text = node.textContent || '';
    var off = sel.anchorOffset;
    var before = text.slice(0, off);
    var m = before.match(/@([a-zA-Z0-9_.\-]*)$/);
    if (!m) return null;
    // e-mail em digitação: tem ponto no domínio sem "tool"
    var q = m[1];
    if (q.includes('.') && !q.startsWith('tool')) return null;
    return { node: node, start: off - m[0].length, end: off, query: q };
  }

  function filtrarAt(query) {
    var q = String(query || '').toLowerCase();
    if (q.startsWith('tool-')) q = q.slice(5);
    if (q.startsWith('tool')) q = q.slice(4).replace(/^-/, '');
    return atItens
      .filter(function (it) {
        var hay = (it.token + ' ' + it.label + ' ' + (it.hint || '')).toLowerCase();
        return !q || hay.indexOf(q) >= 0;
      })
      .slice(0, 12);
  }

  function fecharAt() {
    atAtivo = false;
    if (atMenu) atMenu.hidden = true;
  }

  function renderMenuAt(lista) {
    var menu = garantirMenuAt();
    if (!lista.length) {
      fecharAt();
      return;
    }
    atAtivo = true;
    atIdx = Math.max(0, Math.min(atIdx, lista.length - 1));
    menu.innerHTML = lista
      .map(function (it, i) {
        return (
          '<button type="button" class="prompt-at-item' +
          (i === atIdx ? ' is-active' : '') +
          '" data-i="' +
          i +
          '">' +
          '<span class="prompt-at-token">' +
          escaparHtml(it.token) +
          '</span>' +
          '<span class="prompt-at-meta">' +
          escaparHtml(it.label) +
          (it.hint ? ' · ' + escaparHtml(it.hint) : '') +
          '</span></button>'
        );
      })
      .join('');
    menu.hidden = false;
    menu.querySelectorAll('.prompt-at-item').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        inserirAt(lista[Number(btn.getAttribute('data-i'))]);
      });
    });
    posicionarMenuAt();
  }

  function posicionarMenuAt() {
    if (!atMenu || atMenu.hidden) return;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    atMenu.style.left = Math.max(8, rect.left) + 'px';
    atMenu.style.top = rect.bottom + 6 + window.scrollY + 'px';
  }

  function inserirAt(item) {
    if (!item) return;
    var ctx = contextoAt();
    var el = editor();
    if (!ctx || !el) {
      document.execCommand('insertText', false, item.token + ' ');
      fecharAt();
      renderizar(true);
      el && el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    var range = document.createRange();
    range.setStart(ctx.node, ctx.start);
    range.setEnd(ctx.node, ctx.end);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, item.token + ' ');
    fecharAt();
    renderizar(true);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function atualizarAt() {
    var ctx = contextoAt();
    if (!ctx) {
      fecharAt();
      return;
    }
    atQuery = ctx.query;
    carregarItensAt().then(function () {
      if (!contextoAt()) return;
      renderMenuAt(filtrarAt(atQuery));
    });
  }

  function tituloDeMarcador(linha) {
    var a = String(linha || '').match(RE_ABERTURA);
    if (a) return String(a[1] || '').trim();
    var f = String(linha || '').match(RE_FIM);
    if (f) return String(f[1] || '').trim();
    return '';
  }

  function tituloSecaoLimpo(titulo) {
    var m = markup();
    if (m && typeof m.tituloSecaoLimpo === 'function') return m.tituloSecaoLimpo(titulo);
    return String(titulo || '')
      .replace(/\s*\[(#[0-9a-fA-F]{3,8})\]\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function corSecaoDoTitulo(titulo) {
    var m = markup();
    if (m && typeof m.corSecaoDoTitulo === 'function') return m.corSecaoDoTitulo(titulo);
    var hit = String(titulo || '').match(/\s*\[(#[0-9a-fA-F]{3,8})\]\s*$/i);
    return hit ? hit[1] : '';
  }

  function tituloSecaoComCor(titulo, cor) {
    var m = markup();
    if (m && typeof m.tituloSecaoComCor === 'function') return m.tituloSecaoComCor(titulo, cor);
    var limpo = tituloSecaoLimpo(titulo);
    var c = String(cor || '').trim();
    if (!/^(#[0-9a-fA-F]{3,8})$/.test(c)) return limpo;
    return limpo + ' [' + c + ']';
  }

  /** Índice da abertura que casa com o fim em idxFim (pilha estrutural). */
  function acharAberturaDaSecao(linhas, idxFim) {
    if (!linhaEhFim(linhas[idxFim])) return -1;
    var profundidade = 0;
    for (var i = idxFim; i >= 0; i--) {
      if (linhaEhFim(linhas[i])) profundidade++;
      else if (linhaEhAbertura(linhas[i])) {
        profundidade--;
        if (profundidade === 0) return i;
      }
    }
    return -1;
  }

  /** Índice do fim que casa com a abertura em idxAbre. */
  function acharFimDaSecao(linhas, idxAbre) {
    if (!linhaEhAbertura(linhas[idxAbre])) return -1;
    var profundidade = 1;
    for (var i = idxAbre + 1; i < linhas.length; i++) {
      if (linhaEhAbertura(linhas[i])) profundidade++;
      else if (linhaEhFim(linhas[i])) {
        profundidade--;
        if (profundidade <= 0) return i;
      }
    }
    return -1;
  }

  function intervaloParSecao(linhas, idxMarcador) {
    var ini = -1;
    var fim = -1;
    if (linhaEhAbertura(linhas[idxMarcador])) {
      ini = idxMarcador;
      fim = acharFimDaSecao(linhas, ini);
    } else if (linhaEhFim(linhas[idxMarcador])) {
      fim = idxMarcador;
      ini = acharAberturaDaSecao(linhas, fim);
    }
    if (ini < 0 && fim < 0) return null;
    if (ini < 0) ini = fim;
    if (fim < 0) fim = ini;
    return { ini: ini, fim: fim };
  }

  /**
   * Tira ~abertura~ E ~fim~ do par; mantém o corpo.
   * Uma ponta nunca fica órfã para engolir a próxima seção.
   */
  function desembrulharSecao(idxMarcador) {
    var el = editor();
    if (!el) return;
    var linhas = textoAtual().split('\n');
    var par = intervaloParSecao(linhas, idxMarcador);
    if (!par) return;
    var ini = par.ini;
    var fim = par.fim;
    var corpo = [];
    if (fim > ini) corpo = linhas.slice(ini + 1, fim);
    else if (fim === ini && linhaEhAbertura(linhas[ini])) corpo = [];
    // limpa uma linha vazia nas bordas do corpo
    while (corpo.length && String(corpo[0] || '').trim() === '') corpo.shift();
    while (corpo.length && String(corpo[corpo.length - 1] || '').trim() === '') corpo.pop();
    var novas = linhas.slice(0, ini).concat(corpo).concat(linhas.slice(fim + 1));
    if (
      ini > 0 &&
      novas[ini] != null &&
      linhaEhAbertura(novas[ini]) &&
      String(novas[ini - 1] || '').trim() !== ''
    ) {
      novas.splice(ini, 0, '');
    }
    aplicarTextoComCaret(novas.join('\n'), Math.max(0, ini), 0, 0);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Apaga abertura + corpo + fim (seção some de vez). */
  function removerSecaoPorLinhaMarcador(idxMarcador) {
    var el = editor();
    if (!el) return;
    var linhas = textoAtual().split('\n');
    var par = intervaloParSecao(linhas, idxMarcador);
    if (!par) return;
    var ini = par.ini;
    var fim = par.fim;
    var novas = linhas.slice(0, ini).concat(linhas.slice(fim + 1));
    if (
      ini > 0 &&
      novas[ini] != null &&
      linhaEhAbertura(novas[ini]) &&
      String(novas[ini - 1] || '').trim() !== ''
    ) {
      novas.splice(ini, 0, '');
    }
    aplicarTextoComCaret(novas.join('\n'), Math.max(0, ini), 0, 0);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Pares atômicos no texto.
   * opts.fecharNoFim: no blur/carga, fecha aberturas restantes; durante digitação fica false
   * para não “brigar” com quem ainda está escrevendo o corpo.
   */
  function repararParesSecao(texto, opts) {
    opts = opts || {};
    var fecharNoFim = opts.fecharNoFim === true;
    var linhas = String(texto || '').replace(/\r\n/g, '\n').split('\n');
    var out = [];
    // temCorpo = texto real; soVazios = só linhas em branco desde a abertura.
    // Filha logo na linha seguinte (sem vazios) é aninhamento válido — não virar irmã.
    // Abertura + vazios + outra abertura = irmã (seção vazia acidental).
    var pilha = []; // { titulo, temCorpo, soVazios }

    function fecharTopo() {
      if (!pilha.length) return;
      var topo = pilha.pop();
      out.push('~fim da seção: ' + tituloSecaoLimpo(topo.titulo) + '~');
    }

    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i];
      if (linhaEhAbertura(l)) {
        var tit = tituloDeMarcador(l) || 'Nova seção';
        if (pilha.length && !pilha[pilha.length - 1].temCorpo && pilha[pilha.length - 1].soVazios) {
          fecharTopo();
        }
        pilha.push({ titulo: tit, temCorpo: false, soVazios: false });
        out.push('~abertura da seção: ' + tit + '~');
        continue;
      }
      if (linhaEhFim(l)) {
        if (!pilha.length) continue; // órfão fora
        var topoF = pilha.pop();
        // fim sempre com o título limpo (sem [#cor]) da abertura do par
        out.push('~fim da seção: ' + tituloSecaoLimpo(topoF.titulo) + '~');
        continue;
      }
      if (pilha.length) {
        if (String(l || '').trim() !== '') {
          pilha[pilha.length - 1].temCorpo = true;
          pilha[pilha.length - 1].soVazios = false;
        } else if (!pilha[pilha.length - 1].temCorpo) {
          pilha[pilha.length - 1].soVazios = true;
        }
      }
      out.push(l);
    }
    if (fecharNoFim) {
      while (pilha.length) fecharTopo();
    }
    return out.join('\n');
  }

  /**
   * Apagar ~abertura~ ou ~fim~: o PAR inteiro de marcadores some; o texto do
   * meio fica. Linha vazia entre seções NÃO dispara o aviso (só limpa o gap).
   * @returns {boolean} true se consumiu o evento
   */
  function confirmarDesfazerSecao(titulo) {
    return window.confirm(
      'Desfazer a seção "' +
        (titulo || 'sem título') +
        '"?\n\n' +
        'OK — remove ~abertura~ e ~fim~, mantém o texto\n' +
        'Cancelar — não apaga',
    );
  }

  /** Remove uma linha (tipicamente vazia) e reposiciona o caret. */
  function apagarLinhaEm(idx, caretLinha, caretOff) {
    var el = editor();
    if (!el) return;
    var linhas = textoAtual().split('\n');
    if (idx < 0 || idx >= linhas.length) return;
    linhas.splice(idx, 1);
    var dest = typeof caretLinha === 'number' ? caretLinha : Math.min(idx, Math.max(0, linhas.length - 1));
    if (dest > linhas.length - 1) dest = Math.max(0, linhas.length - 1);
    var off = typeof caretOff === 'number' ? caretOff : 0;
    aplicarTextoComCaret(linhas.join('\n'), dest, off, 0);
  }

  function protegerApagarMarcador(direcao) {
    var el = editor();
    if (!el) return false;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return false;

    if (!sel.isCollapsed) {
      var txtSel = String(sel.toString() || '');
      if (/~(?:abertura|fim) da seção:/i.test(txtSel)) {
        var escolha = window.confirm(
          'A seleção inclui marcador de seção.\n\n' +
            'OK — tira os marcadores e mantém o texto\n' +
            'Cancelar — não apaga',
        );
        if (!escolha) return true;
        // Desembrulha cada linha de marcador na seleção (de trás pra frente)
        var linhas = textoAtual().split('\n');
        var todas = Array.prototype.slice.call(el.querySelectorAll('.pl'));
        var aEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
        var fEl = sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement;
        var a = todas.indexOf(aEl && aEl.closest ? aEl.closest('.pl') : null);
        var f = todas.indexOf(fEl && fEl.closest ? fEl.closest('.pl') : null);
        if (a < 0 || f < 0) return true;
        var lo = Math.min(a, f);
        var hi = Math.max(a, f);
        var idxs = [];
        for (var k = lo; k <= hi; k++) {
          if (linhaEhAbertura(linhas[k]) || linhaEhFim(linhas[k])) idxs.push(k);
        }
        // um par por vez, do fim pro começo
        var vistos = {};
        for (var m = idxs.length - 1; m >= 0; m--) {
          var par = intervaloParSecao(linhas, idxs[m]);
          if (!par) continue;
          var chave = par.ini + ':' + par.fim;
          if (vistos[chave]) continue;
          vistos[chave] = true;
          desembrulharSecao(par.ini);
          linhas = textoAtual().split('\n');
        }
        return true;
      }
      return false;
    }

    var pos = posicaoCaret(el);
    if (!pos) return false;
    var linhas2 = textoAtual().split('\n');
    var idx = pos.linha;
    var off = pos.offset;
    var tam = typeof pos.tamanho === 'number' ? pos.tamanho : String(linhas2[idx] || '').length;
    var plNodes = el.querySelectorAll('.pl');
    var pl = plNodes[idx];
    var sec = pl && pl.closest ? pl.closest('.prompt-sec') : null;
    var linhaAtualVazia = String(linhas2[idx] || '').trim() === '';

    // Gap vazio entre seções: Backspace/Delete só tira a linha vazia — nunca o ~fim~ vizinho.
    if (
      linhaAtualVazia &&
      ((direcao === 'back' && off === 0) || (direcao === 'fwd' && off >= tam))
    ) {
      // Após apagar o gap, caret no início do que vinha depois (próxima seção).
      apagarLinhaEm(idx, Math.min(idx, Math.max(0, linhas2.length - 2)), 0);
      return true;
    }

    // Caret no ~fim~ invisível (seção recolhida): não perguntar — limpa vazia ao lado ou ignora.
    if (
      pl &&
      pl.classList.contains('pl-marca-fecha') &&
      sec &&
      sec.classList.contains('is-collapsed')
    ) {
      if (idx + 1 < linhas2.length && String(linhas2[idx + 1] || '').trim() === '') {
        apagarLinhaEm(idx + 1, idx + 1, 0);
        return true;
      }
      if (
        direcao === 'back' &&
        idx > 0 &&
        String(linhas2[idx - 1] || '').trim() === ''
      ) {
        apagarLinhaEm(idx - 1, Math.max(0, idx - 1), 0);
        return true;
      }
      // Sem gap: engole a tecla (não desembrulha pelo marcador invisível)
      return true;
    }

    // Delete no título recolhido → expandir (não comer o par escondido)
    if (
      direcao === 'fwd' &&
      sec &&
      sec.classList.contains('is-collapsed') &&
      pl &&
      pl.classList.contains('pl-marca-abre') &&
      off >= tam
    ) {
      abrirSecao(sec);
      atualizarNumerosLinha();
      agendarSalvarColapso();
      return true;
    }

    if (direcao === 'back' && off === 0 && linhaEhAbertura(linhas2[idx])) {
      if (idx > 0 && String(linhas2[idx - 1] || '').trim() === '') return false;
      if (idx > 0 && linhaEhFim(linhas2[idx - 1])) {
        // Seções coladas: Backspace na abertura de baixo mexe no fechamento de cima
        var titPrev = tituloDeMarcador(linhas2[idx - 1]) || 'seção';
        if (confirmarDesfazerSecao(titPrev)) desembrulharSecao(idx - 1);
        return true;
      }
    }

    // Apagando a própria linha de marcador (Backspace no início / Delete no fim da linha marca)
    var naMarca = linhaEhAbertura(linhas2[idx]) || linhaEhFim(linhas2[idx]);
    if (naMarca && ((direcao === 'back' && off === 0) || (direcao === 'fwd' && off >= tam))) {
      if (direcao === 'back' && off === 0) {
        if (idx > 0 && String(linhas2[idx - 1] || '').trim() === '') return false;
      }
    }

    var alvoIdx = null;
    if (direcao === 'back') {
      if (off > 0) {
        return false;
      }
      alvoIdx = idx - 1;
    } else {
      if (off < tam) return false;
      alvoIdx = idx + 1;
    }
    if (alvoIdx == null || alvoIdx < 0 || alvoIdx >= linhas2.length) {
      if (naMarca && direcao === 'fwd' && off >= tam) {
        alvoIdx = idx;
      } else {
        return false;
      }
    }

    var alvo = linhas2[alvoIdx];
    if (String(alvo || '').trim() === '') return false;
    if (!linhaEhAbertura(alvo) && !linhaEhFim(alvo)) return false;

    var titulo = tituloDeMarcador(alvo) || 'sem título';
    if (confirmarDesfazerSecao(titulo)) {
      desembrulharSecao(alvoIdx);
    }
    return true;
  }

  /* --------------------------------------------------------------- binds */

  function bindEditor() {
    var el = editor();
    if (!el || boundEditor === el) return;
    boundEditor = el;
    var tituloEditando = false;

    el.addEventListener('input', function () {
      if (renderizando) return;
      if (caretEmTituloSecao()) {
        tituloEditando = true;
        setTimeout(atualizarAt, 0);
        return;
      }
      agendarRender();
      setTimeout(atualizarAt, 0);
    });

    document.addEventListener('selectionchange', function () {
      if (!boundEditor || boundEditor !== editor()) return;
      var emTitulo = !!caretEmTituloSecao();
      if (tituloEditando && !emTitulo) {
        tituloEditando = false;
        confirmarEdicaoTituloSecao();
      } else if (emTitulo) {
        tituloEditando = true;
      }
    });

    el.addEventListener('blur', function () {
      if (!tituloEditando) return;
      setTimeout(function () {
        if (!caretEmTituloSecao()) {
          tituloEditando = false;
          confirmarEdicaoTituloSecao();
        }
      }, 0);
    });

    el.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var fold = t.closest('.pl-fold');
      if (fold) {
        var secFold = fold.closest('.prompt-sec');
        if (secFold) {
          e.preventDefault();
          e.stopPropagation();
          toggleSecao(secFold);
        }
        return;
      }
      var marca = t.closest('.pl-marca-abre');
      if (marca) {
        var sec = marca.closest('.prompt-sec');
        // Clique na área esquerda do título (hit area do chevron fixo 32px)
        if (sec && e.offsetX < 32) {
          e.preventDefault();
          toggleSecao(sec);
        }
      }
    });

    var bloqueouDeleteMarcador = false;

    el.addEventListener('beforeinput', function (e) {
      if (!e || !e.inputType) return;
      if (e.inputType === 'deleteContentBackward') {
        if (protegerApagarMarcador('back')) {
          e.preventDefault();
          bloqueouDeleteMarcador = true;
        }
      } else if (e.inputType === 'deleteContentForward') {
        if (protegerApagarMarcador('fwd')) {
          e.preventDefault();
          bloqueouDeleteMarcador = true;
        }
      }
    });

    el.addEventListener('keydown', function (e) {
      if (atAtivo && atMenu && !atMenu.hidden) {
        var lista = filtrarAt(atQuery);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          atIdx = Math.min(lista.length - 1, atIdx + 1);
          renderMenuAt(lista);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          atIdx = Math.max(0, atIdx - 1);
          renderMenuAt(lista);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          if (lista[atIdx]) {
            e.preventDefault();
            inserirAt(lista[atIdx]);
            return;
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          fecharAt();
          return;
        }
      }
      // Evita confirm duplicado: beforeinput já tratou.
      if (bloqueouDeleteMarcador && (e.key === 'Backspace' || e.key === 'Delete')) {
        bloqueouDeleteMarcador = false;
        e.preventDefault();
        return;
      }
      // Fallback quando beforeinput não dispara (jsdom / browsers antigos)
      if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (protegerApagarMarcador('back')) {
          e.preventDefault();
          return;
        }
      }
      if (e.key === 'Delete' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (protegerApagarMarcador('fwd')) {
          e.preventDefault();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        /* Enter no título colorido: confirma o nome e desce pro corpo da seção.
         * Seção compactada: mantém o comportamento anterior (linha depois do ~fim~). */
        if (caretEmTituloSecao()) {
          tituloEditando = false;
          confirmarEdicaoTituloSecao();
          var textoTit = textoAtual();
          var linhasTit = textoTit.split('\n');
          var posTit = posicaoCaret(el);
          var idxTit = posTit && typeof posTit.linha === 'number' ? posTit.linha : 0;
          var plTit = el.querySelectorAll('.pl')[idxTit];
          var secTit = plTit && plTit.closest ? plTit.closest('.prompt-sec') : null;
          if (secTit && secTit.classList.contains('is-collapsed')) {
            var fimColTit = acharFimDaSecao(linhasTit, idxTit);
            var insertColTit = fimColTit >= 0 ? fimColTit + 1 : idxTit + 1;
            aplicarTextoComCaret(
              linhasTit
                .slice(0, insertColTit)
                .concat([''])
                .concat(linhasTit.slice(insertColTit))
                .join('\n'),
              insertColTit,
              0,
              0,
            );
            return;
          }
          var destTit = idxTit + 1;
          if (destTit < linhasTit.length && linhaEhFim(linhasTit[destTit])) {
            aplicarTextoComCaret(
              linhasTit.slice(0, destTit).concat(['']).concat(linhasTit.slice(destTit)).join('\n'),
              destTit,
              0,
              0,
            );
          } else {
            aplicarTextoComCaret(textoTit, Math.min(destTit, Math.max(0, linhasTit.length - 1)), 0, 0);
          }
          return;
        }
        var texto = textoAtual();
        var linhas = texto.split('\n');
        var pos = posicaoCaret(el);
        var idx = pos && typeof pos.linha === 'number' ? pos.linha : linhas.length - 1;
        if (idx < 0) idx = 0;
        var linhaAtual = String(linhas[idx] || '');

        // Enter no meio de ~abertura~/~fim~ quebrava o marcador e aninhava seções.
        if (linhaEhAbertura(linhaAtual) || linhaEhFim(linhaAtual)) {
          if (linhaEhAbertura(linhaAtual)) {
            var plAb = el.querySelectorAll('.pl')[idx];
            var secAb = plAb && plAb.closest ? plAb.closest('.prompt-sec') : null;
            // Seção compactada: Enter = linha em branco DEPOIS do ~fim~ (igual ao fim)
            if (secAb && secAb.classList.contains('is-collapsed')) {
              var fimCol = acharFimDaSecao(linhas, idx);
              var insertCol = fimCol >= 0 ? fimCol + 1 : idx + 1;
              var novasCol = linhas
                .slice(0, insertCol)
                .concat([''])
                .concat(linhas.slice(insertCol));
              aplicarTextoComCaret(novasCol.join('\n'), insertCol, 0, 0);
              return;
            }
            // Aberta: linha em branco no corpo
            var insertAt = idx + 1;
            var novasAb = linhas.slice(0, insertAt).concat(['']).concat(linhas.slice(insertAt));
            aplicarTextoComCaret(novasAb.join('\n'), insertAt, 0, 0);
            return;
          }
          // depois do fim: linha livre entre seções
          var insertF = idx + 1;
          var novasF = linhas.slice(0, insertF).concat(['']).concat(linhas.slice(insertF));
          aplicarTextoComCaret(novasF.join('\n'), insertF, 0, 0);
          return;
        }

        var off = pos && typeof pos.offset === 'number' ? pos.offset : linhaAtual.length;
        // offset é do texto RENDERIZADO (*some* some); no fim visual, corta a fonte inteira.
        if (pos && typeof pos.tamanho === 'number' && off >= pos.tamanho) {
          off = linhaAtual.length;
        }
        if (off < 0) off = 0;
        if (off > linhaAtual.length) off = linhaAtual.length;
        var esquerda = linhaAtual.slice(0, off);
        var direita = linhaAtual.slice(off);
        var novas = linhas
          .slice(0, idx)
          .concat([esquerda, direita])
          .concat(linhas.slice(idx + 1));
        aplicarTextoComCaret(novas.join('\n'), idx + 1, 0, direita.length);
        return;
      }
    });

    el.addEventListener('blur', function () {
      setTimeout(fecharAt, 150);
      renderizar(false);
      setTimeout(avisarDesbalanceamentoSePreciso, 0);
    });

    el.addEventListener('paste', function (e) {
      // Colar HTML aninhado (Word/Docs) vira divs soltas e quebra seções.
      if (!e.clipboardData) return;
      var plain = e.clipboardData.getData('text/plain');
      if (plain == null) return;
      var chavesAntes = snapshotChavesSecao();
      e.preventDefault();
      document.execCommand('insertText', false, plain.replace(/\r\n/g, '\n'));
      renderizar(true);
      colapsarSecoesAposPaste(plain, chavesAntes);
      atualizarNumerosLinha();
      agendarSalvarColapso();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    document.addEventListener('selectionchange', memorizarSelecao);

    // Botões da barra roubam o foco antes do clique — guarda a seleção e evita blur.
    var toolbar = document.querySelector('.pte-toolbar');
    if (toolbar) {
      toolbar.addEventListener('mousedown', function (e) {
        var alvo = e.target.closest('button, select, input[type="color"], label');
        if (!alvo || !toolbar.contains(alvo)) return;
        memorizarSelecao();
        if (alvo.tagName === 'BUTTON') e.preventDefault();
      });
      toolbar.addEventListener('focusin', function (e) {
        if (e.target && (e.target.tagName === 'SELECT' || e.target.type === 'color')) {
          memorizarSelecao();
        }
      });
    }

    carregarItensAt();
  }

  /* ------------------------------------------------------------ estética */

  /**
   * Cor/tamanho viram marcação no texto. Pintar só o HTML não durava: o próximo
   * render reconstrói tudo a partir do texto e o estilo se perdia.
   *
   * Sempre opera no texto-fonte (não execCommand): o select da toolbar rouba o
   * foco e o insertText falhava com a seleção morta.
   */
  function indicesPlDaSelecao(sel) {
    var el = editor();
    if (!el || !sel || !sel.rangeCount) return null;
    var todas = Array.prototype.slice.call(el.querySelectorAll('.pl'));
    var aEl = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    var fEl = sel.focusNode && (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement);
    var a = todas.indexOf(aEl && aEl.closest ? aEl.closest('.pl') : null);
    var f = todas.indexOf(fEl && fEl.closest ? fEl.closest('.pl') : null);
    if (a < 0 || f < 0) return null;
    return { lo: Math.min(a, f), hi: Math.max(a, f) };
  }

  function indicesPlDoRange(range) {
    var el = editor();
    if (!el || !range) return null;
    var todas = Array.prototype.slice.call(el.querySelectorAll('.pl'));
    var sEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    var eEl = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
    var a = todas.indexOf(sEl && sEl.closest ? sEl.closest('.pl') : null);
    var f = todas.indexOf(eEl && eEl.closest ? eEl.closest('.pl') : null);
    if (a < 0 || f < 0) return null;
    return { lo: Math.min(a, f), hi: Math.max(a, f) };
  }

  function envolverLinhasComEstetica(lo, hi, abre, fecha) {
    var el = editor();
    if (!el || lo == null || hi == null || lo < 0) return false;
    var linhas = textoAtual().split('\n');
    if (hi >= linhas.length) hi = linhas.length - 1;
    var mudou = false;
    for (var i = lo; i <= hi; i++) {
      var L = String(linhas[i] || '');
      if (!L.trim() || linhaEhAbertura(L) || linhaEhFim(L)) continue;
      // Troca tamanho/cor já aplicados (evita empilhar {tam}{tam}…)
      if (/^\{tam:\d+\}/.test(abre)) {
        L = L.replace(/\{tam:\d+\}([\s\S]*?)\{\/tam\}/g, '$1');
      }
      if (/^\{cor:/.test(abre)) {
        L = L.replace(/\{cor:[^}]+\}([\s\S]*?)\{\/cor\}/g, '$1');
      }
      linhas[i] = abre + L + fecha;
      mudou = true;
    }
    if (!mudou) return false;
    aplicarTextoComCaret(linhas.join('\n'), lo, 0, 0);
    selecaoSalva = null;
    return true;
  }

  function envolverEstetica(abre, fecha) {
    var el = editor();
    if (!el) return false;

    // 1) Seleção viva ou restaurada
    var sel = selecaoParaFormatar();
    if (sel && !sel.isCollapsed) {
      var idxSel = indicesPlDaSelecao(sel);
      if (idxSel && envolverLinhasComEstetica(idxSel.lo, idxSel.hi, abre, fecha)) return true;
    }

    // 2) Range memorizado (antes do select roubar o foco)
    if (selecaoSalva) {
      var idxRange = indicesPlDoRange(selecaoSalva);
      if (idxRange && envolverLinhasComEstetica(idxRange.lo, idxRange.hi, abre, fecha)) return true;
    }

    // 3) Linha do caret / última linha lembrada
    return pintarLinhaDoCaret(abre, fecha);
  }

  /** Sem trecho selecionado, pinta a linha inteira onde o cursor estava. */
  function pintarLinhaDoCaret(abre, fecha) {
    var el = editor();
    if (!el) return false;
    var pos = posicaoCaret(el);
    var idx = pos ? pos.linha : linhaSalva;
    if (idx == null || idx < 0) return false;
    return envolverLinhasComEstetica(idx, idx, abre, fecha);
  }

  function aplicarCorSecao(cor) {
    var el = editor();
    if (!el) return false;
    var c = String(cor || '').trim();
    if (!/^(#[0-9a-fA-F]{3,8})$/.test(c)) return false;
    var pos = posicaoCaret(el);
    var idxLinha = pos ? pos.linha : linhaSalva;
    if (idxLinha == null || idxLinha < 0) return false;
    var pl = el.querySelectorAll('.pl')[idxLinha];
    var sec = pl && pl.closest ? pl.closest('.prompt-sec') : null;
    if (!sec) return false;
    var abre = sec.querySelector(':scope > .pl-marca-abre');
    if (!abre) return false;
    var idx = Array.prototype.indexOf.call(el.querySelectorAll('.pl'), abre);
    if (idx < 0) return false;
    var linhas = textoAtual().split('\n');
    if (!linhaEhAbertura(linhas[idx])) return false;
    var tit = tituloSecaoLimpo(tituloDeMarcador(linhas[idx]) || 'seção');
    linhas[idx] = '~abertura da seção: ' + tituloSecaoComCor(tit, c) + '~';
    var fimIdx = acharFimDaSecao(linhas, idx);
    if (fimIdx >= 0 && linhaEhFim(linhas[fimIdx])) {
      linhas[fimIdx] = '~fim da seção: ' + tit + '~';
    }
    aplicarTextoComCaret(linhas.join('\n'), idx, 0, 0);
    return true;
  }

  function aplicarCor(cor) {
    var c = String(cor || '').trim();
    if (!/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(c)) return;
    var sel = selecaoParaFormatar();
    var temSelecao = sel && !sel.isCollapsed && String(sel.toString() || '').trim();
    if (!temSelecao && selecaoSalva) {
      try {
        temSelecao = !selecaoSalva.collapsed && String(selecaoSalva.toString() || '').trim();
      } catch (_) {}
    }
    // Sem texto selecionado: pinta a seção sob o cursor (borda/fundo)
    if (!temSelecao && /^#/.test(c) && aplicarCorSecao(c)) return;
    envolverEstetica('{cor:' + c + '}', '{/cor}');
  }

  function aplicarTamanhoSelecao(px) {
    var n = Math.round(Number(px));
    if (!isFinite(n) || n < 6 || n > 120) return;
    envolverEstetica('{tam:' + n + '}', '{/tam}');
    // Permite reaplicar o mesmo px depois (onchange só dispara se o value muda)
    var selEl = document.getElementById('prompt-font-sel');
    if (selEl) {
      selEl.value = '';
    }
  }

  /* ----------------------------------------------------------- interface */

  window.teaPromptHtmlParaTexto = function (html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return htmlParaTexto(tmp);
  };

  window.teaPromptEditorUx = {
    formatTitulo: formatTitulo,
    envolverInline: envolverInline,
    negrito: function () {
      envolverInline('*');
    },
    italico: function () {
      envolverInline('_');
    },
    tachado: function () {
      envolverInline('~');
    },
    aplicarCor: aplicarCor,
    aplicarTamanhoSelecao: aplicarTamanhoSelecao,
    aplicarFonteGlobal: aplicarFonteGlobal,
    estruturarDobras: function () {
      renderizar(false);
    },
    renderizar: renderizar,
    definirTexto: definirTexto,
    obterTexto: textoAtual,
    diagnosticarSecoes: diagnosticarSecoes,
    repararParesSecao: repararParesSecao,
    atualizarNumerosLinha: atualizarNumerosLinha,
    contarLinhasVisiveis: atualizarNumerosLinha,
    /** @internal testes */
    _protegerApagarMarcador: protegerApagarMarcador,
    _removerSecaoPorLinhaMarcador: removerSecaoPorLinhaMarcador,
    _desembrulharSecao: desembrulharSecao,
    _acharFimDaSecao: acharFimDaSecao,
    _snapshotChavesSecao: snapshotChavesSecao,
    _colapsarSecoesAposPaste: colapsarSecoesAposPaste,
    _linhaOcultaPorColapso: linhaOcultaPorColapso,
    _salvarEstadoColapso: salvarEstadoColapso,
    estaOcupado: function () {
      return renderizando;
    },
    textoParaHtml: textoParaHtml,
    minimizarSecoes: minimizarSecoes,
    expandirSecoes: expandirSecoes,
    toggleAutoFecharSecoes: toggleAutoFecharSecoes,
    autoFecharSecoesAtivo: autoFecharSecoesAtivo,
    aplicarEstadoColapsoSalvo: aplicarEstadoColapsoSalvo,
    /** @internal testes */
    _toggleSecao: toggleSecao,
    _abrirSecao: abrirSecao,
    _irmaosDaSecao: irmaosDaSecao,
    esconderLegenda: esconderLegenda,
    garantirZonaLivre: function () {},
    toggleRegua: function () {
      try {
        var cur = localStorage.getItem(LS_REGUA) !== '0';
        localStorage.setItem(LS_REGUA, cur ? '0' : '1');
      } catch (_) {}
      atualizarRegua();
    },
    init: function () {
      var px = 15;
      try {
        px = parseInt(localStorage.getItem(LS_FONT) || '15', 10) || 15;
      } catch (_) {}
      aplicarFonteGlobal(px);
      var sel = document.getElementById('prompt-font-global');
      if (sel) sel.value = String(px);
      atualizarRegua();
      atualizarBotaoAutoFechar();
      mostrarLegendaSePreciso();
      bindEditor();
      renderizar(true);
    },
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (window.teaPromptEditorUx) window.teaPromptEditorUx.init();
  });
})();
