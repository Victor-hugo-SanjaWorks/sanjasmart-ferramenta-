/**
 * Reversoes de patch aprovado (F4.7 + legado por preview.antes).
 * Separado do CRUD de propostas para manter patches.ts sob 300 linhas.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { salvarTextoAtualizado } from './treinamento-config-lote.js';
import { telefoneSeguro } from './treinamento-config-patch-utils.js';
import { garantirTabelaPatchesPendentes } from './treinamento-config-schema.js';
import {
  normalizarPatchPendenteExport,
  obterPatchPendentePorId,
  type PatchConfiguracaoPendente,
} from './treinamento-config-patches.js';
import { reverterPatchViaVersoes } from './treinamento-versoes-store.js';
import { reindexarCatalogoTreinadorForcado } from './treinamento-config-vetorial.js';
import { registrarAuditAsync } from './treinamento-audit-log.js';
import { pool } from '../../pg-pool.js';


export async function reverterPatchConfiguracao(
  id: number,
  confirmadoPor: string,
): Promise<void> {
  const patch = await obterPatchPendentePorId(id);
  if (!patch) throw new Error('Patch nao encontrado');
  if (patch.status !== 'aprovado') throw new Error('So e possivel reverter patches aprovados');

  try {
    await reverterPatchViaVersoes(id, confirmadoPor);
  } catch (errVersao) {
    if (!patch.previews_json.length) {
      throw errVersao instanceof Error
        ? errVersao
        : new Error('Patch sem previews/versoes para reverter');
    }
    for (const preview of patch.previews_json) {
      await salvarTextoAtualizado(
        preview.alvo,
        preview.chave,
        preview.antes,
        `treinador_revert:${confirmadoPor}`,
      );
    }
  }
  await pool.query(
    `UPDATE whatsapp_config_patches_pendentes
     SET status = 'revertido', confirmado_por = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [id, confirmadoPor],
  );
  registrarAuditAsync({
    acao: 'reverter_patch',
    telefone: confirmadoPor,
    intencao: patch.origem_texto?.slice(0, 500) || null,
    resultado: `patch #${id} revertido`,
    meta: { resumo: patch.resumo },
  });
  try {
    await reindexarCatalogoTreinadorForcado();
  } catch (err) {
    console.error('[treinador] reindex apos revert falhou:', err);
  }
}

export async function reverterUltimoPatchAprovado(
  confirmadoPor: string,
  telefoneAutor?: string,
): Promise<{ id: number; resumo: string } | null> {
  await garantirTabelaPatchesPendentes(pool);
  const condicao = telefoneAutor
    ? 'WHERE status = $1 AND telefone_autor = $2'
    : 'WHERE status = $1';
  const params = telefoneAutor
    ? ['aprovado', telefoneSeguro(telefoneAutor)]
    : ['aprovado'];
  const res = await pool.query<PatchConfiguracaoPendente>(
    `SELECT * FROM whatsapp_config_patches_pendentes
     ${condicao}
     ORDER BY criado_em DESC, id DESC
     LIMIT 1`,
    params,
  );
  if (!res.rows.length) return null;
  const patch = normalizarPatchPendenteExport(res.rows[0]);
  await reverterPatchConfiguracao(patch.id, confirmadoPor);
  return { id: patch.id, resumo: patch.resumo };
}
