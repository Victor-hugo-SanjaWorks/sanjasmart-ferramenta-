/**
 * Regras de confirmacao na conversa (WhatsApp) — sem depender de painel.
 * Replace grande pede um "sim" claro; frases naturais bastam.
 * Usado por aplicar_patch (WhatsApp) e aprovar no painel.
 */
import type { PatchTreinamentoAplicavel } from './treinamento-config-alvos.js';
import type { PreviewPatchTreinamento } from './treinamento-config-lote.js';

export function eReplaceTotalPromptSistema(
  operacoes: PatchTreinamentoAplicavel[],
  previews?: PreviewPatchTreinamento[],
): boolean {
  const previewMap = new Map(
    (previews || []).map((p) => [`${p.alvo}|${p.chave || ''}`, p]),
  );
  return (operacoes || []).some((op) => {
    if (op.alvo !== 'prompt_sistema' || op.operacao !== 'replace') return false;
    if (op.trechoAtual?.trim()) return false;
    const prev = previewMap.get(`${op.alvo}|${op.chave || ''}`);
    const antes = String(prev?.antes ?? '');
    return antes.trim().length > 0;
  });
}

const CONFIRMA_CURTA =
  /^(ok|beleza|pode|manda|aplica|confirmo|confirma|sim|yes|pode aplicar|pode confirmar|pode publicar|gostei|fechou|vai|aprova|coloca|pode colocar)[\s!.]*$/i;

/** Aceita confirmacao humana para troca grande do texto principal. */
const CONFIRMA_REPLACE_TOTAL =
  /(confirmar?\s+replace\s+total|replace\s+total\s+#?\d*|sobrescrever\s+(o\s+)?prompt|apagar\s+tudo|confirmo\s+substituir\s+tudo|substituir\s+tudo|trocar\s+tudo|pode\s+substituir|sim[,!]?\s*(pode|quero|substitui|publica)|quero\s+substituir|gostei[,!]?\s*pode)/i;

export function reconheceConfirmacaoCurta(texto: string): boolean {
  return CONFIRMA_CURTA.test(String(texto || '').trim());
}

export function reconheceConfirmacaoReplaceTotal(texto: string): boolean {
  const t = String(texto || '').trim();
  return CONFIRMA_REPLACE_TOTAL.test(t) || CONFIRMA_CURTA.test(t);
}

export type ChecagemAplicar = {
  ok: boolean;
  erro?: string;
  exigeDupla?: boolean;
};

/**
 * Autor precisa bater; troca grande do texto principal pede confirmacao na conversa.
 */
export function checarPodeAplicarPatch(opts: {
  patchTelefoneAutor: string;
  telefoneQuemAplica: string;
  operacoes: PatchTreinamentoAplicavel[];
  previews?: PreviewPatchTreinamento[];
  confirmacaoDupla?: boolean;
  textoUsuario?: string;
}): ChecagemAplicar {
  const autor = String(opts.patchTelefoneAutor || '').replace(/\D/g, '');
  const quem = String(opts.telefoneQuemAplica || '').replace(/\D/g, '');
  if (autor && quem && autor !== quem) {
    return {
      ok: false,
      erro:
        'Essa sugestao foi preparada por outra pessoa. Peça a ela confirmar, ou me diga o que voce quer mudar.',
    };
  }

  const exigeDupla = eReplaceTotalPromptSistema(opts.operacoes, opts.previews);
  if (!exigeDupla) return { ok: true, exigeDupla: false };

  const dupla =
    opts.confirmacaoDupla === true ||
    reconheceConfirmacaoReplaceTotal(opts.textoUsuario || '');
  if (!dupla) {
    return {
      ok: false,
      exigeDupla: true,
      erro:
        'Isso troca o texto principal inteiro. Confirme na conversa com algo como "sim, pode" ou "pode publicar".',
    };
  }
  return { ok: true, exigeDupla: true };
}
