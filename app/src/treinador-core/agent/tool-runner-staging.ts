/**
 * Tools de staging F3.4 e restauracao de versao no runner.
 * Testa patch em ambiente isolado antes de promover para producao.
 * Complementa tool-defs-staging.ts e treinamento-staging.ts.
 */
import {
  obterPatchPendentePorId,
} from '../servicos/treinamento-config-patches.js';
import { telefoneSeguro } from '../servicos/treinamento-config-patch-utils.js';
import { restaurarVersao } from '../servicos/treinamento-versoes-store.js';
import {
  aplicarEmStaging,
  promoverStagingParaProducao,
} from '../servicos/treinamento-staging.js';
import { registrarAuditAsync } from '../servicos/treinamento-audit-log.js';
import type { AlvoPatchTreinamento } from '../servicos/treinamento-config-alvos.js';

export async function executarToolStaging(
  nome: string,
  args: Record<string, unknown>,
  telefone: string,
): Promise<unknown | null> {
  switch (nome) {
    case 'restaurar_versao': {
      const id = Number(args.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error('id de versao invalido');
      const r = await restaurarVersao(id, telefone);
      return {
        ok: true,
        restaurada: r.versao.id,
        novaVersao: r.nova.id,
        alvo: r.versao.alvo,
        chave: r.versao.chave,
        chars: r.versao.chars,
        mensagem:
          'Voltei para uma versao anterior do texto e guardei o estado atual por seguranca.',
      };
    }

    case 'aplicar_staging': {
      const id = Number(args.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error('id de patch invalido');
      const pendente = await obterPatchPendentePorId(id);
      if (!pendente) throw new Error(`Patch #${id} nao encontrado`);
      if (telefoneSeguro(pendente.telefone_autor) !== telefoneSeguro(telefone)) {
        throw new Error('Patch pertence a outro autor');
      }
      const r = await aplicarEmStaging(id, telefone);
      registrarAuditAsync({
        acao: 'aplicar_staging',
        telefone,
        intencao: pendente.origem_texto?.slice(0, 300),
        resultado: `staging patch #${id}`,
        meta: { alvos: r.previews.map((p) => p.alvo) },
      });
      return {
        ok: true,
        id,
        previews: r.previews.map((p) => ({
          alvo: p.alvo,
          chave: p.chave,
          chars: p.depois.length,
        })),
        mensagem:
          'Ajustei isso primeiro numa copia de ensaio. O atendimento real continua igual ate voce pedir para publicar.',
      };
    }

    case 'promover_staging': {
      const alvo = String(args.alvo || '') as AlvoPatchTreinamento;
      if (!alvo) throw new Error('alvo obrigatorio');
      const chave = args.chave != null ? String(args.chave) : null;
      const r = await promoverStagingParaProducao(alvo, telefone, chave);
      registrarAuditAsync({
        acao: 'promover_staging',
        telefone,
        resultado: `${alvo} promovido (${r.chars} chars)`,
      });
      return {
        ok: true,
        alvo,
        chave,
        chars: r.chars,
        mensagem: 'Publiquei no atendimento real o que voce aprovou no ensaio.',
      };
    }

    default:
      return null;
  }
}
