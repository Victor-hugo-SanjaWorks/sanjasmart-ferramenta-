/**
 * Retry com backoff exponencial para chamadas LLM (F4.9 / C#26).
 * Motivo: 429/5xx/rede sao transitórios — nao descartar o pedido na 1a falha.
 * Puro e testavel sem provedor real.
 */
export type OpcoesRetry = {
  maxTentativas?: number;
  baseMs?: number;
  fator?: number;
  jitterMs?: number;
  /** Injecao p/ testes. */
  dormir?: (ms: number) => Promise<void>;
};

export function ehErroRetentavel(err: unknown): boolean {
  const msg = String(
    err instanceof Error ? err.message : err ?? '',
  ).toLowerCase();
  const status =
    typeof err === 'object' && err && 'status' in err
      ? Number((err as { status?: number }).status)
      : typeof err === 'object' && err && 'statusCode' in err
        ? Number((err as { statusCode?: number }).statusCode)
        : NaN;

  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return (
    /timeout|etimedout|econnreset|econnrefused|enotfound|socket|network|rate.?limit|overloaded|temporar|unavailable|529|502|503|504|429/.test(
      msg,
    )
  );
}

export function calcularBackoffMs(
  tentativa: number,
  opts?: Pick<OpcoesRetry, 'baseMs' | 'fator' | 'jitterMs'>,
): number {
  const base = Math.max(50, Number(opts?.baseMs) || 400);
  const fator = Math.max(1.5, Number(opts?.fator) || 2);
  const jitter = Math.max(0, Number(opts?.jitterMs ?? 100));
  const expo = Math.round(base * fator ** Math.max(0, tentativa - 1));
  const j = jitter ? Math.floor(Math.random() * jitter) : 0;
  return expo + j;
}

async function sleepPadrao(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Executa fn ate maxTentativas; so retenta se ehErroRetentavel. */
export async function comRetry<T>(
  fn: () => Promise<T>,
  opts?: OpcoesRetry,
): Promise<T> {
  const max = Math.min(6, Math.max(1, Number(opts?.maxTentativas) || 3));
  const dormir = opts?.dormir || sleepPadrao;
  let ultimo: unknown;
  for (let t = 1; t <= max; t++) {
    try {
      return await fn();
    } catch (err) {
      ultimo = err;
      if (t >= max || !ehErroRetentavel(err)) throw err;
      await dormir(calcularBackoffMs(t, opts));
    }
  }
  throw ultimo ?? new Error('retry esgotado');
}
