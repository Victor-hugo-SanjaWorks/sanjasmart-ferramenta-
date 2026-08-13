/**
 * Log de ativações da tool enviar_midia_gatilho (contador + justificativa).
 */
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const ROOT = () =>
  resolve(process.env.MIDIAS_GATILHO_DIR || join(process.cwd(), 'data', 'midias-gatilho'));
const LOG = () => join(ROOT(), 'ativacoes.json');
const MAX_ENTRIES = 500;

export type MidiaAtivacao = {
  id: string;
  midia_id: string;
  midia_nome: string;
  telefone?: string;
  justificativa: string;
  ok: boolean;
  criado_em: string;
};

let fila: Promise<unknown> = Promise.resolve();

function comLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = fila.then(fn, fn);
  fila = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ler(): Promise<MidiaAtivacao[]> {
  await mkdir(ROOT(), { recursive: true });
  try {
    const raw = await readFile(LOG(), 'utf8');
    if (!raw.trim()) return [];
    const data = JSON.parse(raw) as { ativacoes?: MidiaAtivacao[] };
    return Array.isArray(data.ativacoes) ? data.ativacoes : [];
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') return [];
    if (e instanceof SyntaxError) return [];
    throw e;
  }
}

async function gravar(ativacoes: MidiaAtivacao[]): Promise<void> {
  await mkdir(ROOT(), { recursive: true });
  const tmp = join(ROOT(), `ativacoes.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify({ ativacoes }, null, 2), 'utf8');
  await rename(tmp, LOG());
}

export async function registrarAtivacaoMidia(opts: {
  midia_id: string;
  midia_nome: string;
  telefone?: string;
  justificativa?: string;
  ok?: boolean;
}): Promise<MidiaAtivacao> {
  return comLock(async () => {
    const entry: MidiaAtivacao = {
      id: randomUUID(),
      midia_id: String(opts.midia_id || ''),
      midia_nome: String(opts.midia_nome || 'mídia').slice(0, 180),
      telefone: opts.telefone ? String(opts.telefone).slice(0, 40) : undefined,
      justificativa: String(
        opts.justificativa ||
          'A IA entendeu que era a hora certa de enviar esta mídia.',
      ).slice(0, 600),
      ok: opts.ok !== false,
      criado_em: new Date().toISOString(),
    };
    const all = await ler();
    all.unshift(entry);
    await gravar(all.slice(0, MAX_ENTRIES));
    return entry;
  });
}

export async function listarAtivacoesMidia(opts?: {
  midia_id?: string;
  limite?: number;
}): Promise<MidiaAtivacao[]> {
  const all = await ler();
  const filtrado = opts?.midia_id
    ? all.filter((a) => a.midia_id === opts.midia_id)
    : all;
  const lim = Math.min(Math.max(Number(opts?.limite) || 50, 1), 200);
  return filtrado.slice(0, lim);
}

export async function contarAtivacoesPorMidia(): Promise<
  Record<string, { total: number; ultima_justificativa: string; ultima_em: string }>
> {
  const all = await ler();
  const map: Record<
    string,
    { total: number; ultima_justificativa: string; ultima_em: string }
  > = {};
  for (const a of all) {
    if (!a.midia_id) continue;
    if (!map[a.midia_id]) {
      map[a.midia_id] = {
        total: 0,
        ultima_justificativa: a.justificativa,
        ultima_em: a.criado_em,
      };
    }
    map[a.midia_id].total += 1;
  }
  return map;
}
