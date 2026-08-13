/**
 * Editor de prompt no DOM real (jsdom): render, leitura e roundtrip.
 *
 * O que importa aqui é o que o usuário sente: o que ele digita vira formatação,
 * e o que ele copia volta com os marcadores.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, before } from 'node:test';
import { JSDOM } from '../../app/node_modules/jsdom/lib/api.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const UX = join(ROOT, 'app', 'public', 'prompt-editor-ux.js');
const BUNDLE = join(ROOT, 'app', 'public', 'prompt-markup.js');

let win;
let ux;

function editor() {
  return win.document.getElementById('prompt-editor');
}

before(() => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="prompt-editor" contenteditable="true"></div></body></html>',
    { runScripts: 'outside-only' },
  );
  win = dom.window;
  win.eval(readFileSync(BUNDLE, 'utf8'));
  win.eval(readFileSync(UX, 'utf8'));
  ux = win.teaPromptEditorUx;
});

describe('editor no DOM', () => {
  test('render pinta a seção e formata inline', () => {
    ux.definirTexto('~abertura da seção: Persona~\nseja *firme*\n~fim da seção: Persona~');
    const html = editor().innerHTML;
    assert.match(html, /prompt-sec/);
    assert.match(html, /<strong>firme<\/strong>/);
  });

  test('leitura devolve o texto com os marcadores', () => {
    ux.definirTexto('~abertura da seção: A~\nseja *firme*\n~fim da seção: A~');
    assert.equal(
      ux.obterTexto(),
      '~abertura da seção: A~\nseja *firme*\n~fim da seção: A~\n',
    );
  });

  test('roundtrip preserva texto livre antes e depois da seção', () => {
    const src = 'nota solta\n~abertura da seção: A~\ndentro\n~fim da seção: A~\noutra nota';
    ux.definirTexto(src);
    assert.equal(ux.obterTexto(), src + '\n');
  });

  test('linha em branco não some no roundtrip', () => {
    const src = 'um\n\ndois';
    ux.definirTexto(src);
    assert.equal(ux.obterTexto(), src + '\n');
  });

  test('div sem classe criada pelo Enter vira linha', () => {
    ux.definirTexto('primeira');
    const div = win.document.createElement('div');
    div.textContent = 'segunda';
    editor().appendChild(div);
    assert.equal(ux.obterTexto(), 'primeira\n\nsegunda');
  });

  test('negrito digitado é reinterpretado ao renderizar', () => {
    ux.definirTexto('texto sem marca');
    editor().innerHTML = '<div class="pl">bem *forte* aqui</div>';
    ux.renderizar(true);
    assert.match(editor().innerHTML, /<strong>forte<\/strong>/);
    assert.equal(ux.obterTexto(), 'bem *forte* aqui\n');
  });

  test('apagar a linha de abertura tira a pintura', () => {
    ux.definirTexto('~abertura da seção: A~\ndentro\n~fim da seção: A~');
    const marca = editor().querySelector('.pl-marca-abre');
    marca.remove();
    ux.renderizar(true);
    assert.doesNotMatch(editor().innerHTML, /prompt-sec/);
    assert.match(ux.obterTexto(), /dentro/);
  });

  test('recolher/expandir seções', () => {
    ux.definirTexto('~abertura da seção: A~\ndentro\n~fim da seção: A~');
    ux.minimizarSecoes();
    assert.equal(editor().querySelectorAll('.prompt-sec.is-collapsed').length, 1);
    ux.expandirSecoes();
    assert.equal(editor().querySelectorAll('.prompt-sec.is-collapsed').length, 0);
  });

  test('seção recolhida continua recolhida depois de pular linha', () => {
    ux.definirTexto(
      '~abertura da seção: A~\ndentro\n~fim da seção: A~\n' +
        '~abertura da seção: B~\noutra\n~fim da seção: B~',
    );
    ux.minimizarSecoes();
    assert.equal(editor().querySelectorAll('.prompt-sec.is-collapsed').length, 2);

    // é o que o Enter faz: reescreve o texto com a linha nova e re-renderiza
    ux.definirTexto(
      '~abertura da seção: A~\ndentro\n~fim da seção: A~\n\n' +
        '~abertura da seção: B~\noutra\n~fim da seção: B~',
    );
    assert.equal(editor().querySelectorAll('.prompt-sec.is-collapsed').length, 2);
    assert.match(ux.obterTexto(), /~fim da seção: A~\n\n~abertura da seção: B~/);
  });

  test('recolher uma seção não recolhe a outra ao renderizar', () => {
    ux.definirTexto(
      '~abertura da seção: A~\ndentro\n~fim da seção: A~\n' +
        '~abertura da seção: B~\noutra\n~fim da seção: B~',
    );
    ux.expandirSecoes();
    editor().querySelectorAll('.prompt-sec')[1].classList.add('is-collapsed');
    ux.renderizar(true);
    const secs = editor().querySelectorAll('.prompt-sec');
    assert.equal(secs[0].classList.contains('is-collapsed'), false);
    assert.equal(secs[1].classList.contains('is-collapsed'), true);
  });

  test('criar seção deixa o cursor dentro dela, não no topo', () => {
    ux.definirTexto('linha um\nlinha dois\nlinha três');
    const linhas = editor().querySelectorAll('.pl');
    const alvo = linhas[1];

    const sel = win.getSelection();
    const r = win.document.createRange();
    r.setStart(alvo.firstChild, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    editor().focus();

    ux.formatTitulo();

    assert.match(ux.obterTexto(), /~abertura da seção: linha dois~/);
    const pos = win.getSelection();
    const noCaret =
      pos.anchorNode && (pos.anchorNode.nodeType === 1 ? pos.anchorNode : pos.anchorNode.parentElement);
    assert.ok(noCaret, 'caret ficou sem nó');
    assert.ok(noCaret.closest('.prompt-sec'), 'caret saiu da seção criada');
    assert.equal(noCaret.closest('.pl-marca'), null, 'caret parou em cima do marcador');
  });

  test('clicar na cor sem seleção pinta a linha do cursor', () => {
    ux.definirTexto('linha um\nlinha dois');
    const alvo = editor().querySelectorAll('.pl')[1];
    const sel = win.getSelection();
    const r = win.document.createRange();
    r.setStart(alvo.firstChild, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    editor().focus();

    ux.aplicarCor('#c00');

    assert.equal(ux.obterTexto().split('\n')[1], '{cor:#c00}linha dois{/cor}');
    assert.equal(editor().querySelectorAll('.pl-cor').length, 1);
  });

  test('cor não é aplicada na linha de marcador da seção', () => {
    ux.definirTexto('~abertura da seção: A~\ndentro\n~fim da seção: A~');
    const marca = editor().querySelector('.pl-marca-abre');
    const sel = win.getSelection();
    const r = win.document.createRange();
    r.setStart(marca, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    editor().focus();

    ux.aplicarCor('#c00');

    assert.doesNotMatch(ux.obterTexto(), /\{cor:/);
  });

  test('tamanho sem seleção também pinta a linha do cursor', () => {
    ux.definirTexto('uma linha só');
    const alvo = editor().querySelector('.pl');
    const sel = win.getSelection();
    const r = win.document.createRange();
    r.setStart(alvo.firstChild, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    editor().focus();

    ux.aplicarTamanhoSelecao(22);

    assert.match(ux.obterTexto(), /\{tam:22\}uma linha só\{\/tam\}/);
  });

  test('cor que abrange várias linhas pinta todas no editor', () => {
    const src = '{cor:#ff0000}PROIBIDO:\nNUNCA USE GIRIAS!\nsem abreviações{/cor}';
    ux.definirTexto(src);
    assert.equal(editor().querySelectorAll('.pl-cor').length, 3);
    assert.doesNotMatch(editor().textContent, /\{cor:/);
    assert.equal(ux.obterTexto(), src + '\n');
  });

  test('cor pintada sobrevive ao render seguinte', () => {
    ux.definirTexto('texto {cor:#c00}pintado{/cor} aqui');
    const span = editor().querySelector('.pl-cor');
    assert.ok(span, 'span de cor não foi criado');
    assert.equal(span.getAttribute('style'), 'color:#c00');

    // era aqui que se perdia: o render reconstrói o HTML a partir do texto
    ux.renderizar(true);
    assert.ok(editor().querySelector('.pl-cor'));
    assert.match(ux.obterTexto(), /\{cor:#c00\}pintado\{\/cor\}/);
  });

  test('tamanho de trecho sobrevive ao render seguinte', () => {
    ux.definirTexto('linha {tam:24}grande{/tam} fim');
    assert.equal(editor().querySelector('.pl-tam').getAttribute('style'), 'font-size:24px');
    ux.renderizar(true);
    assert.match(ux.obterTexto(), /\{tam:24\}grande\{\/tam\}/);
  });

  test('cliente e servidor geram o mesmo HTML', () => {
    const src = 'livre\n~abertura da seção: A~\n*x* e _y_\n~fim da seção: A~';
    assert.equal(ux.textoParaHtml(src), win.teaPromptMarkup.textoParaHtmlEditor(src + '\n'));
  });

  test('sempre sobra uma linha vazia no fim, fora das seções', () => {
    ux.definirTexto('~abertura da seção: A~\ndentro\n~fim da seção: A~');
    const linhas = editor().querySelectorAll('.pl');
    const ultima = linhas[linhas.length - 1];
    assert.equal(ultima.textContent.trim(), '');
    assert.equal(ultima.closest('.prompt-sec'), null);
  });

  test('linha final não se acumula a cada render', () => {
    ux.definirTexto('uma linha');
    ux.renderizar(true);
    ux.renderizar(true);
    assert.equal(ux.obterTexto(), 'uma linha\n');
  });

  test('caret sai da marcação depois de fechar o negrito', () => {
    ux.definirTexto('bem forte');
    const linha = editor().querySelector('.pl');
    linha.textContent = 'bem *forte*';

    const sel = win.getSelection();
    const r = win.document.createRange();
    const txt = linha.firstChild;
    r.setStart(txt, txt.textContent.length);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    win.document.activeElement === editor() || editor().focus();

    ux.renderizar(false);

    assert.match(editor().innerHTML, /<strong>forte<\/strong>/);
    const pos = win.getSelection();
    const dentroDoNegrito =
      pos.anchorNode &&
      (pos.anchorNode.nodeType === 1 ? pos.anchorNode : pos.anchorNode.parentElement)
        .closest('strong');
    assert.equal(dentroDoNegrito, null);
  });
});

