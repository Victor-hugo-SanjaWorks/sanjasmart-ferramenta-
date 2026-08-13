/**
 * Orquestra retomada da fila no turno atual (F4.9).
 * Motivo: WhatsApp/dashboard nao precisam duplicar a logica de processar fila.
 * Resolve texto efetivo e marca o pedido apos a resposta do agente.
 */
import {
  ehPedidoProcessarFila,
  msgFilaVazia,
  prefixoRetomadaFila,
  respostaIndicaFilaDeNovo,
} from './treinamento-fila-drain.js';
import {
  contarPendentesFila,
  marcarPedidoFila,
  obterProximoPedidoFila,
} from './treinamento-fila-pedidos.js';

export type ResolucaoFilaTurno = {
  /** Se true, nao chama o agente — devolve `respostaPronta`. */
  abortar: boolean;
  respostaPronta?: string;
  textoEfetivo: string;
  pedidoId: number | null;
  prefixo: string;
};

export async function resolverFilaNoTurno(
  telefone: string,
  texto: string,
): Promise<ResolucaoFilaTurno> {
  if (!ehPedidoProcessarFila(texto)) {
    return { abortar: false, textoEfetivo: texto, pedidoId: null, prefixo: '' };
  }
  const ped = await obterProximoPedidoFila(telefone).catch(() => null);
  if (!ped) {
    return {
      abortar: true,
      respostaPronta: msgFilaVazia(),
      textoEfetivo: texto,
      pedidoId: null,
      prefixo: '',
    };
  }
  return {
    abortar: false,
    textoEfetivo: ped.texto,
    pedidoId: ped.id,
    prefixo: prefixoRetomadaFila(ped.id),
  };
}

export async function finalizarFilaAposResposta(
  telefone: string,
  pedidoId: number | null,
  resposta: string,
): Promise<string> {
  if (pedidoId != null) {
    try {
      if (respostaIndicaFilaDeNovo(resposta)) {
        await marcarPedidoFila(pedidoId, 'pendente', 'ainda_instavel');
      } else {
        await marcarPedidoFila(pedidoId, 'processado');
      }
    } catch (err) {
      console.error('[treinador] marcar fila:', err);
    }
    return resposta;
  }
  const n = await contarPendentesFila(telefone).catch(() => 0);
  if (n > 0 && !/guardei o seu pedido|pedido pendente/i.test(resposta)) {
    return `${resposta}\n\n_Tem ${n} pedido(s) seu(s) aguardando por aqui. Quando quiser, me chama de novo que eu retomo._`;
  }
  return resposta;
}
