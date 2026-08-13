/**
 * Markup do prompt — seções + WhatsApp (via dist).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  htmlEditorParaTexto,
  legacyMarkdownParaMarkup,
  markupParaLlm,
  listarSecoesMarkup,
  normalizarMarkup,
  textoParaHtmlEditor,
} from '../../app/dist/prompt-markup.js';
import { htmlParaTexto } from '../../app/dist/prompt-minasplaca.js';

describe('prompt-markup', () => {
  test('legacy ## vira marcadores', () => {
    const t = legacyMarkdownParaMarkup('## Persona\nola\n## FAQ\nx');
    assert.match(t, /~abertura da seção: Persona~/);
    assert.match(t, /~fim da seção: Persona~/);
    assert.match(t, /~abertura da seção: FAQ~/);
  });

  test('texto→html→texto roundtrip seção', () => {
    const src = normalizarMarkup('~abertura da seção: Hi~\n*bola* e _ita_\n~fim da seção: Hi~');
    const html = textoParaHtmlEditor(src);
    assert.match(html, /prompt-sec/);
    assert.match(html, /<strong>bola<\/strong>/);
    assert.match(html, /<em>ita<\/em>/);
    const back = htmlEditorParaTexto(html);
    assert.equal(back, src);
  });

  test('editor é linear: uma div .pl por linha', () => {
    const html = textoParaHtmlEditor('linha um\nlinha dois\nlinha três');
    const linhas = html.match(/class="pl[" ]/g) || [];
    assert.equal(linhas.length, 3);
    assert.doesNotMatch(html, /prompt-sec/);
  });

  test('marcadores viram linhas visíveis, não somem', () => {
    const html = textoParaHtmlEditor('~abertura da seção: A~\ncorpo\n~fim da seção: A~');
    assert.match(html, /pl-marca-abre/);
    assert.match(html, /pl-marca-fecha/);
    assert.match(html, /~abertura da seção: /);
    assert.match(html, /<span class="pl-titulo">A<\/span>/);
    assert.equal(
      htmlEditorParaTexto(html),
      '~abertura da seção: A~\ncorpo\n~fim da seção: A~',
    );
  });

  test('seções podem ser aninhadas', () => {
    const src =
      '~abertura da seção: Pai~\n' +
      'antes\n' +
      '~abertura da seção: Filho~\n' +
      '*dentro*\n' +
      '~fim da seção: Filho~\n' +
      'depois\n' +
      '~fim da seção: Pai~';
    const html = textoParaHtmlEditor(src);
    assert.match(html, /data-nivel="1"/);
    assert.match(html, /data-nivel="2"/);
    assert.match(html, /<span class="pl-titulo">Pai<\/span>/);
    assert.match(html, /<span class="pl-titulo">Filho<\/span>/);
    assert.equal(htmlEditorParaTexto(html), src);

    const secoes = listarSecoesMarkup(src);
    assert.deepEqual(
      secoes.map((s) => [s.caminho, s.nivel]),
      [
        ['Pai', 1],
        ['Pai > Filho', 2],
      ],
    );
  });

  test('LLM recebe hierarquia em headings', () => {
    const llm = markupParaLlm(
      '~abertura da seção: Pai~\na\n~abertura da seção: Filho~\nb\n~fim da seção: Filho~\n~fim da seção: Pai~',
    );
    assert.match(llm, /^## Pai/m);
    assert.match(llm, /^### Filho/m);
    assert.doesNotMatch(llm, /abertura da seção/);
  });

  test('texto fora de seção continua texto livre', () => {
    const src = 'solto antes\n~abertura da seção: A~\ndentro\n~fim da seção: A~\nsolto depois';
    const back = htmlEditorParaTexto(textoParaHtmlEditor(src));
    assert.equal(back, src);
  });

  test('markupParaLlm remove marcadores', () => {
    const llm = markupParaLlm('~abertura da seção: A~\ncorpo\n~fim da seção: A~');
    assert.match(llm, /^## A/m);
    assert.doesNotMatch(llm, /abertura da seção/);
    assert.match(llm, /corpo/);
  });

  test('tachado WA não confunde com seção', () => {
    const html = textoParaHtmlEditor('use ~isso~ normal');
    assert.match(html, /<s>isso<\/s>/);
    assert.doesNotMatch(html, /prompt-sec/);
  });

  test('Enter: linhas em branco no fim e duplas sobrevivem ao render', () => {
    const fim = textoParaHtmlEditor('linha um\n');
    assert.equal((fim.match(/class="pl/g) || []).length, 2);
    const duplas = textoParaHtmlEditor('um\n\n\ndois');
    assert.equal((duplas.match(/class="pl/g) || []).length, 4);
    const topo = textoParaHtmlEditor('\num');
    assert.equal((topo.match(/class="pl/g) || []).length, 2);
  });

  test('seção irmã: abertura de B fora do par de A', () => {
    const html = textoParaHtmlEditor(
      '~abertura da seção: Nova~\n\n~fim da seção: Nova~\n\n~abertura da seção: B~\ncorpo\n~fim da seção: B~',
    );
    assert.match(html, /data-nivel="1"/);
    assert.doesNotMatch(html, /data-nivel="2"/);
  });

  test('negrito com asterisco vira strong e volta com asterisco', () => {
    const html = textoParaHtmlEditor('fala *forte* aqui');
    assert.match(html, /<strong>forte<\/strong>/);
    assert.equal(htmlEditorParaTexto(html), 'fala *forte* aqui');
  });

  test('@tool- pinta e e-mail não', () => {
    const html = textoParaHtmlEditor(
      'use @tool-enviar_midia_gatilho e escreva contato@teabrazil.com',
    );
    assert.match(html, /pl-tool/);
    assert.match(html, /data-token="@tool-enviar_midia_gatilho"/);
    assert.doesNotMatch(html, /@tool-enviar<em>/);
    assert.doesNotMatch(html, /data-token="[^"]*<em>/);
    assert.doesNotMatch(html, /contato@teabrazil\.com<\/span>/);
    assert.match(html, /contato@teabrazil\.com/);
    assert.equal(
      htmlEditorParaTexto(html),
      'use @tool-enviar_midia_gatilho e escreva contato@teabrazil.com',
    );
  });

  test('@tool-midia- + negrito + seção', () => {
    const src =
      '~abertura da seção: A~\nuse *logo* @tool-midia-video_aula\n~fim da seção: A~';
    const html = textoParaHtmlEditor(src);
    assert.match(html, /pl-tool-midia/);
    assert.match(html, /<strong>logo<\/strong>/);
    assert.equal(htmlEditorParaTexto(html), src);
  });

  test('cor e tamanho viram span pintado e voltam ao texto', () => {
    const src = 'antes {cor:#c00}vermelho{/cor} e {tam:22}grande{/tam} fim';
    const html = textoParaHtmlEditor(src);
    assert.match(html, /<span class="pl-cor" data-cor="#c00" style="color:#c00">vermelho<\/span>/);
    assert.match(html, /<span class="pl-tam" data-tam="22" style="font-size:22px">grande<\/span>/);
    assert.equal(htmlEditorParaTexto(html), src);
  });

  test('cor aninhada com negrito e tamanho sobrevive ao roundtrip', () => {
    const src = '{tam:20}título {cor:#0d7377}*forte*{/cor}{/tam}';
    const html = textoParaHtmlEditor(src);
    assert.match(html, /<strong>forte<\/strong>/);
    assert.equal(htmlEditorParaTexto(html), src);
  });

  test('cor e tamanho não chegam na IA', () => {
    const llm = markupParaLlm('~abertura da seção: A~\n{cor:#c00}fale *assim*{/cor}\n~fim da seção: A~');
    assert.doesNotMatch(llm, /\{cor:/);
    assert.doesNotMatch(llm, /\{\/cor\}/);
    assert.match(llm, /fale \*assim\*/);
  });

  test('cor que atravessa linhas pinta todas e volta igual', () => {
    const src =
      'antes\n{cor:#ff0000}PROIBIDO:\nNUNCA USE GIRIAS!\nsem abreviações{/cor}\ndepois';
    const html = textoParaHtmlEditor(src);
    assert.equal((html.match(/pl-cor/g) || []).length, 3);
    assert.doesNotMatch(html, /\{cor:/, 'marca crua apareceu na tela');
    assert.equal(htmlEditorParaTexto(html), src);
  });

  test('tamanho atravessando linhas também pinta e volta igual', () => {
    const src = '{tam:22}linha um\nlinha dois{/tam}';
    const html = textoParaHtmlEditor(src);
    assert.equal((html.match(/pl-tam/g) || []).length, 2);
    assert.equal(htmlEditorParaTexto(html), src);
  });

  test('cor multilinha não vaza marca herdada para a IA', () => {
    const llm = markupParaLlm('{cor:#c00}um\ndois{/cor}');
    assert.doesNotMatch(llm, /\{cor|\|h/);
    assert.equal(llm, 'um\ndois');
  });

  test('cor aberta e nunca fechada pinta até o fim sem sujar o texto', () => {
    const src = 'normal\n{cor:#c00}daqui pra baixo\nainda pintado';
    const html = textoParaHtmlEditor(src);
    assert.equal((html.match(/pl-cor/g) || []).length, 2);
    assert.equal(htmlEditorParaTexto(html), src);
  });

  test('marcador de seção não é engolido pela cor aberta', () => {
    const src = '{cor:#c00}texto\n~abertura da seção: A~\ndentro\n~fim da seção: A~';
    const html = textoParaHtmlEditor(src);
    assert.match(html, /pl-marca-abre/);
    assert.match(html, /<span class="pl-titulo">A<\/span>/);
    assert.equal(htmlEditorParaTexto(html), src);
  });

  test('cor inválida fica como texto, não vira span', () => {
    const html = textoParaHtmlEditor('{cor:javascript:alert(1)}x{/cor}');
    assert.doesNotMatch(html, /pl-cor/);
    assert.match(html, /\{cor:/);
  });

  test('htmlParaTexto h1 solto (legado)', () => {
    const t = htmlParaTexto('<h1>Vendedora</h1>');
    assert.match(t, /~abertura da seção: Vendedora~/);
  });

  test('htmlParaTexto lê HTML legado com prompt-bloco', () => {
    const t = htmlParaTexto(
      '<div class="prompt-bloco"><h1>A</h1><div class="prompt-bloco-corpo"><div>oi</div></div></div>',
    );
    assert.match(t, /~abertura da seção: A~/);
    assert.match(t, /oi/);
  });
});
