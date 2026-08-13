/**
 * Busca trechos editaveis do treinador por assunto pedido.
 * Quebra os alvos reais em blocos menores para evitar edicao cega.
 * Pontuacao lexical fica em treinamento-config-busca-lexical.ts.
 */
import { obterConfigMensagensFluxo } from '../host/config-mensagens-fluxo.js';
import { obterPromptOcr, obterPromptOcrForcado } from '../host/config-ocr.js';
import { obterConfigOrquestracaoTexto } from '../host/config-orquestracao-texto.js';
import { obterPromptBruto } from '../host/prompt.js';
import { listarOcrDocumentos } from '../host/config-ocr-documentos.js';
import {
  buscarTrechosRelacionadosEmCatalogoParaTeste,
  quebrarBlocosTexto,
  resumirTexto,
  type TrechoCatalogado,
  type TrechoTreinamentoRelacionado,
} from './treinamento-config-busca-lexical.js';

export type { TrechoCatalogado, TrechoTreinamentoRelacionado } from './treinamento-config-busca-lexical.js';
export { buscarTrechosRelacionadosEmCatalogoParaTeste } from './treinamento-config-busca-lexical.js';

export async function montarCatalogoTrechosTreinamento(): Promise<TrechoCatalogado[]> {
  const [prompt, orquestracao, mensagens, ocr, ocrForcado, ocrDocumentos] = await Promise.all([
    obterPromptBruto(),
    obterConfigOrquestracaoTexto(),
    obterConfigMensagensFluxo(),
    obterPromptOcr(),
    obterPromptOcrForcado(),
    listarOcrDocumentos(),
  ]);
  const catalogo: TrechoCatalogado[] = [];

  for (const bloco of quebrarBlocosTexto(prompt)) {
    catalogo.push({
      alvo: 'prompt_sistema',
      chave: null,
      rotulo: 'Prompt principal',
      texto: bloco,
    });
  }

  for (const bloco of quebrarBlocosTexto(ocr)) {
    catalogo.push({
      alvo: 'ocr_prompt',
      chave: null,
      rotulo: 'Prompt de Extracao OCR',
      texto: bloco,
    });
  }

  for (const bloco of quebrarBlocosTexto(ocrForcado)) {
    catalogo.push({
      alvo: 'ocr_prompt_forcado',
      chave: null,
      rotulo: 'Prompt OCR com Tipo Forcado',
      texto: bloco,
    });
  }

  for (const doc of ocrDocumentos.filter((d) => d.ativo && d.dicaPrompt)) {
    for (const bloco of quebrarBlocosTexto(doc.dicaPrompt)) {
      catalogo.push({
        alvo: 'ocr_documentos_schema',
        chave: doc.id,
        rotulo: `Dica OCR - ${doc.rotulo} (${doc.tipoDocumento})`,
        texto: bloco,
      });
    }
  }

  for (const chave of ['camadaHumana', 'instrucaoFormatacao'] as const) {
    for (const bloco of quebrarBlocosTexto(String(orquestracao[chave] || ''))) {
      catalogo.push({
        alvo: 'orquestracao_texto',
        chave,
        rotulo: `orquestracao_texto.${chave}`,
        texto: bloco,
      });
    }
  }

  for (const [chave, valor] of Object.entries(mensagens)) {
    const texto = Array.isArray(valor)
      ? valor.map((item) => String(item).trim()).filter(Boolean).join('\n')
      : String(valor || '').trim();
    for (const bloco of quebrarBlocosTexto(texto)) {
      catalogo.push({
        alvo: 'mensagens_fluxo',
        chave,
        rotulo: `mensagens_fluxo.${chave}`,
        texto: bloco,
      });
    }
  }

  return catalogo;
}

export async function buscarTrechosRelacionadosTreinamento(
  pedido: string,
  limite = 8,
): Promise<TrechoTreinamentoRelacionado[]> {
  const catalogo = await montarCatalogoTrechosTreinamento();
  const resultados = buscarTrechosRelacionadosEmCatalogoParaTeste(pedido, catalogo, limite);
  if (resultados.length) return resultados;
  return catalogo.slice(0, Math.min(limite, 4)).map((item) => ({
    alvo: item.alvo,
    chave: item.chave,
    rotulo: item.rotulo,
    texto: item.texto,
    score: 0,
    termos: [],
    motivo: 'fallback de contexto geral editavel',
    origemBusca: 'fallback',
  }));
}

export function montarContextoBuscaTreinamento(
  pedido: string,
  trechos: TrechoTreinamentoRelacionado[],
): string {
  const linhasTrechos = trechos.length
    ? trechos.map(
        (trecho, idx) =>
          `[${idx + 1}] ${trecho.rotulo} | score=${trecho.score} | ${trecho.motivo}\n${resumirTexto(
            trecho.texto,
            420,
          )}`,
      )
    : [
        '(nenhum trecho — prompt/alvo provavelmente vazio)',
        'ACAO: CRIE prompt_sistema do zero com replace total (trechoAtual vazio, textoProposto = prompt completo).',
      ];
  return [
    '=== PEDIDO DO TREINADOR ===',
    pedido.trim(),
    '',
    '=== TRECHOS RELACIONADOS ENCONTRADOS ===',
    ...linhasTrechos,
  ].join('\n\n');
}

export function montarResumoHumanoTrechos(
  trechos: TrechoTreinamentoRelacionado[],
  limite = 4,
): string[] {
  return trechos.slice(0, limite).map((trecho, idx) => {
    const alvo = trecho.chave ? `${trecho.alvo}.${trecho.chave}` : trecho.alvo;
    return `${idx + 1}. ${alvo}: ${resumirTexto(trecho.texto, 180)}`;
  });
}
