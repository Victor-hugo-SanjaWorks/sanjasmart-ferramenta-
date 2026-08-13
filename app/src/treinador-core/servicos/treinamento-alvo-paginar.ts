/**
 * Fatia texto de alvo por offset/limit (F4.4).
 * Motivo: prompts >8k nao cabem numa unica tool call — paginar evita cegar o agente.
 * Puro e testavel; usado por ler_alvo / ler_alvo_completo.
 */
export const LIMITE_PADRAO_LER_ALVO = 4000;
export const LIMITE_MAX_LER_ALVO = 8000;

export type FatiaAlvo = {
  offset: number;
  limit: number;
  caracteres: number;
  texto: string;
  truncado: boolean;
  temMais: boolean;
  proximoOffset: number | null;
};

export function fatiarAlvo(
  texto: string,
  opts?: { offset?: number; limit?: number },
): FatiaAlvo {
  const raw = String(texto ?? '');
  const offset = Math.max(0, Math.floor(Number(opts?.offset) || 0));
  let limit = Number(opts?.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = LIMITE_PADRAO_LER_ALVO;
  limit = Math.min(Math.floor(limit), LIMITE_MAX_LER_ALVO);

  const fatia = raw.slice(offset, offset + limit);
  const fim = offset + fatia.length;
  const temMais = fim < raw.length;
  return {
    offset,
    limit,
    caracteres: raw.length,
    texto: fatia,
    truncado: temMais || offset > 0,
    temMais,
    proximoOffset: temMais ? fim : null,
  };
}
