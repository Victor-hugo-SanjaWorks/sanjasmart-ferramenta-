/**
 * Importa agents do Atendimento para o painel (1 agent = 1 usuário).
 * Espelha exclusão: agent sumiu → apaga conta do iatilit (exceto último admin).
 *
 * Fatia B lite: lista Usuários fica em Redis ~45s; sync live só quando stale
 * ou forceRefresh — evita storm Chatwoot a cada abertura da aba.
 */
import { gerarSenhaProvisoria } from './credenciais-cofre.js';
import { listarAgentsAccountApi } from './chatwoot-agents.js';
import {
  listarDepartamentosChatwoot,
  listarMembrosDepartamento,
} from './chatwoot-departamentos.js';
import { obterRedis } from './lib/redis.js';
import {
  atualizarUsuario,
  criarUsuario,
  excluirUsuarioSistema,
  listarUsuarios,
  obterUsuarioPorEmail,
  type UsuarioPublico,
} from './usuarios-store.js';

const CACHE_USUARIOS_KEY = 'painel:usuarios:lista_v1';
const LOCK_USUARIOS_KEY = 'painel:usuarios:sync_lock';
/** TTL curto: UX quase ao vivo, sem martelar agents/teams a cada GET. */
const CACHE_USUARIOS_TTL_SEC = 45;

export async function invalidarCacheUsuariosPainel(): Promise<void> {
  try {
    await obterRedis().del(CACHE_USUARIOS_KEY);
  } catch {
    /* ignore */
  }
}

function senhaImportacao(): string {
  const s = gerarSenhaProvisoria();
  if (/[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s) && /[^A-Za-z0-9]/.test(s)) return s;
  return `${s}Aa1!`;
}

/** Mapa chatwoot_user_id → departamentos em que o agent é membro. */
export async function mapaDepartamentosPorAgent(opts?: {
  bypassCache?: boolean;
}): Promise<
  Map<number, Array<{ id: number; name: string }>>
> {
  const map = new Map<number, Array<{ id: number; name: string }>>();
  const teams = await listarDepartamentosChatwoot({ bypassCache: opts?.bypassCache });
  if (!teams.ok || !teams.departamentos) return map;
  for (const t of teams.departamentos) {
    const membros = await listarMembrosDepartamento(t.id);
    for (const m of membros) {
      const cur = map.get(m.id) || [];
      cur.push({ id: t.id, name: t.name });
      map.set(m.id, cur);
    }
  }
  return map;
}

export type UsuarioComDeptos = UsuarioPublico & {
  departamentos: Array<{ id: number; name: string }>;
};

/**
 * Garante usuário no painel para cada agent da account.
 * Remove do painel quem tinha vínculo e o agent sumiu no Atendimento.
 */
export async function sincronizarAgentsNoPainel(opts?: {
  bypassCache?: boolean;
}): Promise<{
  ok: boolean;
  criados: number;
  vinculados: number;
  removidos: number;
  totalAgents: number;
  motivo?: string;
}> {
  const agents = await listarAgentsAccountApi({ bypassCache: opts?.bypassCache });
  if (!agents.ok) {
    return {
      ok: false,
      criados: 0,
      vinculados: 0,
      removidos: 0,
      totalAgents: 0,
      motivo: agents.motivo || 'falha_listar_agents',
    };
  }

  let criados = 0;
  let vinculados = 0;
  let removidos = 0;
  const abasPadrao = ['assistente', 'conversas'];
  const idsAgents = new Set(agents.agents.map((a) => a.id));

  for (const a of agents.agents) {
    const email = a.email.trim().toLowerCase();
    if (!email) continue;
    const existente = await obterUsuarioPorEmail(email);
    if (!existente) {
      await criarUsuario({
        email,
        nome: a.name || email.split('@')[0] || 'Atendente',
        senha: senhaImportacao(),
        role: a.role === 'administrator' ? 'admin' : 'agente',
        abas: a.role === 'administrator' ? undefined : abasPadrao,
        chatwoot_user_id: a.id,
      });
      criados++;
      continue;
    }
    const patch: { nome?: string; chatwoot_user_id?: number } = {};
    if (!existente.chatwoot_user_id || existente.chatwoot_user_id !== a.id) {
      patch.chatwoot_user_id = a.id;
      vinculados++;
    }
    if (a.name && a.name !== existente.nome) patch.nome = a.name;
    if (Object.keys(patch).length) await atualizarUsuario(existente.id, patch);
  }

  // agent apagado no Atendimento → apaga conta iatilit vinculada
  const lista = await listarUsuarios();
  for (const u of lista) {
    if (!u.chatwoot_user_id) continue;
    if (idsAgents.has(u.chatwoot_user_id)) continue;
    try {
      await excluirUsuarioSistema(u.id);
      removidos++;
      console.log(`[sync-agents] removeu usuario painel id=${u.id} email=${u.email} (agent ${u.chatwoot_user_id} sumiu)`);
    } catch (err) {
      console.warn(`[sync-agents] nao removeu ${u.email}:`, err instanceof Error ? err.message : err);
    }
  }

  return { ok: true, criados, vinculados, removidos, totalAgents: agents.agents.length };
}

export type ListaUsuariosPainel = {
  ok: boolean;
  usuarios: UsuarioComDeptos[];
  sync?: { criados: number; vinculados: number; removidos: number; totalAgents: number };
  motivo?: string;
  cache?: boolean;
};

/** Sync + lista com departamentos para a tabela USUÁRIOS. */
export async function listarUsuariosComDepartamentos(opts?: {
  forceRefresh?: boolean;
}): Promise<ListaUsuariosPainel> {
  const redis = obterRedis();
  const force = opts?.forceRefresh === true;

  if (!force) {
    try {
      const raw = await redis.get(CACHE_USUARIOS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ListaUsuariosPainel;
        if (parsed?.ok && Array.isArray(parsed.usuarios)) {
          return { ...parsed, cache: true };
        }
      }
    } catch {
      /* segue sync */
    }
  }

  // Lock evita N abas abertas → N syncs Chatwoot em paralelo.
  let locked = false;
  try {
    const got = await redis.set(LOCK_USUARIOS_KEY, '1', 'EX', 30, 'NX');
    locked = got === 'OK';
  } catch {
    locked = true; // sem Redis: segue sem lock
  }

  if (!locked) {
    // Outro sync em andamento — espera cache (até ~5s); senão lê PG + deptos
    // do cache de teams (sem espelhar agents de novo).
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const raw = await redis.get(CACHE_USUARIOS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ListaUsuariosPainel;
          if (parsed?.ok && Array.isArray(parsed.usuarios)) {
            return { ...parsed, cache: true };
          }
        }
      } catch {
        break;
      }
    }
    const deptMap = await mapaDepartamentosPorAgent({ bypassCache: false });
    const listaFallback = await listarUsuarios();
    return {
      ok: true,
      usuarios: listaFallback.map((u) => ({
        ...u,
        departamentos: u.chatwoot_user_id ? deptMap.get(u.chatwoot_user_id) || [] : [],
      })),
      motivo: 'sync_em_andamento',
      cache: true,
    };
  }

  try {
    const sync = await sincronizarAgentsNoPainel({ bypassCache: force });
    const deptMap = sync.ok ? await mapaDepartamentosPorAgent({ bypassCache: force }) : new Map();
    const lista = await listarUsuarios();
    const usuarios: UsuarioComDeptos[] = lista.map((u) => ({
      ...u,
      departamentos: u.chatwoot_user_id ? deptMap.get(u.chatwoot_user_id) || [] : [],
    }));
    const out: ListaUsuariosPainel = {
      ok: true,
      usuarios,
      sync: sync.ok
        ? {
            criados: sync.criados,
            vinculados: sync.vinculados,
            removidos: sync.removidos,
            totalAgents: sync.totalAgents,
          }
        : undefined,
      motivo: sync.ok ? undefined : sync.motivo,
      cache: false,
    };
    try {
      await redis.set(CACHE_USUARIOS_KEY, JSON.stringify(out), 'EX', CACHE_USUARIOS_TTL_SEC);
    } catch {
      /* ignore */
    }
    return out;
  } finally {
    try {
      await redis.del(LOCK_USUARIOS_KEY);
    } catch {
      /* ignore */
    }
  }
}
