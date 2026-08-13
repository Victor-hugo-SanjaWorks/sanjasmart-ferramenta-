/**
 * Mapa de secoes de um texto de alvo (F4.4).
 * Motivo: agente precisa navegar prompts longos por titulo, nao so por offset cego.
 * Heuristica: markdown #, ALL CAPS, === ; fallback em janelas se nao houver heading.
 */
export type SecaoAlvo = {
  id: string;
  titulo: string;
  inicio: number;
  fim: number;
  chars: number;
  preview: string;
};

const RE_MD = /^(#{1,3})\s+(.+)$/;
const RE_SEP = /^={3,}\s*(.+?)\s*={3,}\s*$/;
const RE_CAPS = /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 \/\-]{7,})$/;

function slug(titulo: string, i: number): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return (base || 'secao') + '-' + i;
}

function tituloNaLinha(linha: string): string | null {
  const t = linha.trim();
  if (!t) return null;
  const md = t.match(RE_MD);
  if (md) return md[2].trim();
  const sep = t.match(RE_SEP);
  if (sep) return sep[1].trim();
  if (RE_CAPS.test(t) && !/[.!?]$/.test(t)) return t;
  return null;
}

/** Detecta headings; se nenhum, fatia em janelas de janelaChars. */
export function mapearSecoes(
  texto: string,
  opts?: { maxPreview?: number; janelaFallback?: number },
): SecaoAlvo[] {
  const raw = String(texto ?? '');
  const maxPreview = Math.max(40, Number(opts?.maxPreview) || 120);
  const janela = Math.max(500, Number(opts?.janelaFallback) || 4000);
  if (!raw.trim()) return [];

  const lines = raw.split('\n');
  const heads: { titulo: string; inicio: number }[] = [];
  let pos = 0;
  for (const line of lines) {
    const tit = tituloNaLinha(line);
    if (tit) heads.push({ titulo: tit, inicio: pos });
    pos += line.length + 1;
  }

  if (heads.length === 0) {
    const out: SecaoAlvo[] = [];
    for (let i = 0, n = 0; i < raw.length; i += janela, n++) {
      const fim = Math.min(raw.length, i + janela);
      const fatia = raw.slice(i, fim);
      out.push({
        id: `janela-${n}`,
        titulo: `Janela ${n + 1} (chars ${i}-${fim})`,
        inicio: i,
        fim,
        chars: fim - i,
        preview: fatia.slice(0, maxPreview),
      });
    }
    return out;
  }

  return heads.map((h, i) => {
    const fim = i + 1 < heads.length ? heads[i + 1].inicio : raw.length;
    const corpo = raw.slice(h.inicio, fim);
    return {
      id: slug(h.titulo, i),
      titulo: h.titulo,
      inicio: h.inicio,
      fim,
      chars: fim - h.inicio,
      preview: corpo.replace(/\s+/g, ' ').trim().slice(0, maxPreview),
    };
  });
}

/** Resolve secao por id ou titulo (case-insensitive); null se nao achar. */
export function acharSecao(
  secoes: SecaoAlvo[],
  secao: string,
): SecaoAlvo | null {
  const q = String(secao || '').trim().toLowerCase();
  if (!q) return null;
  return (
    secoes.find((s) => s.id === q || s.titulo.toLowerCase() === q) ||
    secoes.find((s) => s.titulo.toLowerCase().includes(q)) ||
    null
  );
}
