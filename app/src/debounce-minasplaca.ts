/**
 * Debounce Minas Placa — acumula mensagens e dispara o agente.
 */
import { obterRedis } from './lib/redis.js';
import { jidEhGrupoOuLista, jidParaTelefone } from './util/telefone.js';
import { logEvento } from './util/log-eventos.js';
import { gerarRespostaAgente } from './agente-minasplaca.js';
import { tentarEnviarCanal } from './lib/canal-envio.js';
import { obterHistorico, adicionarAoHistorico, apagarMemoriaIaContato } from './historico-minasplaca.js';
import { config } from './config.js';
import type { ItemDebounce } from './lib/tipos.js';
import { agendarFollowup, cancelarFollowup } from './followup-minasplaca.js';
import { iaEstaPausada } from './pausa-minasplaca.js';
import { linhaTemLicencaIa } from './licenca-ia.js';
import { eUazAtendimento } from './lib/whatsapp-instancias.js';
import { mensagemEhComandoRecomecar, loteTemComandoRecomecar } from './util/comando-recomecar-atendimento.js';

const redis = obterRedis();
const PREFIXO_LISTA = 'debounce:lista:';
const PREFIXO_TIMER = 'debounce:timer:';
const PREFIXO_LOCK = 'debounce:lock:';
const TTL = 2 * 60 * 60;

async function limparFilaDebounceContato(telefone: string): Promise<void> {
  await redis.del(
    `${PREFIXO_LISTA}${telefone}`,
    `${PREFIXO_TIMER}${telefone}`,
    `${PREFIXO_LOCK}${telefone}`,
  );
}

/** Comando de sistema: zera memória da IA neste WhatsApp (sem resposta ao cliente). */
async function executarRecomecarAtendimento(telefone: string, origem: string): Promise<void> {
  await limparFilaDebounceContato(telefone);
  await cancelarFollowup(telefone).catch((err) =>
    console.error('[debounce] erro ao cancelar follow-up no recomeçar:', err),
  );
  const r = await apagarMemoriaIaContato(telefone);
  console.log(
    `[debounce] comando recomeçar-atendimento (${origem}) — historico zerado para ${r.telefone} (removidas=${r.removidas})`,
  );
}

/**
 * Entrada de webhook/inbound: se for o comando de sistema, zera memória e retorna true.
 * Bypass de pausa/licença — comando de operador, não mensagem de cliente.
 */
export async function tentarComandoRecomecarAtendimento(
  telefone: string,
  conteudo: string,
  origem = 'webhook',
): Promise<boolean> {
  if (!mensagemEhComandoRecomecar(conteudo)) return false;
  try {
    await executarRecomecarAtendimento(telefone, origem);
  } catch (err) {
    console.error('[debounce] falha ao recomeçar atendimento:', err);
  }
  return true;
}


export async function adicionarAoDebounce(item: ItemDebounce): Promise<void> {
  const telefone = item.telefone;
  const instance = item.instance || config.evolutionInstance;

  if (jidEhGrupoOuLista(item.remoteJid)) {
    console.log(`[debounce] grupo/lista ignorado: ${item.remoteJid}`);
    return;
  }

  if (mensagemEhComandoRecomecar(item.conteudo || '')) {
    try {
      await executarRecomecarAtendimento(telefone, 'enqueue');
    } catch (err) {
      console.error('[debounce] falha ao recomeçar atendimento:', err);
    }
    return;
  }

  if (!(await linhaTemLicencaIa(instance))) {
    console.log(`[debounce] sem licenca IA na linha ${instance} — nao enfileira`);
    return;
  }

  if (await iaEstaPausada(telefone)) {
    console.log(`[debounce] IA pausada para ${telefone} — mensagem nao enfileirada`);
    return;
  }

  const chaveLista = `${PREFIXO_LISTA}${telefone}`;
  const chaveTimer = `${PREFIXO_TIMER}${telefone}`;

  // Calcula o timestamp futuro para execução baseado no debounceMs
  const executaEm = Date.now() + config.debounceMs;
  const ttlSegundos = Math.ceil((config.debounceMs + 5000) / 1000);

  // Cancela o follow-up porque o cliente está mandando mensagem ativamente
  await cancelarFollowup(telefone).catch(err => console.error('[debounce] erro ao cancelar follow-up:', err));

  const pipeline = redis.pipeline();
  pipeline.rpush(chaveLista, JSON.stringify(item));
  pipeline.expire(chaveLista, TTL);
  // Armazena o timestamp alvo na chave de timer do Redis
  pipeline.set(chaveTimer, String(executaEm), 'EX', ttlSegundos);
  await pipeline.exec();
  console.log(`[debounce] mensagem adicionada para ${telefone}. Processamento agendado para timestamp ${executaEm} (daqui a ${config.debounceMs}ms)`);
}

export async function processarContato(remoteJid: string): Promise<void> {
  if (jidEhGrupoOuLista(remoteJid)) {
    console.log(`[debounce] processarContato ignorou grupo/lista: ${remoteJid}`);
    return;
  }
  const telefone = jidParaTelefone(remoteJid);
  const chaveLista = `${PREFIXO_LISTA}${telefone}`;
  const chaveLock = `${PREFIXO_LOCK}${telefone}`;

  const lock = await redis.set(chaveLock, '1', 'EX', 30, 'NX');
  if (!lock) return;

  try {
    const raw = await redis.lrange(chaveLista, 0, -1);
    console.log(`[debounce] processando ${telefone}: ${raw.length} mensagens`);
    if (!raw.length) return;
    await redis.del(chaveLista);

    const itens: ItemDebounce[] = raw.map((s) => JSON.parse(s));
    const textos = itens
      .filter((i) => i.conteudo)
      .map((i) => i.conteudo);
    const mensagem = textos.join('\n\n').trim();
    if (!mensagem) return;

    if (loteTemComandoRecomecar(textos)) {
      try {
        await executarRecomecarAtendimento(telefone, 'processar');
      } catch (err) {
        console.error('[debounce] falha ao recomeçar atendimento:', err);
      }
      return;
    }

    if (await iaEstaPausada(telefone)) {
      console.log(`[debounce] IA pausada para ${telefone} — processamento cancelado`);
      return;
    }

    const instanciaEnvio = itens[0]?.instance || config.evolutionInstance;
    if (!(await linhaTemLicencaIa(instanciaEnvio))) {
      console.log(`[debounce] sem licenca IA na linha ${instanciaEnvio} — processamento cancelado`);
      return;
    }

    const pushName = itens[0]?.pushName;
    const historico = await obterHistorico(telefone, 100);

    console.log(`[debounce] chamando agente para ${telefone} (${eUazAtendimento(instanciaEnvio) ? 'uaz' : 'evo'})`);
    const resposta = await gerarRespostaAgente({
      telefone,
      mensagem,
      historico,
      pushName,
    });

    await adicionarAoHistorico(telefone, [
      { role: 'user', content: mensagem, timestamp: Date.now() },
      { role: 'assistant', content: resposta, timestamp: Date.now() },
    ]);

    console.log(`[debounce] enviando resposta para ${telefone}: ${resposta.slice(0, 80)}`);
    const destinoJid = itens.find((i) => i.remoteJid)?.remoteJid || remoteJid;
    const resultado = await tentarEnviarCanal(telefone, resposta, instanciaEnvio, {
      fragmentar: true,
      remoteJid: destinoJid,
    });
    console.log(`[debounce] destinoJid=${destinoJid}`);
    console.log(`[debounce] resultado envio (${instanciaEnvio}):`, resultado);

    if (resultado.enviado) {
      void import('./chatwoot-sync.js')
        .then((m) => m.marcarMensagensEnviadasNoChatwoot(telefone))
        .catch(() => {});
      await agendarFollowup(telefone).catch(err => console.error('[debounce] erro ao agendar follow-up:', err));
    }
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    logEvento('debounce', 'Erro ao processar contato', { telefone, motivo }, 'error');
    console.error(`[debounce] erro: ${motivo}`);
  } finally {
    await redis.del(chaveLock);
  }
}

export function iniciarWorkerDebounce(intervaloMs = 300): void {
  console.log('[debounce] worker iniciado');
  async function tick() {
    try {
      const chaves = await redis.keys(`${PREFIXO_TIMER}*`);
      const agora = Date.now();
      
      for (const chave of chaves) {
        const valor = await redis.get(chave);
        if (!valor) continue;

        const executaEm = Number(valor);
        if (agora >= executaEm) {
          const telefone = chave.replace(PREFIXO_TIMER, '');
          // Garante exclusividade de processamento deletando a chave antes de prosseguir
          const deletado = await redis.del(chave);
          if (deletado > 0) {
            await processarContato(`${telefone}@s.whatsapp.net`);
          }
        }
      }
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      logEvento('debounce', 'Erro no worker', { motivo }, 'error');
      console.error(`[debounce] worker erro: ${motivo}`);
    }
    setTimeout(tick, intervaloMs);
  }
  tick();
}
