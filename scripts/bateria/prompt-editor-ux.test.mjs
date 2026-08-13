/**
 * UX do editor de prompt — texto corrido, seção como pintura, phone.html.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const UX = join(ROOT, 'app', 'public', 'prompt-editor-ux.js');
const BUNDLE = join(ROOT, 'app', 'public', 'prompt-markup.js');
const PHONE = join(ROOT, 'app', 'public', 'phone.html');

describe('prompt-editor-ux.js', () => {
  test('arquivo existe', () => {
    assert.equal(existsSync(UX), true);
  });

  const src = () => readFileSync(UX, 'utf8');

  test('exporta/define formatTitulo', () => {
    assert.match(src(), /function\s+formatTitulo|formatTitulo\s*:/);
  });

  test('régua usa repeating-linear-gradient', () => {
    assert.match(src(), /repeating-linear-gradient/);
  });

  test('classe prompt-regua', () => {
    assert.match(src(), /prompt-regua/);
  });

  test('toggleRegua presente', () => {
    assert.match(src(), /toggleRegua/);
  });

  test('LS key tea_prompt_regua', () => {
    assert.match(src(), /tea_prompt_regua/);
  });

  test('render linear: linha .pl e seção .prompt-sec', () => {
    assert.match(src(), /class="pl/);
    assert.match(src(), /prompt-sec/);
  });

  test('não usa mais campos fixos (prompt-bloco / prompt-gap)', () => {
    assert.doesNotMatch(src(), /prompt-bloco/);
    assert.doesNotMatch(src(), /prompt-gap/);
  });

  test('interpreta formatação WhatsApp ao vivo', () => {
    assert.match(src(), /inlineParaHtml/);
    assert.match(src(), /<strong>/);
    assert.match(src(), /renderizar/);
  });

  test('preserva o caret ao reinterpretar', () => {
    assert.match(src(), /posicaoCaret/);
    assert.match(src(), /restaurarCaret/);
  });

  test('seção é criada inserindo marcadores no texto', () => {
    assert.match(src(), /~abertura da seção: /);
    assert.match(src(), /~fim da seção: /);
  });

  test('minimizar/expandir seções', () => {
    assert.match(src(), /minimizarSecoes/);
    assert.match(src(), /expandirSecoes/);
  });

  test('legenda dismissível (LS tea_prompt_legend)', () => {
    assert.match(src(), /tea_prompt_legend/);
    assert.match(src(), /esconderLegenda/);
  });

  test('usa o mesmo codec do servidor quando disponível', () => {
    assert.match(src(), /teaPromptMarkup/);
    assert.match(src(), /textoParaHtmlEditor/);
  });

  test('autocomplete @tool', () => {
    assert.match(src(), /prompt-at-menu|atualizarAt|inserirAt/);
    assert.match(src(), /\/api\/ia\/prompt-tools/);
  });
});

describe('bundle prompt-markup.js (browser)', () => {
  test('bundle existe e expõe teaPromptMarkup', () => {
    assert.equal(existsSync(BUNDLE), true);
    const b = readFileSync(BUNDLE, 'utf8');
    assert.match(b, /var teaPromptMarkup/);
  });

  test('bundle roda no browser e gera o HTML linear', () => {
    const ctx = createContext({ window: {} });
    runInContext(readFileSync(BUNDLE, 'utf8'), ctx);
    const m = ctx.teaPromptMarkup;
    const out = m.textoParaHtmlEditor('~abertura da seção: A~\ntem *forte*\n~fim da seção: A~');
    assert.match(out, /prompt-sec/);
    assert.match(out, /<strong>forte<\/strong>/);
    assert.doesNotMatch(out, /prompt-bloco/);
  });

  test('bundle está sincronizado com o src (rode npm run build:markup)', async () => {
    const ctx = createContext({ window: {} });
    runInContext(readFileSync(BUNDLE, 'utf8'), ctx);
    const dist = await import('../../app/dist/prompt-markup.js');
    const casos = [
      'texto solto',
      '~abertura da seção: A~\ncom *forte* e _leve_\n~fim da seção: A~',
      '## Legado\ncorpo',
    ];
    for (const caso of casos) {
      assert.equal(
        ctx.teaPromptMarkup.textoParaHtmlEditor(caso),
        dist.textoParaHtmlEditor(caso),
        'bundle desatualizado para: ' + caso,
      );
    }
  });
});

describe('phone.html toolbar / midias', () => {
  test('phone.html existe', () => {
    assert.equal(existsSync(PHONE), true);
  });

  const html = () => readFileSync(PHONE, 'utf8');

  test('data-view midias', () => {
    assert.match(html(), /data-view=["']midias["']/);
  });

  test('botão Seção', () => {
    assert.match(html(), />Seção</);
    assert.match(html(), /formatTitulo\(\)/);
  });

  test('sem botão Sub confuso', () => {
    assert.doesNotMatch(html(), />Sub</);
  });

  test('botão Régua ou Linhas guia', () => {
    assert.match(html(), /Régua|Linhas guia|toggleRegua/);
  });

  test('selects com label Trecho/Zoom', () => {
    assert.match(html(), /pte-select-cap/);
    assert.match(html(), />Trecho</);
    assert.match(html(), />Zoom</);
  });

  test('CSS da pintura de seção e das linhas', () => {
    assert.match(html(), /#prompt-editor \.prompt-sec \{/);
    assert.match(html(), /#prompt-editor \.pl \{/);
    assert.match(html(), /pl-marca/);
  });

  test('CSS de negrito/itálico/tachado no editor', () => {
    assert.match(html(), /#prompt-editor strong/);
    assert.match(html(), /#prompt-editor em/);
    assert.match(html(), /#prompt-editor s \{/);
  });

  test('CSS e menu de @tool-', () => {
    assert.match(html(), /\.pl-tool/);
    assert.match(html(), /prompt-at-menu|prompt-at-item/);
  });

  test('seção recolhida esconde as linhas de dentro', () => {
    assert.match(html(), /prompt-sec\.is-collapsed[\s\S]{0,120}display:\s*none/);
  });

  test('negrito da toolbar insere marcador WhatsApp', () => {
    assert.match(html(), /PROMPT_MARCA_CMD/);
    assert.match(html(), /envolverInline/);
  });

  test('legenda UX explica texto livre + marcadores', () => {
    assert.match(html(), /prompt-ux-legend/);
    assert.match(html(), /texto livre/i);
    assert.match(html(), /~abertura da seção/);
  });

  test('carrega o bundle do markup antes do editor', () => {
    const h = html();
    assert.ok(h.indexOf('prompt-markup.js') < h.indexOf('prompt-editor-ux.js'));
  });

  test('selects forçam cor legível', () => {
    assert.match(html(), /-webkit-text-fill-color:\s*#111827/);
  });
});
