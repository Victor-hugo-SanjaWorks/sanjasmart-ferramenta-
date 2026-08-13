/**
 * Helpers de leitura paginada de alvo para o tool-runner (F4.4).
 * Isolado para manter tool-runner enxuto e testavel sem LLM.
 */
import {
  obterAlvoTreinamentoAtual,
  type AlvoPatchTreinamento,
} from '../servicos/treinamento-config-alvos.js';
import { fatiarAlvo, LIMITE_MAX_LER_ALVO } from '../servicos/treinamento-alvo-paginar.js';
import {
  acharSecao,
  mapearSecoes,
} from '../servicos/treinamento-alvo-mapa-secoes.js';

const ALVOS = new Set<string>([
  'prompt_sistema',
  'orquestracao_texto',
  'mensagens_fluxo',
  'ocr_prompt',
  'ocr_prompt_forcado',
  'ocr_documentos_schema',
]);

function validarAlvoChave(alvo: string, chave: string | null): void {
  if (!ALVOS.has(alvo)) throw new Error(`Alvo invalido: ${alvo}`);
  if ((alvo === 'orquestracao_texto' || alvo === 'mensagens_fluxo') && !chave) {
    throw new Error(`chave obrigatoria para ${alvo}`);
  }
}

export async function executarMapaSecoes(args: Record<string, unknown>) {
  const alvo = String(args.alvo || '');
  const chave = args.chave != null ? String(args.chave) : null;
  validarAlvoChave(alvo, chave);
  const atual = await obterAlvoTreinamentoAtual(alvo as AlvoPatchTreinamento, chave);
  const texto = String(atual.textoAtual || '');
  const secoes = mapearSecoes(texto, {
    maxPreview: Number(args.max_preview) > 0 ? Number(args.max_preview) : 120,
  });
  return {
    alvo: atual.alvo,
    chave: atual.chave,
    caracteres: texto.length,
    totalSecoes: secoes.length,
    secoes,
    instrucao:
      texto.length > 8000
        ? 'Alvo longo: escolha uma secao e chame ler_alvo(secao=...) ou offset=inicio.'
        : undefined,
  };
}

export async function executarLerAlvo(args: Record<string, unknown>) {
  const alvo = String(args.alvo || '');
  const chave = args.chave != null ? String(args.chave) : null;
  validarAlvoChave(alvo, chave);
  const atual = await obterAlvoTreinamentoAtual(alvo as AlvoPatchTreinamento, chave);
  const texto = String(atual.textoAtual || '');
  const vazio = !texto.trim();

  let offset = Number(args.offset) || 0;
  let limit =
    Number(args.limit) > 0
      ? Number(args.limit)
      : Number(args.max_chars) > 0
        ? Number(args.max_chars)
        : 4000;
  limit = Math.min(limit, LIMITE_MAX_LER_ALVO);

  let secaoInfo: ReturnType<typeof acharSecao> = null;
  const secaoArg = args.secao != null ? String(args.secao).trim() : '';
  if (secaoArg) {
    const secoes = mapearSecoes(texto);
    secaoInfo = acharSecao(secoes, secaoArg);
    if (!secaoInfo) {
      throw new Error(
        `Secao nao encontrada: ${secaoArg}. Chame mapa_secoes antes.`,
      );
    }
    offset = secaoInfo.inicio;
    if (!(Number(args.limit) > 0) && !(Number(args.max_chars) > 0)) {
      limit = Math.min(secaoInfo.chars, LIMITE_MAX_LER_ALVO);
    }
  }

  const fatia = fatiarAlvo(texto, { offset, limit });
  return {
    alvo: atual.alvo,
    chave: atual.chave,
    caracteres: fatia.caracteres,
    offset: fatia.offset,
    limit: fatia.limit,
    truncado: fatia.truncado,
    temMais: fatia.temMais,
    proximoOffset: fatia.proximoOffset,
    secao: secaoInfo
      ? {
          id: secaoInfo.id,
          titulo: secaoInfo.titulo,
          inicio: secaoInfo.inicio,
          fim: secaoInfo.fim,
        }
      : undefined,
    vazio,
    podeCriar: vazio,
    texto: fatia.texto,
    instrucao: vazio
      ? 'Alvo vazio: CRIE do zero com propor_patch (replace total, sem trechoAtual). Nao peca o texto ao usuario.'
      : fatia.temMais
        ? `Ha mais texto. Continue com ler_alvo(offset=${fatia.proximoOffset}) ou mapa_secoes.`
        : undefined,
  };
}
