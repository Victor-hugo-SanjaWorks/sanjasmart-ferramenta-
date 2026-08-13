/**
 * Por que existe: o admin seed (admin@slug.local) nasce sem chatwoot_user_id.
 * O clone já tem CHATWOOT_SSO_USER_ID no .env — este módulo grava o vínculo
 * para Conversas/SSO não voltar 503 “nao esta vinculado”.
 */
import type pg from 'pg';
import { config } from './config.js';

export async function vincularAdminAoSsoDoEnv(
  pool: pg.Pool,
  adminId: number,
  chatwootUserIdAtual: number | null,
): Promise<void> {
  if (chatwootUserIdAtual) return;
  const ssoId = Number(config.chatwootSsoUserId || 0);
  if (!Number.isFinite(ssoId) || ssoId <= 0) return;

  await pool.query(
    `UPDATE painel_usuarios
     SET chatwoot_user_id = $2, atualizado_em = NOW()
     WHERE id = $1 AND chatwoot_user_id IS NULL`,
    [adminId, ssoId],
  );
  console.log(`[usuarios] Admin id=${adminId} vinculado ao Atendimento SSO ${ssoId}`);
}
