/**
 * Pausa da IA por LINHA WhatsApp (multi-número).
 * Regra de ouro: no máximo UMA linha com IA ligada por vez.
 */
import { obterRedis } from './lib/redis.js';

const redis = obterRedis();
const PREFIXO = 'ia:pausa_linha:';

function chave(instance: string): string {
  return `${PREFIXO}${String(instance || '').trim().toLowerCase()}`;
}

export async function linhaIaPausada(instance?: string | null): Promise<boolean> {
  const inst = String(instance || '').trim();
  if (!inst) return false;
  const raw = await redis.get(chave(inst));
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as { pausada?: boolean }).pausada === true;
  } catch {
    return raw === '1' || raw === 'true';
  }
}

export async function definirPausaLinha(
  instance: string,
  pausar: boolean,
  meta: { origem?: string } = {},
): Promise<{ instance: string; pausada: boolean; atualizado_em: string }> {
  const inst = String(instance || '').trim();
  if (!inst) throw new Error('instance obrigatoria');
  const atualizado_em = new Date().toISOString();
  const estado = { pausada: pausar, instance: inst, atualizado_em, origem: meta.origem };
  if (pausar) await redis.set(chave(inst), JSON.stringify(estado));
  else await redis.del(chave(inst));
  console.log(
    `[pausa-linha] IA ${pausar ? 'PAUSADA' : 'RELIGADA'} na linha ${inst} (origem=${meta.origem ?? 'painel'})`,
  );
  return { instance: inst, pausada: pausar, atualizado_em };
}

/** Liga IA só nesta linha; pausa todas as outras com licença. */
export async function ativarIaSomenteNestaLinha(
  instance: string,
  todasComLicenca: string[],
): Promise<{ ativa: string; pausadas: string[] }> {
  const alvo = String(instance || '').trim();
  const pausadas: string[] = [];
  for (const raw of todasComLicenca) {
    const i = String(raw || '').trim();
    if (!i) continue;
    if (i.toLowerCase() === alvo.toLowerCase()) {
      await definirPausaLinha(i, false, { origem: 'exclusiva_on' });
    } else {
      await definirPausaLinha(i, true, { origem: 'exclusiva_off' });
      pausadas.push(i);
    }
  }
  return { ativa: alvo, pausadas };
}

type LinhaMeta = {
  nome: string;
  temLicencaIa?: boolean;
  connected?: boolean;
  principal?: boolean;
};

/**
 * Se 2+ linhas com IA “ligada”, deixa só 1 (preferência: conectada+principal).
 * Retorna o nome da linha ativa ou null se todas pausadas.
 */
export async function reconciliarIaExclusiva(
  linhas: LinhaMeta[],
): Promise<string | null> {
  const comIa = linhas.filter((l) => l.temLicencaIa && l.nome);
  if (comIa.length <= 1) return comIa[0]?.nome ?? null;

  const ativas: LinhaMeta[] = [];
  for (const l of comIa) {
    if (!(await linhaIaPausada(l.nome))) ativas.push(l);
  }
  if (ativas.length <= 1) return ativas[0]?.nome ?? null;

  const preferida =
    ativas.find((l) => l.connected && l.principal) ||
    ativas.find((l) => l.connected) ||
    ativas.find((l) => l.principal) ||
    ativas[0];

  for (const l of comIa) {
    const pausar = l.nome.toLowerCase() !== preferida!.nome.toLowerCase();
    await definirPausaLinha(l.nome, pausar, { origem: 'reconciliar_exclusiva' });
  }
  console.warn(
    `[pausa-linha] reconciliou exclusividade → ativa=${preferida!.nome} (havia ${ativas.length} ligadas)`,
  );
  return preferida!.nome;
}

export async function listarPausasLinha(
  instances: string[],
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const i of instances) {
    out[i] = await linhaIaPausada(i);
  }
  return out;
}
