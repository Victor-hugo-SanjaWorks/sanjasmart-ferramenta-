/**
 * Pede ao LLM a estrutura JSON do patch (operacoes + resumo).
 * Usa parser robusto e max_tokens dinamico — evita truncar prompts grandes.
 * Chamado por criarPropostaPatchConfiguracao apos a busca de trechos.
 */
import { limparMarkdownUsuario } from './treinamento-limpar-markdown-usuario.js';
import { chatParaGerarPatch } from './treinamento-chat-preferir-claude.js';
import {
  montarContextoBuscaTreinamento,
  type TrechoTreinamentoRelacionado,
} from './treinamento-config-busca.js';
import {
  montarResumoAlvosTreinamento,
  type PatchTreinamentoAplicavel,
} from './treinamento-config-alvos.js';
import { normalizarOperacoes } from './treinamento-config-patch-utils.js';
import { extrairJsonObjeto, tokensParaPatch } from './treinamento-json-utils.js';
import { montarBlocoFewShotTreino } from './treinamento-exemplos-store.js';

export interface PatchConfiguracaoSugerido {
  operacoes: PatchTreinamentoAplicavel[];
  resumo: string;
  justificativa?: string;
  perguntaConfirmacao?: string;
}

export async function sugerirPatchPorTexto(
  texto: string,
  trechos: TrechoTreinamentoRelacionado[],
): Promise<PatchConfiguracaoSugerido> {
  const textoLimpo = limparMarkdownUsuario(texto);
  const contexto = montarContextoBuscaTreinamento(textoLimpo, trechos);
  const catalogoAlvos = await montarResumoAlvosTreinamento();
  const fewShot = await montarBlocoFewShotTreino(5);
  const maxTokens = tokensParaPatch(
    contexto.length + catalogoAlvos.length + fewShot.length,
  );
  const { texto: resposta } = await chatParaGerarPatch(
    [
      {
        role: 'system',
        content:
          'Voce e um editor tecnico SENIOR de prompts da IA de atendimento (modo AI Magic). ' +
          'Se o alvo estiver vazio ou nao houver trechos: CRIE o prompt_sistema do zero com operacao replace, trechoAtual vazio/null e textoProposto = prompt completo util. ' +
          'Se houver texto: edite com precisao cirurgica (replace LOCAL com trechoAtual fiel). ' +
          'Para REMOVER trecho: operacao "delete" com trechoAtual e textoProposto vazio. ' +
          'Nunca recuse por falta de prompt — criar e permitido e desejado. ' +
          'Responda SOMENTE JSON com {"operacoes":[{"alvo":"prompt_sistema|orquestracao_texto|mensagens_fluxo|ocr_prompt|ocr_prompt_forcado|ocr_documentos_schema","chave":"... ou null","operacao":"replace|append|prepend|delete","trechoAtual":"...","textoProposto":"..."}],"resumo":"...","justificativa":"...","perguntaConfirmacao":"..."}. ' +
          'Max 6 ops. Se mensagens_fluxo, chave real do catalogo. Se orquestracao_texto, chave camadaHumana ou instrucaoFormatacao.\n\n' +
          catalogoAlvos +
          (fewShot ? `\n\n${fewShot}` : ''),
      },
      { role: 'user', content: contexto },
    ],
    { temperature: 0.15, max_tokens: maxTokens },
  );
  let parsed: Record<string, unknown>;
  try {
    parsed = extrairJsonObjeto(resposta);
  } catch {
    throw new Error('Nao consegui estruturar a proposta de patch');
  }
  const patch: PatchConfiguracaoSugerido = {
    operacoes: normalizarOperacoes(
      Array.isArray(parsed.operacoes)
        ? parsed.operacoes
        : [
            {
              alvo: parsed.alvo,
              chave: parsed.chave,
              operacao: parsed.operacao,
              trechoAtual: parsed.trechoAtual,
              textoProposto: parsed.textoProposto,
            },
          ],
    ),
    resumo: String(parsed.resumo || '').trim(),
    justificativa: parsed.justificativa ? String(parsed.justificativa) : '',
    perguntaConfirmacao: parsed.perguntaConfirmacao
      ? String(parsed.perguntaConfirmacao)
      : '',
  };
  if (!patch.operacoes.length || !patch.resumo) {
    throw new Error('A proposta veio incompleta para aplicar no treinador');
  }
  return patch;
}
