/**
 * Rate-limit por telefone no modo treinador (F5.5).
 * OFF por padrao para nao surpreender cliente — ative com TREINADOR_RATE_LIMIT=1.
 * Quando ativo: max 20 msgs/min (TREINADOR_RATE_LIMIT_POR_MIN).
 */
const ATIVO = /^(1|true|sim|on)$/i.test(
  String(process.env.TREINADOR_RATE_LIMIT || '').trim(),
);
const MAX_POR_MIN = Number(process.env.TREINADOR_RATE_LIMIT_POR_MIN || 20);
const JANELA_MS = 60_000;

const janelas = new Map<string, number[]>();

function normalizarTel(t: string): string {
  return String(t || '').replace(/\D/g, '');
}

function limparAntigos(ts: number[], agora: number): number[] {
  return ts.filter((t) => agora - t < JANELA_MS);
}

export type ResultadoRateLimit = {
  ok: boolean;
  restantes: number;
  retryEmMs?: number;
};

export function checarRateLimitTreinador(telefone: string): ResultadoRateLimit {
  if (!ATIVO) return { ok: true, restantes: MAX_POR_MIN };

  const tel = normalizarTel(telefone);
  if (!tel) return { ok: true, restantes: MAX_POR_MIN };

  const agora = Date.now();
  const prev = limparAntigos(janelas.get(tel) || [], agora);

  if (prev.length >= MAX_POR_MIN) {
    const maisAntigo = prev[0];
    return {
      ok: false,
      restantes: 0,
      retryEmMs: JANELA_MS - (agora - maisAntigo),
    };
  }

  prev.push(agora);
  janelas.set(tel, prev);
  return { ok: true, restantes: MAX_POR_MIN - prev.length };
}

export function msgRateLimitExcedido(retryEmMs?: number): string {
  const seg = retryEmMs ? Math.ceil(retryEmMs / 1000) : 60;
  return (
    `Recebi muitas mensagens seguidas. Espera ~${seg}s e me chama de novo — nada foi alterado.`
  );
}
