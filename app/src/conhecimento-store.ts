/**
 * Persistencia local dos docs de conhecimento (area Prompt).
 * Guarda arquivo + manifesto em data/conhecimento/ e indexa no Qdrant.
 */
import { mkdir, writeFile, readFile, unlink, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { extrairTextoArquivo, fatiarTexto, mimePorNome } from './conhecimento-extrair.js';
import { indexarConhecimentoComFonte, removerConhecimentoPorFonte } from './rag-minasplaca.js';

const ROOT = resolve(process.cwd(), 'data', 'conhecimento');
const MANIFEST = join(ROOT, 'manifest.json');
const MAX_BYTES = 12 * 1024 * 1024;

export type DocConhecimento = {
  id: string;
  nome: string;
  mime: string;
  tamanho: number;
  trechos: number;
  criado_em: string;
  arquivo: string;
};

async function garantirDir(): Promise<void> {
  await mkdir(ROOT, { recursive: true });
}

async function lerManifest(): Promise<DocConhecimento[]> {
  await garantirDir();
  try {
    const raw = await readFile(MANIFEST, 'utf8');
    const data = JSON.parse(raw) as { docs?: DocConhecimento[] };
    return Array.isArray(data.docs) ? data.docs : [];
  } catch {
    return [];
  }
}

async function salvarManifest(docs: DocConhecimento[]): Promise<void> {
  await garantirDir();
  await writeFile(MANIFEST, JSON.stringify({ docs }, null, 2), 'utf8');
}

export async function listarDocsConhecimento(): Promise<DocConhecimento[]> {
  return lerManifest();
}

export async function salvarDocConhecimento(opts: {
  nome: string;
  mime?: string;
  data_url?: string;
  base64?: string;
}): Promise<DocConhecimento> {
  const nome = String(opts.nome || 'arquivo').replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
  const mime = mimePorNome(nome, opts.mime || '');
  if (!mime) throw new Error('Formato nao suportado (PDF, DOCX, TXT, MD, CSV)');

  let b64 = String(opts.base64 || '').trim();
  if (!b64 && opts.data_url) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(String(opts.data_url).trim());
    if (!m) throw new Error('Envie data URL base64 valida');
    b64 = m[2];
  }
  if (!b64) throw new Error('Arquivo vazio');

  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new Error('Arquivo vazio');
  if (buf.length > MAX_BYTES) throw new Error('Arquivo maior que 12 MB');

  const texto = await extrairTextoArquivo(buf, nome, mime);
  if (!texto || texto.length < 20) {
    throw new Error('Nao foi possivel extrair texto util deste arquivo');
  }

  const id = randomUUID();
  const ext = (/\.[a-z0-9]+$/i.exec(nome) || ['.bin'])[0].toLowerCase();
  const arquivo = `${id}${ext}`;
  await garantirDir();
  await writeFile(join(ROOT, arquivo), buf);

  const fonte = `upload:${id}`;
  const trechos = fatiarTexto(texto).map((t) => `[${nome}]\n${t}`);
  await indexarConhecimentoComFonte(trechos, fonte);

  const doc: DocConhecimento = {
    id,
    nome,
    mime,
    tamanho: buf.length,
    trechos: trechos.length,
    criado_em: new Date().toISOString(),
    arquivo,
  };
  const docs = await lerManifest();
  docs.unshift(doc);
  await salvarManifest(docs);
  return doc;
}

export async function removerDocConhecimento(id: string): Promise<void> {
  const docs = await lerManifest();
  const idx = docs.findIndex((d) => d.id === id);
  if (idx < 0) throw new Error('Documento nao encontrado');
  const doc = docs[idx];
  await removerConhecimentoPorFonte(`upload:${id}`).catch(() => undefined);
  await unlink(join(ROOT, doc.arquivo)).catch(() => undefined);
  docs.splice(idx, 1);
  await salvarManifest(docs);
}

/** Limpeza opcional de arquivos orfaos (nao usados no fluxo principal). */
export async function listarArquivosDisco(): Promise<string[]> {
  await garantirDir();
  return readdir(ROOT);
}
