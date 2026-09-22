/**
 * Prompt TEA — PG (texto canônico com marcadores + HTML do editor).
 */
import pg from 'pg';
import { createHash } from 'node:crypto';
import { config } from './config.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool } from './pg-pool.js';
import {
  htmlEditorParaTexto,
  markupParaLlm,
  normalizarMarkup,
  textoParaHtmlEditor,
} from './prompt-markup.js';


const PROMPT_PADRAO = ``;

export type PromptPersistido = {
  texto: string;
  html: string;
};

/**
 * Aba antiga salvando por cima de uma versao mais nova apagava o prompt inteiro.
 * Quem salva informa a versao que carregou; se nao bater, o save e recusado.
 */
export class ConflitoPromptError extends Error {
  readonly versaoAtual: string;
  readonly textoAtual: string;

  constructor(versaoAtual: string, textoAtual: string) {
    super('Prompt mudou desde que esta tela carregou.');
    this.name = 'ConflitoPromptError';
    this.versaoAtual = versaoAtual;
    this.textoAtual = textoAtual;
  }
}

/**
 * Autosave a cada 450ms sem historico: uma delecao acidental virava definitiva.
 * Save que apaga a maior parte do prompt so passa com permitirEncolher.
 */
export class EncolhimentoPromptError extends Error {
  readonly tamanhoAtual: number;
  readonly tamanhoNovo: number;
  readonly textoAtual: string;

  constructor(tamanhoAtual: number, tamanhoNovo: number, textoAtual: string) {
    super('Este salvamento apagaria a maior parte do prompt.');
    this.name = 'EncolhimentoPromptError';
    this.tamanhoAtual = tamanhoAtual;
    this.tamanhoNovo = tamanhoNovo;
    this.textoAtual = textoAtual;
  }
}

const MIN_PARA_PROTEGER = 500;
const FRACAO_MINIMA = 0.7;

export function encolhimentoSuspeito(atual: string, novo: string): boolean {
  const a = String(atual || '').length;
  const n = String(novo || '').length;
  if (a < MIN_PARA_PROTEGER) return false;
  return n < a * FRACAO_MINIMA;
}

/** HTML do editor → texto canônico (~abertura…~ + WhatsApp). */
function htmlParaTexto(html: string): string {
  return htmlEditorParaTexto(html);
}

export function promptHash(texto: string): string {
  return createHash('sha256').update(String(texto || ''), 'utf8').digest('hex');
}

export async function inicializarBancoPrompt(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracao (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS prompt_versoes (
      id BIGSERIAL PRIMARY KEY,
      texto TEXT NOT NULL,
      html TEXT,
      hash TEXT NOT NULL,
      origem TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS prompt_versoes_criado_idx ON prompt_versoes (criado_em DESC)',
  );

  let promptInicial = PROMPT_PADRAO;
  try {
    const caminhosPossiveis = [
      resolve(process.cwd(), '../prompt-cliente.txt'),
      resolve(process.cwd(), './prompt-cliente.txt'),
      resolve(process.cwd(), './data/prompt-cliente.txt'),
    ];
    for (const caminho of caminhosPossiveis) {
      if (existsSync(caminho)) {
        promptInicial = normalizarMarkup(readFileSync(caminho, 'utf-8'));
        console.log(`[prompt] Carregando prompt a partir de: ${caminho}`);
        break;
      }
    }
  } catch (err) {
    console.error('[prompt] Erro ao ler prompt-cliente.txt:', err);
  }

  const existe = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', [
    'prompt_sistema',
  ]);
  if (existe.rowCount === 0) {
    await pool.query('INSERT INTO configuracao (chave, valor) VALUES ($1, $2)', [
      'prompt_sistema',
      promptInicial,
    ]);
  }

  const existeHtml = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', [
    'prompt_sistema_html',
  ]);
  if (existeHtml.rowCount === 0 && promptInicial) {
    const htmlSeed = textoParaHtmlEditor(promptInicial);
    await pool.query('INSERT INTO configuracao (chave, valor) VALUES ($1, $2)', [
      'prompt_sistema_html',
      htmlSeed,
    ]);
  }

  const atual = await obterPromptCompleto();
  const arquivoEhSam = /Sanja Smart/i.test(promptInicial) && /Aqui é o San/i.test(promptInicial);
  const bancoEhSam = /Aqui é o San, da Sanja Smart/i.test(atual.texto || '');
  if (arquivoEhSam && !bancoEhSam) {
    console.log('[prompt] Substituindo prompt residual pelo roteiro San / Sanja Smart');
    await salvarPrompt(promptInicial, textoParaHtmlEditor(promptInicial), 'boot-sanjasmart');
  } else if (atual.texto) {
    await registrarVersaoPrompt(atual.texto, atual.html, 'boot').catch(() => {});
  }
}

/** Texto limpo usado no system do agente (sem marcadores de seção). */
export async function obterPromptBruto(): Promise<string> {
  const res = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', [
    'prompt_sistema',
  ]);
  const bruto = (res.rows[0]?.valor as string) ?? PROMPT_PADRAO;
  return markupParaLlm(bruto);
}

export async function obterPromptCompleto(): Promise<PromptPersistido> {
  const res = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', [
    'prompt_sistema',
  ]);
  const texto = normalizarMarkup((res.rows[0]?.valor as string) ?? PROMPT_PADRAO);
  const htmlRes = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', [
    'prompt_sistema_html',
  ]);
  const htmlSalvo = (htmlRes.rows[0]?.valor as string) || '';
  const html = textoParaHtmlEditor(texto) || htmlSalvo || `<div></div>`;
  return { texto, html };
}

export type VersaoPrompt = {
  id: number;
  hash: string;
  origem: string;
  tamanho: number;
  criado_em: string;
};

/** Snapshot de cada texto salvo (dedup por hash), com retencao das ultimas 300. */
export async function registrarVersaoPrompt(
  texto: string,
  html: string,
  origem: string,
): Promise<void> {
  const hash = promptHash(texto);
  const ultimo = await pool.query('SELECT hash FROM prompt_versoes ORDER BY id DESC LIMIT 1');
  if (ultimo.rows[0]?.hash === hash) return;
  await pool.query(
    'INSERT INTO prompt_versoes (texto, html, hash, origem) VALUES ($1, $2, $3, $4)',
    [texto, html, hash, origem],
  );
  await pool.query(
    'DELETE FROM prompt_versoes WHERE id < (SELECT MIN(id) FROM (SELECT id FROM prompt_versoes ORDER BY id DESC LIMIT 300) t)',
  );
}

export async function listarVersoesPrompt(limite = 40): Promise<VersaoPrompt[]> {
  const res = await pool.query(
    `SELECT id, hash, COALESCE(origem, '') origem, length(texto) tamanho, criado_em
     FROM prompt_versoes ORDER BY id DESC LIMIT $1`,
    [Math.min(Math.max(Number(limite) || 40, 1), 300)],
  );
  return res.rows as VersaoPrompt[];
}

export async function obterVersaoPrompt(
  id: number,
): Promise<{ texto: string; html: string } | null> {
  const res = await pool.query('SELECT texto, html FROM prompt_versoes WHERE id = $1', [id]);
  if (!res.rowCount) return null;
  return { texto: res.rows[0].texto as string, html: (res.rows[0].html as string) || '' };
}

export async function salvarPrompt(
  prompt: string,
  html?: string,
  origem = 'salvar',
): Promise<void> {
  const texto = normalizarMarkup(String(prompt || '').trim());
  if (!texto) throw new Error('Prompt vazio nao permitido');
  await registrarVersaoPrompt(texto, String(html || ''), origem).catch((err) => {
    console.error('[prompt] falha ao registrar versao:', err);
  });
  await pool.query(
    `INSERT INTO configuracao (chave, valor, atualizado_em)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = $2, atualizado_em = NOW()`,
    ['prompt_sistema', texto],
  );
  const htmlFinal = html != null && String(html).trim() ? String(html) : textoParaHtmlEditor(texto);
  await pool.query(
    `INSERT INTO configuracao (chave, valor, atualizado_em)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = $2, atualizado_em = NOW()`,
    ['prompt_sistema_html', htmlFinal],
  );
}

/** Hash do texto canonico salvo — usado como versao no save otimista. */
export async function versaoPromptAtual(): Promise<string> {
  const { texto } = await obterPromptCompleto();
  return promptHash(texto);
}

/** Sem base informada, salva (compat). Com base, so salva se ninguem gravou no meio. */
export function conflitoDeVersao(
  baseVersao: string | undefined | null,
  versaoAtual: string,
): boolean {
  const base = String(baseVersao || '').trim();
  if (!base) return false;
  return base !== versaoAtual;
}

export async function salvarPromptHtmlETexto(opts: {
  html?: string;
  texto?: string;
  baseVersao?: string;
  permitirEncolher?: boolean;
  origem?: string;
}): Promise<PromptPersistido & { versao: string }> {
  let texto = String(opts.texto || '').trim();
  const html = String(opts.html || '');
  if (!texto && html) texto = htmlParaTexto(html);
  if (!texto) throw new Error('Prompt vazio nao permitido');
  texto = normalizarMarkup(texto);

  const atual = await obterPromptCompleto();
  if (opts.baseVersao) {
    const versaoAtual = promptHash(atual.texto);
    if (conflitoDeVersao(opts.baseVersao, versaoAtual)) {
      throw new ConflitoPromptError(versaoAtual, atual.texto);
    }
  }
  if (!opts.permitirEncolher && encolhimentoSuspeito(atual.texto, texto)) {
    throw new EncolhimentoPromptError(atual.texto.length, texto.length, atual.texto);
  }

  const htmlFinal = html.trim() ? html : textoParaHtmlEditor(texto);
  await salvarPrompt(texto, htmlFinal, opts.origem || 'editor');
  return { texto, html: htmlFinal, versao: promptHash(texto) };
}

export { htmlParaTexto, markupParaLlm, textoParaHtmlEditor, normalizarMarkup };
