/**
 * Snapshot de todas as linhas WhatsApp: conexão + licença IA + pausa por linha.
 * Serve o card do painel (contagem, menções e toggles multi-número).
 * Portátil: não depende de canal-whatsapp (funciona na frota inteira).
 */
import {
  carregarInstanciasWa,
  eUazAtendimento,
  resolverMetaInstancia,
} from './lib/whatsapp-instancias.js';
import { linhaTemLicencaIa } from './licenca-ia.js';
import { linhaIaPausada } from './pausa-linha-ia.js';
import { config } from './config.js';
import { obterInfoInstancia as evoInfo } from './lib/evolution.js';
import { uazStatus } from './lib/uazapi.js';

export type LinhaWhatsappPainel = {
  nome: string;
  label: string;
  provider: string;
  connected: boolean;
  telefone: string | null;
  profileName: string | null;
  temLicencaIa: boolean;
  iaPausadaLinha: boolean;
  principal: boolean;
};

async function statusDeLinha(meta: {
  nome: string;
  provider: string;
}): Promise<{ connected: boolean; telefone: string | null; profileName: string | null }> {
  const vazio = { connected: false, telefone: null, profileName: null };
  try {
    const usaUaz =
      meta.provider === 'uazapi'
      || (typeof eUazAtendimento === 'function' && eUazAtendimento(meta.nome));
    const job = usaUaz
      ? uazStatus().then((s) => ({
          connected: !!s.conectado,
          telefone: s.telefone ?? null,
          profileName: s.profileName ?? null,
        }))
      : evoInfo(meta.nome).then((info) => ({
          connected: !!info.connected,
          telefone: info.telefone ?? null,
          profileName: info.profileName ?? null,
        }));
    return await Promise.race([
      job,
      new Promise<typeof vazio>((resolve) => setTimeout(() => resolve(vazio), 4000)),
    ]);
  } catch {
    return vazio;
  }
}

function nomesPrincipais(): Set<string> {
  const out = new Set<string>();
  const cfg = config as {
    whatsappInstance?: string;
    licencaInstancePrincipal?: string;
    evolutionInstance?: string;
  };
  for (const raw of [
    cfg.whatsappInstance,
    cfg.licencaInstancePrincipal,
    cfg.evolutionInstance,
  ]) {
    const n = String(raw || '').trim().toLowerCase();
    if (n) out.add(n);
  }
  return out;
}

export async function listarLinhasWhatsappPainel(): Promise<{
  linhas: LinhaWhatsappPainel[];
  conectados: number;
  comLicencaIa: number;
  atualizado_em: string;
}> {
  let metas = await carregarInstanciasWa();
  if (!metas.length) {
    try {
      const cfg = config as { licencaInstancePrincipal?: string; whatsappInstance?: string };
      metas = [
        resolverMetaInstancia(
          cfg.licencaInstancePrincipal || cfg.whatsappInstance || null,
        ),
      ];
    } catch {
      metas = [];
    }
  }

  const principais = nomesPrincipais();
  const linhas: LinhaWhatsappPainel[] = [];

  for (const m of metas) {
    const st = await statusDeLinha({ nome: m.name, provider: m.provider });
    const temLicencaIa = await linhaTemLicencaIa(m.name);
    const iaPausadaLinha = temLicencaIa ? await linhaIaPausada(m.name) : false;
    const nomeLc = m.name.toLowerCase();
    linhas.push({
      nome: m.name,
      label: m.label || m.name,
      provider: m.provider,
      connected: st.connected,
      telefone: st.telefone,
      profileName: st.profileName,
      temLicencaIa,
      iaPausadaLinha,
      principal:
        principais.has(nomeLc)
        || (m.provider === 'uazapi' && [...principais].some((p) => p.includes('atendimento'))),
    });
  }

  const { reconciliarIaExclusiva } = await import('./pausa-linha-ia.js');
  await reconciliarIaExclusiva(linhas);
  for (const l of linhas) {
    if (l.temLicencaIa) l.iaPausadaLinha = await linhaIaPausada(l.nome);
  }

  return {
    linhas,
    conectados: linhas.filter((l) => l.connected).length,
    comLicencaIa: linhas.filter((l) => l.temLicencaIa).length,
    atualizado_em: new Date().toISOString(),
  };
}
