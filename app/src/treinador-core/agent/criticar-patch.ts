/**
 * Critica uma proposta de patch antes de mostrar como pronta ao usuario.
 * Detecta conflito, replace cego, alvo vazio, dedupe append e inchaco (F4.5).
 * Usado apos propor_patch e pela tool criticar_patch.
 */
import type { PatchTreinamentoAplicavel } from '../servicos/treinamento-config-alvos.js';
import type { PreviewPatchTreinamento } from '../servicos/treinamento-config-lote.js';
import {
  avaliarInchaco,
  textoPropostoJaExiste,
} from '../servicos/treinamento-alvo-dedupe-append.js';

export type CriticaPatch = {
  aprovadoParaPerguntar: boolean;
  nota: number;
  problemas: string[];
  sugestoes: string[];
  resumo: string;
  /** Replace total de prompt existente — precisa "Confirmar replace total". */
  exigeConfirmacaoDupla?: boolean;
};

function corte(s: string, n = 120): string {
  const t = String(s || '').trim();
  return t.length <= n ? t : `${t.slice(0, n)}...`;
}

export function criticarOperacoesPatch(opts: {
  pedido: string;
  operacoes: PatchTreinamentoAplicavel[];
  previews?: PreviewPatchTreinamento[];
}): CriticaPatch {
  const problemas: string[] = [];
  const sugestoes: string[] = [];
  const ops = opts.operacoes || [];

  if (!ops.length) {
    return {
      aprovadoParaPerguntar: false,
      nota: 0,
      problemas: ['Nenhuma operacao no patch.'],
      sugestoes: ['Refaca a proposta com alvo e trecho claros.'],
      resumo: 'Patch vazio — nao pergunte confirmacao.',
    };
  }

  if (ops.length > 6) {
    problemas.push(`Lote grande demais (${ops.length} ops). Risco de edicao rasa/espalhada.`);
    sugestoes.push('Reduza para os 3 alvos de maior impacto e explique o restante depois.');
  }

  const previewPorChave = new Map(
    (opts.previews || []).map((p) => [`${p.alvo}|${p.chave || ''}`, p]),
  );

  for (const op of ops) {
    if (!op.textoProposto?.trim()) {
      problemas.push(`Operacao em ${op.alvo} sem textoProposto.`);
    }
    const prev = previewPorChave.get(`${op.alvo}|${op.chave || ''}`);
    const alvoVazio = !String(prev?.antes ?? '').trim();
    if (op.operacao === 'replace' && !op.trechoAtual?.trim()) {
      if (alvoVazio) {
        sugestoes.push(
          `Criacao do zero em ${op.alvo} — ok. Confirme com o usuario antes de aplicar.`,
        );
      } else {
        problemas.push(
          `Replace em ${op.alvo}${op.chave ? '.' + op.chave : ''} sem trechoAtual — pode sobrescrever o alvo inteiro.`,
        );
        sugestoes.push('Exija trechoAtual ou use append/prepend pontual.');
      }
    }
    if (op.operacao === 'append' && op.textoProposto.trim().length < 8) {
      problemas.push(`Append muito curto em ${op.alvo}.`);
    }
    if (
      (op.operacao === 'append' || op.operacao === 'prepend') &&
      prev &&
      textoPropostoJaExiste(String(prev.antes || ''), op.textoProposto)
    ) {
      problemas.push(
        `Append/prepend duplicado em ${op.alvo}${op.chave ? '.' + op.chave : ''} — regra ja existe no alvo.`,
      );
      sugestoes.push('Troque por replace no trecho existente ou cancele a repeticao.');
    }
    if (
      op.alvo === 'prompt_sistema' &&
      op.operacao === 'replace' &&
      !op.trechoAtual &&
      !alvoVazio
    ) {
      problemas.push('Replace total de prompt_sistema e cirurgia extrema — confirme com o usuario explicitamente.');
    }
  }

  for (const prev of opts.previews || []) {
    if (prev.antes === prev.depois) {
      problemas.push(`Preview sem efeito em ${prev.alvo}${prev.chave ? '.' + prev.chave : ''}.`);
    }
    const antesLen = String(prev.antes || '').length;
    const depoisLen = String(prev.depois || '').length;
    // Criar do zero (antes vazio) nao e "expansao agressiva"
    if (antesLen > 0 && depoisLen > antesLen * 3 + 500) {
      problemas.push(`Expansao agressiva em ${prev.alvo} (${antesLen}→${depoisLen} chars).`);
      sugestoes.push('Prefira replace local em vez de inchaco.');
    }
    const inchaco = avaliarInchaco(antesLen, depoisLen);
    if (inchaco.nivel === 'forte' && inchaco.mensagem) {
      problemas.push(inchaco.mensagem);
      sugestoes.push('Delete trechos obsoletos ou consolide regras antes de crescer mais.');
    } else if (inchaco.nivel === 'aviso' && inchaco.mensagem) {
      sugestoes.push(inchaco.mensagem);
    }
  }

  const pedido = String(opts.pedido || '').toLowerCase();
  if (/ocr/.test(pedido) && !ops.some((o) => String(o.alvo).startsWith('ocr'))) {
    problemas.push('Pedido fala em OCR mas nenhuma operacao toca alvos OCR.');
  }
  if (/mensagem|boas\s*vind/.test(pedido) && !ops.some((o) => o.alvo === 'mensagens_fluxo')) {
    sugestoes.push('Considere mensagens_fluxo se o pedido era sobre mensagem ao usuario.');
  }

  const nota = Math.max(0, 10 - problemas.length * 2);
  const temReplaceTotal = ops.some((op) => {
    if (op.alvo !== 'prompt_sistema' || op.operacao !== 'replace' || op.trechoAtual?.trim()) {
      return false;
    }
    const prev = previewPorChave.get(`${op.alvo}|${op.chave || ''}`);
    return String(prev?.antes ?? '').trim().length > 0;
  });
  if (temReplaceTotal) {
    sugestoes.push(
      'Mudanca grande: so publique apos o usuario confirmar na conversa (ex.: "sim, pode").',
    );
  }

  const bloqueantes = problemas.filter((p) =>
    /sem textoProposto|Patch vazio|sem efeito|injection/i.test(p),
  );
  const aprovadoParaPerguntar = bloqueantes.length === 0 && ops.length > 0;

  return {
    aprovadoParaPerguntar,
    nota,
    problemas,
    sugestoes,
    exigeConfirmacaoDupla: temReplaceTotal,
    resumo: problemas.length
      ? `Revisao automatica: nota ${nota}/10. Pontos de atencao: ${problemas.map(corte).join(' | ')}`
      : temReplaceTotal
        ? `Revisao automatica: nota ${nota}/10. Troca o texto principal — peca confirmacao na conversa ("sim, pode").`
        : `Revisao automatica: nota ${nota}/10. Sugestao ok para perguntar se pode publicar.`,
  };
}
