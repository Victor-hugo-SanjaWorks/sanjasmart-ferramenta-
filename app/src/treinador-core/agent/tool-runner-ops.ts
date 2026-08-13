/**
 * Tools ops extras: reverter meu ultimo, checklist eval, A/B (F3.5 F5.6 F6.1).
 * Motivo: nao inchacar tool-runner-mutacao.ts alem de 300 linhas.
 * Despachado por tool-runner.ts.
 */
import { obterPatchPendentePorId } from '../servicos/treinamento-config-patches.js';
import { reverterMeuUltimo } from '../servicos/treinamento-historico-autor.js';
import { rodarChecklistEval } from '../servicos/treinamento-checklist-eval.js';
import {
  escolherVariante,
  registrarResultadoAb,
} from '../servicos/treinamento-ab-prompt.js';
import { obterPromptBruto } from '../host/prompt.js';

export async function executarToolOps(
  nome: string,
  args: Record<string, unknown>,
  telefone: string,
): Promise<unknown> {
  switch (nome) {
    case 'reverter_meu_ultimo':
      return reverterMeuUltimo(telefone);

    case 'rodar_checklist_eval': {
      let prompt = String(args.prompt || '').trim();
      const id = Number(args.id);
      if (!prompt && Number.isFinite(id) && id > 0) {
        const p = await obterPatchPendentePorId(id);
        prompt = p?.preview_depois || p?.previews_json?.[0]?.depois || '';
      }
      if (!prompt) prompt = await obterPromptBruto().catch(() => '');
      if (!prompt) throw new Error('Nao achei texto para testar agora');
      const r = await rodarChecklistEval({ promptSistema: prompt });
      return {
        taxaPassou: r.taxaPassou,
        resumo: r.resumo,
        casos: r.casosChecklist.map((c) => ({
          id: c.id,
          passou: c.passou,
          rotulo: c.rotulo,
        })),
      };
    }

    case 'registrar_ab': {
      const variante = (String(args.variante || escolherVariante(telefone)) === 'B'
        ? 'B'
        : 'A') as 'A' | 'B';
      await registrarResultadoAb({
        telefone,
        variante,
        preferiu: args.preferiu === true,
        scoreDelta: Number(args.score) || 0,
      });
      return {
        ok: true,
        variante,
        mensagem: 'Anotei sua preferencia entre as opcoes.',
      };
    }

    default:
      throw new Error('Operacao nao reconhecida');
  }
}
