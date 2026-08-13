/**
 * Alerta de regressao apos patch aprovado (F3.6).
 * Se verificacao pos-apply indica mudanca nula, emite alerta console + webhook opcional.
 * Nao bloqueia o apply — fire-and-forget.
 */
import { verificarComportamentoPatch } from './treinamento-verificar-comportamento.js';
import type { PreviewPatchTreinamento } from './treinamento-config-lote.js';

export type AlertaRegressao = {
  patchId: number;
  motivo: string;
  mudouAlgo: boolean;
  respostasIguais: boolean;
};

async function emitirWebhook(payload: AlertaRegressao): Promise<void> {
  const url = String(process.env.TREINADOR_ALERTA_WEBHOOK || '').trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'regressao_patch', ...payload, em: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.warn('[treinador-alerta] webhook falhou:', err instanceof Error ? err.message : err);
  }
}

/** Verifica previews pos-apply e alerta se parecer regressao (sem efeito). */
export async function verificarERegistrarAlertaRegressao(opts: {
  patchId: number;
  previews: PreviewPatchTreinamento[];
  pedido?: string;
}): Promise<AlertaRegressao | null> {
  const preview =
    opts.previews.find((p) => p.alvo === 'prompt_sistema') || opts.previews[0];
  if (!preview) return null;

  const rel = await verificarComportamentoPatch({
    promptAntes: preview.antes,
    promptDepois: preview.depois,
    pedido: opts.pedido || '',
  });

  const respostasIguais = rel.casos.every(
    (c) => c.respostaAntes === c.respostaDepois,
  );
  if (rel.mudouAlgo && !respostasIguais) return null;

  const alerta: AlertaRegressao = {
    patchId: opts.patchId,
    motivo: rel.mudouAlgo
      ? 'Respostas identicas em todos os casos de teste'
      : 'Verificacao reportou mudouAlgo=false',
    mudouAlgo: rel.mudouAlgo,
    respostasIguais,
  };

  console.warn(
    `[treinador-alerta] REGRESSAO patch #${opts.patchId}: ${alerta.motivo}`,
  );
  void emitirWebhook(alerta);
  return alerta;
}

/** Hook fire-and-forget apos aprovar patch. */
export function dispararAlertaRegressaoAposApply(opts: {
  patchId: number;
  previews: PreviewPatchTreinamento[];
  pedido?: string;
}): void {
  void verificarERegistrarAlertaRegressao(opts).catch((err) => {
    console.error('[treinador-alerta] falha na verificacao pos-apply:', err);
  });
}
