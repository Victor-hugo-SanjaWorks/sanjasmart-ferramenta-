/**
 * Circuit breaker de custo LLM (F5.3).
 * Limita chamadas/tokens por dia via env TREINADOR_MAX_CHAMADAS_DIA (default 200).
 * Bloqueia propor_patch quando estourar — protege budget.
 */
const MAX_DIA = Number(process.env.TREINADOR_MAX_CHAMADAS_DIA || 200);

type ContadorDia = { dia: string; chamadas: number; tokens: number };

let contador: ContadorDia = { dia: '', chamadas: 0, tokens: 0 };

function diaHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetSeNecessario(): void {
  const hoje = diaHoje();
  if (contador.dia !== hoje) {
    contador = { dia: hoje, chamadas: 0, tokens: 0 };
  }
}

export function registrarChamadaLlm(tokensEstimados = 0): void {
  resetSeNecessario();
  contador.chamadas += 1;
  contador.tokens += Math.max(0, tokensEstimados);
}

export type ResultadoCircuitBreaker = {
  ok: boolean;
  chamadas: number;
  maxChamadas: number;
  tokens: number;
  motivo?: string;
};

export function checarCircuitBreaker(): ResultadoCircuitBreaker {
  resetSeNecessario();
  const forcar = /^(1|true|sim|on)$/i.test(
    String(process.env.TREINADOR_CIRCUIT_BREAKER || '').trim(),
  );
  // Por padrao NAO bloqueia o WhatsApp — so conta. Ative com TREINADOR_CIRCUIT_BREAKER=1.
  if (forcar && contador.chamadas >= MAX_DIA) {
    return {
      ok: false,
      chamadas: contador.chamadas,
      maxChamadas: MAX_DIA,
      tokens: contador.tokens,
      motivo: `Voce ja fez bastantes pedidos hoje (${MAX_DIA}). Amanha eu continuo — nada foi alterado agora.`,
    };
  }
  return {
    ok: true,
    chamadas: contador.chamadas,
    maxChamadas: MAX_DIA,
    tokens: contador.tokens,
  };
}

export function obterContadorCircuitBreaker(): ResultadoCircuitBreaker {
  resetSeNecessario();
  return {
    ok: contador.chamadas < MAX_DIA,
    chamadas: contador.chamadas,
    maxChamadas: MAX_DIA,
    tokens: contador.tokens,
  };
}
