/**
 * Lock otimista: o preview.antes e o snapshot do alvo na hora da proposta.
 * Se o texto real mudou antes do apply, recusa — evita TOCTOU entre admins.
 * Usado em aprovarPatchConfiguracao antes de gravar.
 */
import type { PreviewPatchTreinamento } from './treinamento-config-lote.js';
import { obterAlvoTreinamentoAtual } from './treinamento-config-alvos.js';
import { hashTextoAlvo } from './treinamento-hash.js';

export { hashTextoAlvo } from './treinamento-hash.js';

export type ResultadoLock = {
  ok: boolean;
  conflitos: string[];
};

/** Compara cada preview.antes com o texto atual do alvo. */
export async function verificarLockOtimista(
  previews: PreviewPatchTreinamento[],
): Promise<ResultadoLock> {
  const conflitos: string[] = [];
  for (const prev of previews || []) {
    const atual = await obterAlvoTreinamentoAtual(prev.alvo, prev.chave);
    const hAntes = hashTextoAlvo(prev.antes);
    const hAgora = hashTextoAlvo(atual.textoAtual);
    if (hAntes !== hAgora) {
      conflitos.push(
        `${prev.alvo}${prev.chave ? '.' + prev.chave : ''} mudou desde a proposta ` +
          `(assinatura ${hAntes.slice(0, 8)}→${hAgora.slice(0, 8)})`,
      );
    }
  }
  return { ok: conflitos.length === 0, conflitos };
}
