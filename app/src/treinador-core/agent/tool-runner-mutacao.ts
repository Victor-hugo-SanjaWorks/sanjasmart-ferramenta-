/**
 * Tools de mutacao de patch: propor, aplicar, verificar, cancelar, reverter.
 * Separado do tool-runner principal para manter arquivos pequenos e auditativeis.
 * Staging e aprendizado delegados a tool-runner-staging.ts e tool-runner-aprendizado.ts.
 */
import { criticarOperacoesPatch } from './criticar-patch.js';
import {
  aprovarPatchConfiguracao,
  cancelarPatchConfiguracao,
  criarPropostaPatchConfiguracao,
  obterPatchPendentePorId,
  obterUltimoPatchPendentePorTelefone,
} from '../servicos/treinamento-config-patches.js';
import {
  reverterPatchConfiguracao,
  reverterUltimoPatchAprovado,
} from '../servicos/treinamento-config-reverter.js';
import { aplicarGuardrailInjection } from '../servicos/treinamento-guardrail-injection.js';
import { checarPodeAplicarPatch } from '../servicos/treinamento-confirmacao.js';
import { rotearCausaPedido } from '../servicos/treinamento-roteador-causa.js';
import { verificarComportamentoPatch } from '../servicos/treinamento-verificar-comportamento.js';
import { sugerirChavesPorPedido } from '../servicos/treinamento-sugerir-chave.js';
import { telefoneSeguro } from '../servicos/treinamento-config-patch-utils.js';
import { checarCircuitBreaker, registrarChamadaLlm } from '../servicos/treinamento-circuit-breaker.js';
import { obterCatalogoComCache } from '../servicos/treinamento-catalogo-cache.js';
import { checarQuatroOlhos } from '../servicos/treinamento-quatro-olhos.js';
import { executarToolStaging } from './tool-runner-staging.js';
import { executarToolAprendizado } from './tool-runner-aprendizado.js';

export type CtxMutacao = {
  telefone: string;
  nomeAutor?: string;
  canal?: 'whatsapp' | 'dashboard';
};

const PEDIDO_MENSAGEM =
  /(saudac|boas\s*vind|mensagem\s+de\s+fluxo|fora\s+de\s+hora|despedida|formatacao\s+whatsapp)/i;

async function avisoChaveSeMensagem(texto: string, alvos: string[]) {
  if (!PEDIDO_MENSAGEM.test(texto)) return undefined;
  if (alvos.some((a) => a.startsWith('mensagens_fluxo') || a.startsWith('orquestracao_texto'))) {
    return undefined;
  }
  const sugestoes = sugerirChavesPorPedido(texto, await obterCatalogoComCache(), 3);
  if (!sugestoes.length) return undefined;
  const top = sugestoes[0];
  return {
    aviso:
      `Seu pedido parece mensagem/fluxo, mas a sugestao tocou ${alvos.join(', ') || 'texto principal'}. ` +
      `Talvez o certo seja ${top.alvo}.${top.chave} (${top.motivo}).`,
    sugestoes,
  };
}

export async function executarToolMutacao(
  nome: string,
  args: Record<string, unknown>,
  ctx: CtxMutacao,
  telefone: string,
): Promise<unknown> {
  const staging = await executarToolStaging(nome, args, telefone);
  if (staging !== null) return staging;

  const aprendizado = await executarToolAprendizado(nome, args, ctx, telefone);
  if (aprendizado !== null) return aprendizado;

  switch (nome) {
    case 'propor_patch': {
      const breaker = checarCircuitBreaker();
      if (!breaker.ok) {
        return {
          recusado: true,
          motivo: breaker.motivo,
          circuitBreaker: breaker,
        };
      }
      registrarChamadaLlm(800);
      const bruto = String(args.texto || '').trim();
      const { limparMarkdownUsuario } = await import(
        '../servicos/treinamento-limpar-markdown-usuario.js'
      );
      const guard = aplicarGuardrailInjection(limparMarkdownUsuario(bruto));
      if (guard.bloqueado) {
        return {
          recusado: true,
          motivo: 'Pedido bloqueado por padrao de manipulacao de instrucoes.',
          porque:
            'O texto parece tentar sobrescrever as regras do treinador (prompt-injection).',
          comoResolver:
            'Reescreva so o comportamento desejado da IA, sem "ignore instrucoes" etc.',
          motivos: guard.motivos,
        };
      }
      const texto = limparMarkdownUsuario(guard.textoLimpo);
      if (texto.length < 5) throw new Error('texto muito curto para propor patch');

      const causa = rotearCausaPedido(texto);
      if (!causa.podeEditarComTreinador && causa.causa !== 'ambiguo') {
        return {
          recusado: true,
          causa,
          motivo: causa.motivo,
          porque: causa.motivo,
          comoResolver: causa.recomendacao,
          recomendacao: causa.recomendacao,
        };
      }

      const modoBusca = args.modo_busca != null ? String(args.modo_busca) : 'auto';
      const patch = await criarPropostaPatchConfiguracao({
        texto,
        telefoneAutor: telefone,
        nomeAutor: ctx.nomeAutor,
        canal: ctx.canal || 'whatsapp',
        modoBusca,
        queryBusca: args.query_busca != null ? String(args.query_busca) : texto,
        limiteBusca: Number(args.limite_busca) > 0 ? Number(args.limite_busca) : 8,
      });
      const alvos = patch.operacoes_json.map((o) => `${o.alvo}${o.chave ? `.${o.chave}` : ''}`);
      const avisoChave = await avisoChaveSeMensagem(texto, alvos);
      return {
        id: patch.id,
        status: patch.status,
        resumo: patch.resumo,
        critica: patch.critica,
        respostaUsuario: patch.resposta_treinador,
        alvos,
        avisoChave,
        exigeConfirmacaoDupla: !!patch.critica?.exigeConfirmacaoDupla,
        instrucao: patch.critica && !patch.critica.aprovadoParaPerguntar
          ? 'Preparei a sugestao, mas encontrei pontos de atencao. Melhor revisar antes de publicar.'
          : patch.critica?.exigeConfirmacaoDupla
            ? 'Essa mudanca troca um bloco grande de texto. Antes de publicar, preciso de uma confirmacao bem clara sua.'
            : 'Nada foi alterado ainda. Se voce gostar, eu publico; se quiser, eu ajusto a sugestao.',
      };
    }

    case 'aplicar_patch': {
      let id = Number(args.id);
      if (!Number.isFinite(id) || id <= 0) {
        const ultimo = await obterUltimoPatchPendentePorTelefone(telefone);
        if (!ultimo) throw new Error('Nao achei nenhuma sugestao sua aguardando confirmacao');
        id = ultimo.id;
      }
      const pendente = await obterPatchPendentePorId(id);
      if (!pendente || pendente.status !== 'pendente') {
        throw new Error('Essa sugestao ja nao esta aguardando confirmacao');
      }
      const checagem = checarPodeAplicarPatch({
        patchTelefoneAutor: pendente.telefone_autor,
        telefoneQuemAplica: telefone,
        operacoes: pendente.operacoes_json,
        previews: pendente.previews_json,
        confirmacaoDupla: args.confirmacao_dupla === true,
        textoUsuario: String(args.texto_confirmacao || ''),
      });
      if (!checagem.ok) throw new Error(checagem.erro || 'Nao foi possivel publicar agora');
      const quatro = await checarQuatroOlhos({
        patchId: id,
        telefone,
        operacoes: pendente.operacoes_json,
        previews: pendente.previews_json,
      });
      if (!quatro.ok) throw new Error(quatro.mensagem || 'Aguardando outra confirmacao');
      const critica = criticarOperacoesPatch({
        pedido: pendente.origem_texto,
        operacoes: pendente.operacoes_json,
        previews: pendente.previews_json,
      });
      await aprovarPatchConfiguracao(id, telefone);
      return {
        ok: true,
        id,
        resumo: pendente.resumo,
        critica,
        mensagem: 'Pronto, a mudanca foi publicada.',
      };
    }

    case 'verificar_comportamento': {
      let id = Number(args.id);
      if (!Number.isFinite(id) || id <= 0) {
        const ultimo = await obterUltimoPatchPendentePorTelefone(telefone);
        if (!ultimo) throw new Error('Nao achei sugestao sua para testar');
        id = ultimo.id;
      }
      const patch = await obterPatchPendentePorId(id);
      if (!patch) throw new Error('Nao achei essa sugestao');
      if (telefoneSeguro(patch.telefone_autor) !== telefoneSeguro(telefone)) {
        throw new Error('Essa sugestao foi preparada por outra pessoa');
      }
      const preview =
        patch.previews_json.find((p) => p.alvo === 'prompt_sistema') ||
        patch.previews_json[0];
      if (!preview) throw new Error('Essa sugestao nao tem preview para testar');
      const casos = args.mensagem_teste
        ? [{ mensagemUsuario: String(args.mensagem_teste) }]
        : undefined;
      return verificarComportamentoPatch({
        promptAntes: preview.antes,
        promptDepois: preview.depois,
        pedido: patch.origem_texto,
        casos,
      });
    }

    case 'cancelar_patch': {
      let id = Number(args.id);
      if (!Number.isFinite(id) || id <= 0) {
        const ultimo = await obterUltimoPatchPendentePorTelefone(telefone);
        if (!ultimo) throw new Error('Nao achei sugestao sua para descartar');
        id = ultimo.id;
      }
      await cancelarPatchConfiguracao(id, telefone);
      return { ok: true, id, mensagem: 'Tudo certo, descartei essa sugestao e nao apliquei nada.' };
    }

    case 'reverter_patch': {
      const id = Number(args.id);
      if (Number.isFinite(id) && id > 0) {
        await reverterPatchConfiguracao(id, telefone);
        return { ok: true, id, mensagem: 'Voltei essa mudanca e deixei como estava antes.' };
      }
      const revertido = await reverterUltimoPatchAprovado(telefone, telefone);
      if (!revertido) return { ok: false, mensagem: 'Nao encontrei nenhuma mudanca recente sua para desfazer.' };
      return {
        ok: true,
        id: revertido.id,
        mensagem: 'Voltei sua ultima mudanca e restaurei o texto anterior.',
      };
    }

    default:
      return null;
  }
}
