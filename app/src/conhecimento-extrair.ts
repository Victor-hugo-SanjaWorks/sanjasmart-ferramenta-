/**
 * Extrai texto de PDF, Word, TXT, MD e CSV para indexar no RAG.
 * Mantém parsers leves (pdf-parse + unzip do sistema) sem inflar deps.
 */
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pdfParse from 'pdf-parse';

const execFileAsync = promisify(execFile);

const MIME_OK = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/csv',
]);

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
};

export function mimePorNome(nome: string, mimeHint = ''): string {
  const hint = (mimeHint || '').toLowerCase().split(';')[0].trim();
  if (hint && MIME_OK.has(hint)) return hint;
  const m = /\.([a-z0-9]+)$/i.exec(nome);
  const ext = m ? `.${m[1].toLowerCase()}` : '';
  return EXT_MIME[ext] || '';
}

export function extensaoPermitida(nome: string, mime: string): boolean {
  return Boolean(mimePorNome(nome, mime));
}

function limparXmlWord(xml: string): string {
  return xml
    .replace(/<w:tab\b[^/]*\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function extrairWordXml(buf: Buffer): Promise<string> {
  const tmp = join(tmpdir(), `conhec-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await writeFile(tmp, buf);
  try {
    const { stdout } = await execFileAsync('unzip', ['-p', tmp, 'word/document.xml'], {
      maxBuffer: 25 * 1024 * 1024,
      encoding: 'utf8',
    });
    return limparXmlWord(String(stdout || ''));
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

export async function extrairTextoArquivo(
  buf: Buffer,
  nome: string,
  mimeHint = '',
): Promise<string> {
  const mime = mimePorNome(nome, mimeHint);
  if (!mime) throw new Error('Formato nao suportado (use PDF, DOCX, TXT, MD ou CSV)');
  if (mime === 'application/msword') {
    throw new Error('Arquivo .doc antigo nao suportado — salve como .docx');
  }
  if (mime === 'application/pdf') {
    const r = await pdfParse(buf);
    return String(r.text || '').trim();
  }
  if (mime.includes('wordprocessingml')) {
    return extrairWordXml(buf);
  }
  return buf.toString('utf8').trim();
}

/** Fatia texto em trechos ~700 chars (mesmo criterio do indexar-rag.mjs). */
export function fatiarTexto(texto: string, alvo = 700): string[] {
  const paragrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+\n/g, '\n').trim())
    .filter((p) => p.length > 0);
  const trechos: string[] = [];
  let atual = '';
  for (const p of paragrafos) {
    if ((atual + '\n\n' + p).length > alvo && atual) {
      trechos.push(atual.trim());
      atual = p;
    } else {
      atual = atual ? `${atual}\n\n${p}` : p;
    }
  }
  if (atual.trim()) trechos.push(atual.trim());
  return trechos;
}
