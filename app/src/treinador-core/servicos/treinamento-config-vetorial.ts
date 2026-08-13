/**
 * Busca vetorial do catalogo editavel do treinador (F4.8).
 * Colecao dedicada (≠ RAG do cliente); reindex forcavel apos apply.
 * Lazy sync por hash continua; apply chama reindexarCatalogoTreinadorForcado.
 */
import { createHash, randomUUID } from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../../config.js';
import { gerarEmbedding } from '../host/openai.js';
import { DIMENSAO } from '../host/qdrant.js';
import {
  montarCatalogoTrechosTreinamento,
  type TrechoCatalogado,
  type TrechoTreinamentoRelacionado,
} from './treinamento-config-busca.js';
import { resolverColecaoTreinamento } from './treinamento-colecao-qdrant.js';

const cliente = new QdrantClient({ url: config.qdrantUrl });
let ultimoHashSincronizado = '';

function colecaoTreinamento(): string {
  const cfg = config as {
    qdrantColecaoTreinamento?: string;
    qdrantCollection?: string;
    appSlug?: string;
  };
  return resolverColecaoTreinamento({
    colecaoTreinamento: cfg.qdrantColecaoTreinamento,
    colecaoRag: cfg.qdrantCollection,
    appSlug: cfg.appSlug || process.env.APP_SLUG,
  });
}

function hashCatalogo(catalogo: TrechoCatalogado[]): string {
  return createHash('sha1')
    .update(
      catalogo
        .map((item) => `${item.alvo}|${item.chave || ''}|${item.rotulo}|${item.texto}`)
        .join('\n###\n'),
    )
    .digest('hex');
}

async function inicializarColecaoTreinamento(nome: string): Promise<void> {
  const colecoes = await cliente.getCollections();
  const existe = colecoes.collections.some((item) => item.name === nome);
  if (existe) return;
  await cliente.createCollection(nome, {
    vectors: { size: DIMENSAO, distance: 'Cosine' },
  });
}

async function resetarColecaoTreinamento(nome: string): Promise<void> {
  try {
    await cliente.deleteCollection(nome);
  } catch {
    /* colecao pode nao existir */
  }
  await inicializarColecaoTreinamento(nome);
}

async function sincronizarCatalogoVetorial(
  catalogo: TrechoCatalogado[],
  forcar = false,
): Promise<string> {
  const nome = colecaoTreinamento();
  const hashAtual = hashCatalogo(catalogo);
  if (!forcar && hashAtual === ultimoHashSincronizado) return hashAtual;

  await resetarColecaoTreinamento(nome);
  const pontos = [];
  for (const item of catalogo) {
    const vetor = await gerarEmbedding(item.texto.slice(0, 1800));
    if (!vetor?.length) continue;
    pontos.push({
      id: randomUUID(),
      vector: vetor,
      payload: {
        hash: hashAtual,
        alvo: item.alvo,
        chave: item.chave ?? '',
        rotulo: item.rotulo,
        texto: item.texto,
        colecao: nome,
      },
    });
  }

  if (pontos.length) {
    await cliente.upsert(nome, { wait: true, points: pontos });
  }
  ultimoHashSincronizado = hashAtual;
  return hashAtual;
}

/** Invalida cache em memoria — proxima busca ou reindex forcado reconstroi. */
export function invalidarCacheCatalogoVetorial(): void {
  ultimoHashSincronizado = '';
}

/**
 * Reindex imediato apos apply/rollback (C#42).
 * Nao quebra o apply se embeddings/Qdrant falharem.
 */
export async function reindexarCatalogoTreinadorForcado(): Promise<{
  ok: boolean;
  colecao: string;
  hash?: string;
  trechos?: number;
  motivo?: string;
}> {
  const colecao = colecaoTreinamento();
  try {
    if (!embeddingsTreinadorDisponiveis()) {
      return { ok: false, colecao, motivo: 'embeddings_indisponiveis' };
    }
    invalidarCacheCatalogoVetorial();
    const catalogo = await montarCatalogoTrechosTreinamento();
    if (!catalogo.length) {
      return { ok: true, colecao, hash: '', trechos: 0, motivo: 'catalogo_vazio' };
    }
    const hash = await sincronizarCatalogoVetorial(catalogo, true);
    return { ok: true, colecao, hash, trechos: catalogo.length };
  } catch (err) {
    return {
      ok: false,
      colecao,
      motivo: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function buscarTrechosVetoriaisTreinamento(
  pedido: string,
  limite = 8,
): Promise<TrechoTreinamentoRelacionado[]> {
  try {
    if (!embeddingsTreinadorDisponiveis()) return [];
    const catalogo = await montarCatalogoTrechosTreinamento();
    if (!catalogo.length) return [];

    const nome = colecaoTreinamento();
    const hashAtual = await sincronizarCatalogoVetorial(catalogo);
    const vetorConsulta = await gerarEmbedding(pedido.slice(0, 1800));
    if (!vetorConsulta.length) return [];
    const resultado = await cliente.search(nome, {
      vector: vetorConsulta,
      limit: limite * 3,
      with_payload: true,
      filter: {
        must: [{ key: 'hash', match: { value: hashAtual } }],
      },
    });

    const vistos = new Set<string>();
    return resultado
      .map((item) => {
        const alvo = String(
          item.payload?.alvo || 'prompt_sistema',
        ) as TrechoTreinamentoRelacionado['alvo'];
        const chave = String(item.payload?.chave || '').trim() || null;
        const texto = String(item.payload?.texto || '').trim();
        const rotulo =
          String(item.payload?.rotulo || '').trim() ||
          `${alvo}${chave ? `.${chave}` : ''}`;
        return {
          alvo,
          chave,
          rotulo,
          texto,
          score: Number(item.score || 0),
          termos: [],
          motivo: `busca vetorial score ${Number(item.score || 0).toFixed(3)}`,
          origemBusca: 'vetorial' as const,
        };
      })
      .filter((item) => item.texto && item.score >= 0.36)
      .filter((item) => {
        const chaveUnica = `${item.alvo}|${item.chave || ''}|${item.texto}`;
        if (vistos.has(chaveUnica)) return false;
        vistos.add(chaveUnica);
        return true;
      })
      .slice(0, limite);
  } catch {
    return [];
  }
}

/** True se ha token OpenAI para embeddings do catalogo do treinador. */
export function embeddingsTreinadorDisponiveis(): boolean {
  const c = config as { openaiToken?: string; openaiApiKey?: string };
  return Boolean(String(c.openaiToken || c.openaiApiKey || '').trim());
}
