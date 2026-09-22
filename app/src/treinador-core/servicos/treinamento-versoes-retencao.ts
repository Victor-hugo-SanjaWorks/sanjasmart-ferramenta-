/**
 * Retencao soft: guarda so as N versoes mais recentes por alvo/chave.
 * Seguranca de rollback na interface — nunca bloqueia apply no WhatsApp.
 * Chamado apos gravarVersao; falha de prune nao derruba o fluxo.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { pool } from '../../pg-pool.js';


/** Ultimos 3 prompts (ou chave) — padrao da frota. */
export const MAX_VERSOES_BACKUP = 3;

function chaveNorm(chave: string | null | undefined): string | null {
  const c = chave != null ? String(chave).trim() : '';
  return c || null;
}

/**
 * Apaga versoes antigas alem do limite, mantendo as mais recentes.
 * Nao remove a versao ativa (ja e a mais recente apos apply).
 */
export async function podarVersoesAntigas(
  alvo: string,
  chave?: string | null,
  manter = MAX_VERSOES_BACKUP,
): Promise<number> {
  const lim = Math.max(1, Number(manter) || MAX_VERSOES_BACKUP);
  const res = await pool.query(
    `WITH keep AS (
       SELECT id FROM whatsapp_treinador_versoes
       WHERE alvo = $1 AND ((chave IS NULL AND $2::text IS NULL) OR chave = $2)
       ORDER BY id DESC
       LIMIT $3
     )
     DELETE FROM whatsapp_treinador_versoes v
     WHERE v.alvo = $1
       AND ((v.chave IS NULL AND $2::text IS NULL) OR v.chave = $2)
       AND v.id NOT IN (SELECT id FROM keep)
     RETURNING v.id`,
    [alvo, chaveNorm(chave), lim],
  );
  return res.rowCount || 0;
}
