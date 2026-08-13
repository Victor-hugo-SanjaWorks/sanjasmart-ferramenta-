/**
 * Helpers lexicais da busca de trechos editaveis do treinador.
 * Normalizacao, stopwords, pontuacao e quebra de blocos grandes.
 * Usado por treinamento-config-busca.ts e testes deterministicos.
 */
import type { AlvoPatchTreinamento } from './treinamento-config-alvos.js';

const STOPWORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'dele', 'dela',
  'deles', 'delas', 'do', 'dos', 'e', 'ela', 'ele', 'em', 'essa', 'esse',
  'esta', 'este', 'eu', 'fazer', 'isso', 'mais', 'mas', 'me', 'meu', 'minha',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'por', 'pra', 'que',
  'se', 'sem', 'ser', 'seu', 'sua', 'suas', 'ter', 'um', 'uma', 'voce',
]);

export interface TrechoCatalogado {
  alvo: AlvoPatchTreinamento;
  chave: string | null;
  rotulo: string;
  texto: string;
}

export interface TrechoTreinamentoRelacionado {
  alvo: AlvoPatchTreinamento;
  chave: string | null;
  rotulo: string;
  texto: string;
  score: number;
  termos: string[];
  motivo: string;
  origemBusca: 'lexical' | 'vetorial' | 'fallback';
}

export function normalizarBusca(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resumirTexto(texto: string, limite = 260): string {
  const base = String(texto || '').replace(/\s+/g, ' ').trim();
  return base.length <= limite ? base : `${base.slice(0, limite - 3)}...`;
}

export function quebrarBlocosTexto(texto: string): string[] {
  const bruto = String(texto || '').trim();
  if (!bruto) return [];
  const blocos = bruto
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return blocos.flatMap((bloco) => {
    if (bloco.length <= 520) return [bloco];
    return bloco
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .reduce<string[]>((acc, frase) => {
        const atual = acc[acc.length - 1] || '';
        if (!atual || atual.length + frase.length + 1 > 520) {
          acc.push(frase);
          return acc;
        }
        acc[acc.length - 1] = `${atual} ${frase}`.trim();
        return acc;
      }, []);
  });
}

export function extrairTermosBusca(texto: string): string[] {
  return Array.from(
    new Set(
      normalizarBusca(texto)
        .split(' ')
        .map((item) => item.trim())
        .filter((item) => item.length >= 3 && !STOPWORDS.has(item)),
    ),
  ).slice(0, 14);
}

export function pontuarTrecho(
  pedido: string,
  termos: string[],
  trecho: TrechoCatalogado,
): TrechoTreinamentoRelacionado {
  const textoNormalizado = normalizarBusca(trecho.texto);
  const rotuloNormalizado = normalizarBusca(`${trecho.alvo} ${trecho.chave || ''} ${trecho.rotulo}`);
  const pedidoNormalizado = normalizarBusca(pedido);
  const termosEncontrados = termos.filter(
    (termo) => textoNormalizado.includes(termo) || rotuloNormalizado.includes(termo),
  );
  let score = 0;

  for (const termo of termosEncontrados) {
    score += textoNormalizado.includes(termo) ? 3 : 0;
    score += rotuloNormalizado.includes(termo) ? 2 : 0;
  }

  if (pedidoNormalizado.length >= 10 && textoNormalizado.includes(pedidoNormalizado)) score += 9;
  if (pedidoNormalizado.length >= 10 && rotuloNormalizado.includes(pedidoNormalizado)) score += 6;
  if (trecho.chave && termos.some((termo) => trecho.chave?.toLowerCase().includes(termo))) score += 3;
  if (termos.length && termosEncontrados.length === termos.length) score += 4;

  return {
    alvo: trecho.alvo,
    chave: trecho.chave,
    rotulo: trecho.rotulo,
    texto: trecho.texto,
    score,
    termos: termosEncontrados,
    motivo: termosEncontrados.length
      ? `coincide com ${termosEncontrados.slice(0, 5).join(', ')}`
      : 'contexto geral proximo do pedido',
    origemBusca: 'lexical',
  };
}

export function buscarTrechosRelacionadosEmCatalogoParaTeste(
  pedido: string,
  catalogo: Array<{ alvo: AlvoPatchTreinamento; chave?: string | null; rotulo: string; texto: string }>,
  limite = 8,
): TrechoTreinamentoRelacionado[] {
  const termos = extrairTermosBusca(pedido);
  return catalogo
    .map((item) =>
      pontuarTrecho(pedido, termos, {
        alvo: item.alvo,
        chave: item.chave ?? null,
        rotulo: item.rotulo,
        texto: item.texto,
      }),
    )
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.rotulo.localeCompare(b.rotulo))
    .slice(0, limite);
}
