/**
 * Executa as tools do agente treinador — cerebro controla busca, leitura e critica.
 * Mutacoes (propor/aplicar/verificar) ficam em tool-runner-mutacao.ts.
 */
import { avaliarEscopoPedidoAsync } from './escopo-llm.js';
import { decidirTipoEdicaoAsync } from './politica-edicao.js';
import { buscarContextoTreinador } from './buscar-contexto.js';
import { criticarOperacoesPatch } from './criticar-patch.js';
import {
  montarResumoAlvosTreinamento,
} from '../servicos/treinamento-config-alvos.js';
import { obterPatchPendentePorId } from '../servicos/treinamento-config-patches.js';
import { rotearCausaPedido } from '../servicos/treinamento-roteador-causa.js';
import { listarCatalogoChavesTreinamento } from '../servicos/treinamento-sugerir-chave-catalogo.js';
import { sugerirChavesPorPedido } from '../servicos/treinamento-sugerir-chave.js';
import {
  adicionarExemploTreino,
  listarExemplosTreino,
} from '../servicos/treinamento-exemplos-store.js';
import { executarToolMutacao } from './tool-runner-mutacao.js';
import { executarToolOps } from './tool-runner-ops.js';
import { amigavelizarErro } from '../servicos/treinamento-erros-amigaveis.js';
import { normalizarTelefone } from '../../util/telefone.js';
import {
  executarLerAlvo,
  executarMapaSecoes,
} from './tool-runner-leitura.js';

export interface ContextoToolTreinador {
  telefone: string;
  nomeAutor?: string;
  canal?: 'whatsapp' | 'dashboard';
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

const MUTACAO = new Set([
  'propor_patch',
  'aplicar_patch',
  'verificar_comportamento',
  'cancelar_patch',
  'reverter_patch',
  'restaurar_versao',
  'propor_aprendizado',
  'aplicar_staging',
  'promover_staging',
]);

const OPS = new Set(['reverter_meu_ultimo', 'rodar_checklist_eval', 'registrar_ab']);

export async function executarToolTreinador(
  nome: string,
  argsJson: string,
  ctx: ContextoToolTreinador,
): Promise<unknown> {
  const args = parseArgs(argsJson);
  const telefone = normalizarTelefone(ctx.telefone) || ctx.telefone;
  const aprendizadoApi = await import('../servicos/treinamento-whatsapp.js');

  if (MUTACAO.has(nome)) {
    const r = await executarToolMutacao(nome, args, ctx, telefone);
    if (r !== null) return r;
  }
  if (OPS.has(nome)) {
    return executarToolOps(nome, args, telefone);
  }

  switch (nome) {
    case 'decidir_tipo_edicao':
      return decidirTipoEdicaoAsync(String(args.pedido || ''));

    case 'rotear_causa':
      return rotearCausaPedido(String(args.pedido || ''));

    case 'avaliar_escopo':
      return avaliarEscopoPedidoAsync(String(args.pedido || ''));

    case 'buscar_contexto': {
      const r = await buscarContextoTreinador({
        query: String(args.query || ''),
        modo: String(args.modo || 'auto'),
        limite: args.limite,
      });
      return {
        modoPedido: r.modoPedido,
        modoEfetivo: r.modoEfetivo,
        total: r.total,
        avisoEmbeddings: r.avisoEmbeddings,
        trechos: r.trechos.map((t) => ({
          alvo: t.alvo,
          chave: t.chave,
          rotulo: t.rotulo,
          score: t.score,
          origemBusca: t.origemBusca,
          trecho: t.texto.slice(0, 500),
          motivo: t.motivo,
        })),
      };
    }

    case 'mapa_secoes':
      return executarMapaSecoes(args);

    case 'ler_alvo':
    case 'ler_alvo_completo':
      return executarLerAlvo(args);

    case 'listar_alvos':
      return { texto: await montarResumoAlvosTreinamento() };

    case 'listar_versoes': {
      const { listarVersoes } = await import('../servicos/treinamento-versoes-store.js');
      const alvo = String(args.alvo || '');
      if (!alvo) throw new Error('alvo obrigatorio');
      const itens = await listarVersoes({
        alvo,
        chave: args.chave != null ? String(args.chave) : null,
        limite: Number(args.limite) > 0 ? Number(args.limite) : 3,
      });
      return {
        alvo,
        total: itens.length,
        versoes: itens,
        instrucao: itens.length
          ? 'Guardei ate 3 versoes recentes. Se quiser voltar, diga qual (a mais recente e a de cima).'
          : 'Ainda nao ha backup — aparece depois da primeira mudanca publicada.',
      };
    }

    case 'sugerir_chave': {
      const pedido = String(args.pedido || '').trim();
      if (pedido.length < 3) throw new Error('pedido curto demais para sugerir chave');
      const catalogo = await listarCatalogoChavesTreinamento();
      const sugestoes = sugerirChavesPorPedido(
        pedido,
        catalogo,
        Number(args.limite) > 0 ? Number(args.limite) : 5,
      );
      return {
        totalCatalogo: catalogo.length,
        sugestoes,
        instrucao: sugestoes.length
          ? `Prefira editar ${sugestoes[0].alvo}.${sugestoes[0].chave} em vez de prompt_sistema, se couber.`
          : 'Nenhuma chave forte — confirme se o certo e prompt_sistema.',
      };
    }

    case 'listar_exemplos_treino':
      return { itens: await listarExemplosTreino(Number(args.limite) > 0 ? Number(args.limite) : 8) };

    case 'adicionar_exemplo_treino': {
      const item = await adicionarExemploTreino({
        ruim: String(args.ruim || ''),
        bom: String(args.bom || ''),
        contexto: args.contexto != null ? String(args.contexto) : undefined,
      });
      return { ok: true, item };
    }

    case 'criticar_patch': {
      const id = Number(args.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error('id de patch invalido');
      const patch = await obterPatchPendentePorId(id);
      if (!patch) throw new Error('Patch nao encontrado');
      return criticarOperacoesPatch({
        pedido: patch.origem_texto,
        operacoes: patch.operacoes_json,
        previews: patch.previews_json,
      });
    }

    case 'confirmar_aprendizado': {
      const id = Number(args.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error('id de aprendizado invalido');
      const item = await aprendizadoApi.aprovarPendenciaAprendizadoWhatsapp(id, telefone);
      return {
        ok: true,
        id: item.id,
        resumo: item.resumo || item.instrucao,
        mensagem: 'Regra extra ativada.',
      };
    }

    case 'cancelar_aprendizado': {
      const id = Number(args.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error('id de aprendizado invalido');
      await aprendizadoApi.cancelarPendenciaAprendizadoWhatsapp(id, telefone);
      return { ok: true, id, mensagem: 'Descartei essa regra extra — nada foi ativado.' };
    }

    case 'listar_aprendizados': {
      const itens = (await aprendizadoApi.listarAprendizadosWhatsapp())
        .filter((i) => i.ativo)
        .slice(0, 20);
      return {
        total: itens.length,
        aviso:
          'Essas sao regras extras. Se o pedido for de texto/tom, prefira ajustar o texto principal.',
        itens: itens.map((i) => ({ id: i.id, resumo: i.resumo || i.instrucao })),
      };
    }

    default:
      throw new Error(`Tool desconhecida: ${nome}`);
  }
}

export async function executarToolTreinadorSeguro(
  nome: string,
  argsJson: string,
  ctx: ContextoToolTreinador,
): Promise<string> {
  try {
    return JSON.stringify(await executarToolTreinador(nome, argsJson, ctx));
  } catch (error) {
    const bruto = error instanceof Error ? error.message : 'falha na tool';
    const amigavel = amigavelizarErro(bruto);
    return JSON.stringify({
      erro: amigavel.mensagem,
      porque: amigavel.porque,
      comoResolver: amigavel.comoResolver,
      detalheTecnico: bruto,
      tool: nome,
    });
  }
}
