/**
 * Embeddings do treinador (mesma dim do RAG do app: text-embedding-3-small).
 * Sem chave OpenAI, busca vetorial do catalogo fica desligada (lexical segue).
 */
import { config } from '../../config.js';

const MODELO = 'text-embedding-3-small';
export const DIMENSAO_EMBED = 1536;

export async function gerarEmbedding(texto: string): Promise<number[]> {
  const key = (config.openaiApiKey || config.openaiToken || '').trim();
  if (!key) return [];
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODELO, input: texto, dimensions: DIMENSAO_EMBED }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding ?? [];
  } catch {
    return [];
  }
}
