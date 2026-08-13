/**
 * Formata a resposta do treinador para WhatsApp.
 * Amigavel, curta, com emojis e nomes humanos para os alvos.
 * Inclui diff por linha (F4.6) no preview.
 */
import type { TrechoTreinamentoRelacionado } from './treinamento-config-busca.js';
import type { PreviewPatchTreinamento } from './treinamento-config-lote.js';
import { diffHunks, formatarDiffTexto } from './treinamento-diff-linhas.js';

function resumir(texto: string, limite = 420): string {
  const base = String(texto || '').trim();
  return base.length <= limite ? base : `${base.slice(0, limite - 3)}...`;
}

function nomeAlvoAmigavel(alvo: string, chave: string | null): string {
  const nomes: Record<string, string> = {
    prompt_sistema: 'Prompt principal',
    orquestracao_texto: 'Regras de tom e formatacao',
    mensagens_fluxo: 'Mensagens do fluxo',
    ocr_prompt: 'Prompt de OCR',
    ocr_prompt_forcado: 'Prompt OCR forcado',
    ocr_documentos_schema: 'Documentos OCR',
  };
  const base = nomes[alvo] || alvo;
  if (alvo === 'orquestracao_texto' && chave) {
    if (chave === 'camadaHumana') return 'Regras de tom e WhatsApp';
    if (chave === 'instrucaoFormatacao') return 'Formatacao de mensagens';
  }
  if (alvo === 'mensagens_fluxo' && chave) return `Mensagem: ${chave}`;
  if (alvo === 'ocr_documentos_schema' && chave) return `Documento OCR: ${chave}`;
  return base;
}

export function montarResumoPreviewTexto(
  previews: PreviewPatchTreinamento[],
  campo: 'antes' | 'depois',
): string {
  return previews
    .map((item) => {
      const titulo = nomeAlvoAmigavel(item.alvo, item.chave);
      return `[${titulo}]\n${resumir(item[campo], 700)}`;
    })
    .join('\n\n');
}

export function montarRespostaHumanaPatch(opts: {
  id?: number;
  resumo: string;
  justificativa?: string | null;
  perguntaConfirmacao?: string | null;
  trechos: TrechoTreinamentoRelacionado[];
  previews: PreviewPatchTreinamento[];
}): string {
  const linhas: string[] = [];

  linhas.push(`Olhei o texto atual e preparei uma sugestao para voce revisar.`);
  linhas.push('');
  linhas.push(opts.resumo);

  if (opts.justificativa) {
    linhas.push('');
    linhas.push(opts.justificativa);
  }

  if (opts.previews.length) {
    for (const item of opts.previews.slice(0, 3)) {
      const nome = nomeAlvoAmigavel(item.alvo, item.chave);
      linhas.push('');
      linhas.push(`*${nome}*`);
      linhas.push('');
      linhas.push('*Como esta hoje:*');
      linhas.push(resumir(item.antes, 350) || '(vazio)');
      linhas.push('');
      linhas.push('*Como ficaria:*');
      linhas.push(resumir(item.depois, 350) || '(sem mudanca)');
      const diff = formatarDiffTexto(diffHunks(item.antes, item.depois, 1), 24);
      if (diff && diff !== '(sem mudanca)') {
        linhas.push('');
        linhas.push('_Se quiser, eu tambem posso te mostrar exatamente o que mudou linha por linha._');
      }
    }
  }

  linhas.push('');
  linhas.push(
    opts.perguntaConfirmacao ||
      'Se voce gostar, eu aplico. Se quiser ajustar antes, me diga o que mudar.',
  );

  return linhas.join('\n');
}
