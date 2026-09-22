/**
 * Catálogo WhatsApp SanjaSmart — Evolution (2.25 / infra-3).
 */
import { config } from '../config.js';

export type WaProvider = 'uazapi' | 'evolution';

export type WaInstanciaMeta = {
  name: string;
  label: string;
  provider: WaProvider;
};

const ALIASES_EVO: Record<string, string> = {
  principal: 'sanjasmart-principal',
  sanjasmart: 'sanjasmart-principal',
  'sanjasmart-principal': 'sanjasmart-principal',
};

function labelDe(name: string): string {
  return name.replace(/-chatwoot$/i, '').replace(/^sanjasmart-/i, '') || name;
}

export function listaInstanciasWa(): WaInstanciaMeta[] {
  const out: WaInstanciaMeta[] = [];

  if (config.uazapiToken && config.uazapiBaseUrl) {
    out.push({ name: 'atendimento', label: 'atendimento', provider: 'uazapi' });
  }

  const evo = (config.evolutionInstances?.length
    ? config.evolutionInstances
    : [config.evolutionInstance]
  ).filter((n) => n && String(n).trim());

  for (const name of evo) {
    out.push({ name, label: labelDe(name), provider: 'evolution' });
  }
  return out;
}

export function resolverMetaInstancia(raw?: string | null): WaInstanciaMeta {
  const lista = listaInstanciasWa();
  if (!lista.length) throw new Error('nenhuma_instancia_whatsapp');

  const pedida = String(raw || '').trim().toLowerCase();
  if (!pedida) return lista[0];

  const canon = ALIASES_EVO[pedida] || pedida;
  const hit = lista.find(
    (i) =>
      i.name.toLowerCase() === canon
      || i.name.toLowerCase() === pedida
      || i.label.toLowerCase() === pedida
      || i.name.replace(/-chatwoot$/i, '').toLowerCase() === pedida.replace(/-chatwoot$/i, ''),
  );
  if (!hit) throw new Error(`instancia_invalida: ${raw}`);
  return hit;
}

export function eUazAtendimento(raw?: string | null): boolean {
  if (!config.uazapiToken || !config.uazapiBaseUrl) return false;
  const pedida = String(raw || '').trim().toLowerCase();
  if (!pedida) return resolverMetaInstancia(null).provider === 'uazapi';
  return resolverMetaInstancia(raw).provider === 'uazapi';
}
