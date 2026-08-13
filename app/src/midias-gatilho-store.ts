/**
 * Persistência local de mídias-gatilho (área Mídias).
 * Manifesto + arquivos em data/midias-gatilho/ (mesmo padrão do conhecimento).
 *
 * - Write atômico (tmp + rename)
 * - Fila in-process (evita race no manifesto)
 * - Replace de arquivo mantém o mesmo id (menções no prompt continuam válidas)
 */
import { mkdir, writeFile, readFile, unlink, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const ROOT = () =>
  resolve(process.env.MIDIAS_GATILHO_DIR || join(process.cwd(), 'data', 'midias-gatilho'));
const MANIFEST = () => join(ROOT(), 'manifest.json');
/** Limite do arquivo decodificado (bytes reais). */
export const MAX_BYTES = 25 * 1024 * 1024;
/**
 * Com upload via JSON+base64 o body HTTP cresce ~33%.
 * Use este teto no front até haver multipart.
 */
export const MAX_BYTES_UPLOAD_JSON = Math.floor((26 * 1024 * 1024) / 1.37);

export type TipoMidiaGatilho = 'image' | 'video' | 'audio' | 'document';

export type MidiaGatilho = {
  id: string;
  nome: string;
  prompt_gatilho: string;
  tipo: TipoMidiaGatilho;
  mime: string;
  arquivo: string;
  legenda: string;
  ativo: boolean;
  criado_em: string;
};

/** Resumo enxuto para tool / system (sem path de disco). */
export type MidiaGatilhoTool = {
  id: string;
  nome: string;
  prompt_gatilho: string;
  tipo: TipoMidiaGatilho;
  mime: string;
  legenda: string;
};

/** Fila serializa RMW do manifesto (mesmo processo). */
let filaManifest: Promise<unknown> = Promise.resolve();

function comLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = filaManifest.then(fn, fn);
  filaManifest = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function garantirDir(): Promise<void> {
  await mkdir(ROOT(), { recursive: true });
}

async function lerManifest(): Promise<MidiaGatilho[]> {
  await garantirDir();
  let raw: string;
  try {
    raw = await readFile(MANIFEST(), 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') return [];
    throw e;
  }
  if (!raw.trim()) return [];
  let data: { midias?: MidiaGatilho[] };
  try {
    data = JSON.parse(raw) as { midias?: MidiaGatilho[] };
  } catch {
    throw new Error(
      'Manifest midias-gatilho corrompido — recuse sobrescrever; restaure backup',
    );
  }
  if (!Array.isArray(data.midias)) {
    throw new Error('Manifest midias-gatilho invalido: campo midias nao e array');
  }
  return data.midias;
}

async function salvarManifest(midias: MidiaGatilho[]): Promise<void> {
  await garantirDir();
  const tmp = join(ROOT(), `manifest.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify({ midias }, null, 2), 'utf8');
  await rename(tmp, MANIFEST());
}

function inferirTipo(mime: string, nome: string): TipoMidiaGatilho {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  const ext = (/\.([a-z0-9]+)$/i.exec(nome) || [])[1]?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'ogg', 'wav', 'm4a', 'aac', 'opus'].includes(ext)) return 'audio';
  return 'document';
}

function mimePorNome(nome: string, mimeHint?: string): string {
  if (mimeHint && mimeHint.includes('/')) return mimeHint.trim();
  const ext = (/\.([a-z0-9]+)$/i.exec(nome) || [])[1]?.toLowerCase() || '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

function extDeMime(mime: string, nome: string): string {
  const doNome = (/\.[a-z0-9]+$/i.exec(nome) || [])[0];
  if (doNome) return doNome.toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'application/pdf': '.pdf',
  };
  return map[mime] || '.bin';
}

function sanitizarNome(nome: string): string {
  return String(nome || 'arquivo')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .slice(0, 180);
}

function decodificarPayload(opts: {
  data_url?: string;
  base64?: string;
}): { buf: Buffer; mimeFromData: string } {
  let b64 = String(opts.base64 || '').trim();
  let mimeFromData = '';
  if (!b64 && opts.data_url) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(String(opts.data_url).trim());
    if (!m) throw new Error('Envie data URL base64 valida');
    mimeFromData = m[1];
    b64 = m[2];
  }
  if (!b64) throw new Error('Arquivo vazio');
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new Error('Arquivo vazio');
  if (buf.length > MAX_BYTES) throw new Error('Arquivo maior que 25 MB');
  return { buf, mimeFromData };
}

export async function listarMidiasGatilho(): Promise<MidiaGatilho[]> {
  return lerManifest();
}

export async function listarAtivosParaTool(): Promise<MidiaGatilhoTool[]> {
  const midias = await lerManifest();
  return midias
    .filter((m) => m.ativo !== false)
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      prompt_gatilho: m.prompt_gatilho,
      tipo: m.tipo,
      mime: m.mime,
      legenda: m.legenda || '',
    }));
}

export async function obterMidiaPorId(id: string): Promise<MidiaGatilho | null> {
  const midias = await lerManifest();
  return midias.find((m) => m.id === id) || null;
}

/** Slug estável para @tool-midia-… (e-mail com @ não usa isso). */
export function slugMidiaTool(nome: string): string {
  const s = String(nome || 'material')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return s || 'material';
}

export function tokenMidiaTool(nome: string): string {
  return `@tool-midia-${slugMidiaTool(nome)}`;
}

/** Texto para colar no prompt: menção colorida + contexto. */
export function formatarMencaoTool(m: {
  id: string;
  nome: string;
  prompt_gatilho?: string;
  tipo?: string;
}): string {
  const quando = String(m.prompt_gatilho || '')
    .trim()
    .replace(/"/g, "'") || 'fizer sentido no papo';
  const token = tokenMidiaTool(m.nome);
  return (
    `Toda vez que a pessoa chegar em algo como “${quando}”, dispare ` +
    `@tool-enviar_midia_gatilho com ${token} e só confirme no chat depois do envio.`
  );
}

/** Atalho curto = só o token (pinta no editor). */
export function formatarChipTool(m: { id: string; nome: string }): string {
  return tokenMidiaTool(m.nome);
}

/** Bloco genérico com exemplos de menção. */
export function formatarBlocoToolGenerico(): string {
  return [
    '~abertura da seção: Mídias e gatilhos~',
    'Quando o papo pedir aula, flyer ou vídeo, use @tool-enviar_midia_gatilho com a mídia certa (@tool-midia-…).',
    'Só diga que enviou depois que o envio acontecer de verdade.',
    '~fim da seção: Mídias e gatilhos~',
  ].join('\n');
}

/** Preview lúdico do que acontece ao disparar (UI / tooltip). */
export function previewDisparoTool(m: {
  nome?: string;
  prompt_gatilho?: string;
  tipo?: string;
}): string {
  const nome = String(m.nome || 'esse material').trim() || 'esse material';
  const quando = String(m.prompt_gatilho || 'fizer sentido').trim() || 'fizer sentido';
  return (
    `Quando o lead disser algo como “${quando}”, a Maria Eduarda manda “${nome}” no WhatsApp ` +
    `e só então comenta — como passar o material na mão.`
  );
}

/** fileName com extensão para Evolution/WhatsApp. */
export function nomeArquivoEnvio(midia: Pick<MidiaGatilho, 'nome' | 'arquivo' | 'mime'>): string {
  const nome = String(midia.nome || 'arquivo').trim() || 'arquivo';
  if (/\.[a-z0-9]+$/i.test(nome)) return nome;
  const extArq = (/\.[a-z0-9]+$/i.exec(midia.arquivo || '') || [])[0];
  if (extArq) return nome + extArq.toLowerCase();
  return nome + extDeMime(midia.mime || '', nome);
}

export async function salvarMidiaGatilho(opts: {
  nome: string;
  prompt_gatilho?: string;
  tipo?: TipoMidiaGatilho;
  mime?: string;
  legenda?: string;
  ativo?: boolean;
  data_url?: string;
  base64?: string;
}): Promise<MidiaGatilho> {
  return comLock(async () => {
    const nome = sanitizarNome(opts.nome);
    const prompt_gatilho = String(opts.prompt_gatilho || '').trim();
    if (!prompt_gatilho) {
      throw new Error('Informe o prompt gatilho (quando a IA deve disparar esta midia)');
    }

    const { buf, mimeFromData } = decodificarPayload(opts);
    const mime = mimePorNome(nome, opts.mime || mimeFromData);
    const tipo = opts.tipo || inferirTipo(mime, nome);
    const id = randomUUID();
    const arquivo = `${id}${extDeMime(mime, nome)}`;

    await garantirDir();
    await writeFile(join(ROOT(), arquivo), buf);

    const midia: MidiaGatilho = {
      id,
      nome,
      prompt_gatilho,
      tipo,
      mime,
      arquivo,
      legenda: String(opts.legenda || '').trim(),
      ativo: opts.ativo !== false,
      criado_em: new Date().toISOString(),
    };

    const midias = await lerManifest();
    midias.unshift(midia);
    await salvarManifest(midias);
    return midia;
  });
}

/** Troca bytes mantendo o mesmo id (menções no prompt não quebram). */
export async function substituirArquivoMidia(
  id: string,
  opts: {
    nome?: string;
    prompt_gatilho?: string;
    tipo?: TipoMidiaGatilho;
    mime?: string;
    legenda?: string;
    ativo?: boolean;
    data_url?: string;
    base64?: string;
  },
): Promise<MidiaGatilho> {
  return comLock(async () => {
    const midias = await lerManifest();
    const idx = midias.findIndex((m) => m.id === id);
    if (idx < 0) throw new Error('Midia nao encontrada');

    const atual = midias[idx];
    const { buf, mimeFromData } = decodificarPayload(opts);
    const nome = opts.nome != null ? sanitizarNome(opts.nome) : atual.nome;
    const prompt_gatilho =
      opts.prompt_gatilho != null
        ? String(opts.prompt_gatilho).trim()
        : atual.prompt_gatilho;
    if (!prompt_gatilho) {
      throw new Error('Informe o prompt gatilho (quando a IA deve disparar esta midia)');
    }

    const mime = mimePorNome(nome, opts.mime || mimeFromData);
    const tipo = opts.tipo || inferirTipo(mime, nome);
    const arquivo = `${id}${extDeMime(mime, nome)}`;

    await garantirDir();
    await writeFile(join(ROOT(), arquivo), buf);
    if (atual.arquivo && atual.arquivo !== arquivo) {
      await unlink(join(ROOT(), atual.arquivo)).catch(() => undefined);
    }

    const next: MidiaGatilho = {
      ...atual,
      nome,
      prompt_gatilho,
      tipo,
      mime,
      arquivo,
      legenda: opts.legenda != null ? String(opts.legenda).trim() : atual.legenda,
      ativo: opts.ativo != null ? !!opts.ativo : atual.ativo,
    };
    midias[idx] = next;
    await salvarManifest(midias);
    return next;
  });
}

export async function atualizarMidiaGatilho(
  id: string,
  patch: {
    nome?: string;
    prompt_gatilho?: string;
    tipo?: TipoMidiaGatilho;
    legenda?: string;
    ativo?: boolean;
  },
): Promise<MidiaGatilho> {
  return comLock(async () => {
    const midias = await lerManifest();
    const idx = midias.findIndex((m) => m.id === id);
    if (idx < 0) throw new Error('Midia nao encontrada');
    if (patch.prompt_gatilho != null && !String(patch.prompt_gatilho).trim()) {
      throw new Error('Informe o prompt gatilho (quando a IA deve disparar esta midia)');
    }
    const atual = midias[idx];
    let tipo = patch.tipo || atual.tipo;
    if (patch.tipo && patch.tipo !== atual.tipo) {
      const coerente = inferirTipo(atual.mime, atual.nome);
      if (patch.tipo !== coerente) {
        throw new Error(
          `Tipo "${patch.tipo}" nao bate com mime ${atual.mime} (esperado ${coerente}). Troque o arquivo.`,
        );
      }
      tipo = patch.tipo;
    }
    const next: MidiaGatilho = {
      ...atual,
      nome: patch.nome != null ? sanitizarNome(patch.nome) : atual.nome,
      prompt_gatilho:
        patch.prompt_gatilho != null
          ? String(patch.prompt_gatilho).trim()
          : atual.prompt_gatilho,
      tipo,
      legenda: patch.legenda != null ? String(patch.legenda).trim() : atual.legenda,
      ativo: patch.ativo != null ? !!patch.ativo : atual.ativo,
    };
    midias[idx] = next;
    await salvarManifest(midias);
    return next;
  });
}

export async function removerMidiaGatilho(id: string): Promise<void> {
  return comLock(async () => {
    const midias = await lerManifest();
    const idx = midias.findIndex((m) => m.id === id);
    if (idx < 0) throw new Error('Midia nao encontrada');
    const midia = midias[idx];
    midias.splice(idx, 1);
    await salvarManifest(midias);
    await unlink(join(ROOT(), midia.arquivo)).catch(() => undefined);
  });
}

export function caminhoArquivoMidia(midia: MidiaGatilho): string {
  return join(ROOT(), midia.arquivo);
}

/** PNG 1×1 — placeholder para demos (UI + listagem; troque o arquivo real depois). */
const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Cria mídias de exemplo (vídeo/aula) se ainda não existirem pelo nome.
 * Idempotente — seguro chamar no boot.
 */
export async function garantirMidiasExemplo(): Promise<MidiaGatilho[]> {
  const desejadas = [
    {
      nome: 'Video Aula Experimental',
      prompt_gatilho: 'quero ver a aula experimental ou o vídeo da aula',
      tipo: 'video' as const,
      mime: 'video/mp4',
      legenda: 'Exemplo — troque pelo vídeo real na aba Gatilhos',
      arquivoNome: 'video_aula_experimental.mp4',
    },
    {
      nome: 'Video Apresentacao TEA',
      prompt_gatilho: 'pedir a apresentação da escola ou o vídeo institucional',
      tipo: 'video' as const,
      mime: 'video/mp4',
      legenda: 'Exemplo — edite ou apague quando quiser',
      arquivoNome: 'video_apresentacao_tea.mp4',
    },
  ];

  return comLock(async () => {
    const midias = await lerManifest();
    const criadas: MidiaGatilho[] = [];
    await garantirDir();
    for (const d of desejadas) {
      if (midias.some((m) => m.nome.toLowerCase() === d.nome.toLowerCase())) continue;
      const id = randomUUID();
      const arquivo = `${id}.mp4`;
      const buf = Buffer.from(PNG_1X1_B64, 'base64');
      await writeFile(join(ROOT(), arquivo), buf);
      const midia: MidiaGatilho = {
        id,
        nome: d.nome,
        prompt_gatilho: d.prompt_gatilho,
        tipo: d.tipo,
        mime: d.mime,
        arquivo,
        legenda: d.legenda,
        ativo: true,
        criado_em: new Date().toISOString(),
      };
      midias.unshift(midia);
      criadas.push(midia);
    }
    if (criadas.length) await salvarManifest(midias);
    return criadas;
  });
}
