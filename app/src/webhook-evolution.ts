/**
 * Webhook Evolution API — Minas Placa clean.
 */
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { adicionarAoDebounce, tentarComandoRecomecarAtendimento } from './debounce-minasplaca.js';
import { iaEstaPausada } from './pausa-minasplaca.js';
import { linhaTemLicencaIa } from './licenca-ia.js';
import { jidEhGrupoOuLista, jidEhLid, jidEnvioPreferindoLid, telefoneDeChaveWhatsapp } from './util/telefone.js';
import type { ItemDebounce } from './lib/tipos.js';
import { adicionarAoHistorico } from './historico-minasplaca.js';
import { descobrirLidNoEvolution, lembrarJidEnvio } from './lib/wa-jid.js';
import { marcarMensagensLidas, enviarPresenca } from './lib/evolution.js';

interface MensagemUpsertData {
  key?: { remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean; id?: string; addressingMode?: string };
  message?: Record<string, unknown>;
  pushName?: string;
}

interface WebhookEvolution {
  event?: string;
  data?: MensagemUpsertData | null;
  instance?: string;
}

function normalizarEvento(evento?: string): string {
  return (evento ?? '').toLowerCase().replace(/\./g, '_');
}

function obterMensagemReal(message: any): any {
  if (!message) return {};
  if (message.ephemeralMessage?.message) {
    return obterMensagemReal(message.ephemeralMessage.message);
  }
  if (message.viewOnceMessage?.message) {
    return obterMensagemReal(message.viewOnceMessage.message);
  }
  if (message.viewOnceMessageV2?.message) {
    return obterMensagemReal(message.viewOnceMessageV2.message);
  }
  if (message.documentWithCaptionMessage?.message) {
    return obterMensagemReal(message.documentWithCaptionMessage.message);
  }
  return message;
}

async function baixarEEnviarParaDirectus(
  dados: any,
  instance: string
): Promise<string | null> {
  const messageId = dados.key?.id;
  if (!messageId) return null;

  try {
    const url = `${config.evolutionUrl}/chat/getBase64FromMediaMessage/${instance}`;
    console.log(`[webhook] Tentando baixar media do Evolution API para ID: ${messageId}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.evolutionApiKey,
      },
      body: JSON.stringify({
        message: {
          key: dados.key,
          message: dados.message
        }
      }),
    });

    if (!res.ok) {
      console.error(`[webhook] Erro ao buscar base64 da midia (${res.status}):`, await res.text());
      return null;
    }

    const json = await res.json() as { base64?: string; mimeType?: string };
    let base64Data = json.base64;
    if (!base64Data) {
      console.error(`[webhook] Nao foi retornado base64 do endpoint`);
      return null;
    }

    // Identificar e extrair extensao do mimetype ou default
    let ext = 'jpg';
    let mimeType = 'image/jpeg';
    if (json.mimeType) {
      mimeType = json.mimeType;
      const parts = json.mimeType.split('/');
      if (parts.length === 2) ext = parts[1];
    } else if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/data:([^;]+);/);
      if (match) {
        mimeType = match[1];
        const parts = match[1].split('/');
        if (parts.length === 2) ext = parts[1];
      }
    }
    
    if (ext === 'jpeg') ext = 'jpg';
    
    // Remover prefixo data:...base64,
    if (base64Data.includes(';base64,')) {
      base64Data = base64Data.split(';base64,')[1];
    }

    const buffer = Buffer.from(base64Data, 'base64');
    
    // Criar FormData do Node 20 para envio ao Directus
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mimeType }), `${messageId}.${ext}`);
    
    console.log(`[webhook] Enviando arquivo para o Directus em: ${config.directusUrl}/files`);
    const uploadRes = await fetch(`${config.directusUrl}/files`, {
      method: 'POST',
      headers: config.directusToken ? {
        Authorization: `Bearer ${config.directusToken}`,
      } : {},
      body: formData,
    });

    if (!uploadRes.ok) {
      console.error(`[webhook] Erro ao enviar arquivo para o Directus (${uploadRes.status}):`, await uploadRes.text());
      return null;
    }

    const uploadJson = await uploadRes.json() as { data?: { id?: string } };
    const fileId = uploadJson.data?.id;
    if (!fileId) {
      console.error(`[webhook] Directus nao retornou o ID do arquivo`);
      return null;
    }

    const publicUrl = `${config.directusUrl}/assets/${fileId}`;
    console.log(`[webhook] Arquivo salvo no Directus com ID ${fileId}. URL: ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error(`[webhook] Erro no fluxo Directus:`, err);
    return null;
  }
}

function extrairTexto(rawMessage?: Record<string, unknown>, urlSobrescrita?: string): string {
  const message = obterMensagemReal(rawMessage);
  if (!message) return '';
  const conversation = (message.conversation as string) ?? '';
  const extended = (message.extendedTextMessage as { text?: string })?.text ?? '';
  
  const parentUrl = (message.mediaUrl as string) ?? (message.url as string) ?? '';
  
  const imageMsg = message.imageMessage as { caption?: string; url?: string; mediaUrl?: string } | undefined;
  const imageCaption = imageMsg?.caption ?? '';
  const imageUrl = urlSobrescrita || imageMsg?.mediaUrl || imageMsg?.url || parentUrl;
  const imageText = imageUrl ? `[Imagem: ${imageUrl}] ${imageCaption}`.trim() : imageCaption;
  
  const videoMsg = message.videoMessage as { caption?: string; url?: string; mediaUrl?: string } | undefined;
  const videoCaption = videoMsg?.caption ?? '';
  const videoUrl = urlSobrescrita || videoMsg?.mediaUrl || videoMsg?.url || parentUrl;
  const videoText = videoUrl ? `[Vídeo: ${videoUrl}] ${videoCaption}`.trim() : videoCaption;

  // Documentos (imagens/logos enviados como arquivo pelo WhatsApp)
  const docMsg = message.documentMessage as { fileName?: string; caption?: string; url?: string; mediaUrl?: string; mimetype?: string } | undefined;
  const docCaption = docMsg?.caption || docMsg?.fileName || '';
  const docUrl = urlSobrescrita || docMsg?.mediaUrl || docMsg?.url || parentUrl;
  const docText = docUrl ? `[Arquivo: ${docUrl}] ${docCaption}`.trim() : docCaption;
  
  return conversation || extended || imageText || videoText || docText;
}

function detectarTipo(rawMessage?: Record<string, unknown>): ItemDebounce['tipo'] {
  const message = obterMensagemReal(rawMessage);
  if (!message) return 'texto';
  if (message.imageMessage) return 'imagem';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'documento';
  return 'texto';
}

async function transcreverComOpenRouter(base64Data: string, ext: string): Promise<string | null> {
  if (!config.openrouterToken) return null;
  try {
    let fmt = 'ogg';
    if (ext === 'mp3') fmt = 'mp3';
    else if (ext === 'wav') fmt = 'wav';
    else if (ext === 'm4a' || ext === 'aac') fmt = 'm4a';

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openrouterToken}`,
        'HTTP-Referer': config.publicUrl,
        'X-Title': 'Sanja Smart',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: base64Data,
                  format: fmt,
                },
              },
              {
                type: 'text',
                text: 'Transcreva o áudio com fidelidade para o português. Responda APENAS o texto falado, sem aspas, sem pontuação inventada e sem comentários adicionais.',
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error(`[webhook] Erro ao transcrever via OpenRouter (${res.status}):`, await res.text());
      return null;
    }

    const json = (await res.json()) as any;
    const texto = json.choices?.[0]?.message?.content?.trim();
    return texto || null;
  } catch (err) {
    console.error(`[webhook] Erro na transcricao OpenRouter:`, err);
    return null;
  }
}

async function transcreverComGroq(blob: Blob, filename: string): Promise<string | null> {
  if (!config.groqToken) return null;
  try {
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'pt');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.groqToken}`,
      },
      body: formData,
    });

    if (!res.ok) {
      console.error(`[webhook] Erro no Groq Whisper (${res.status}):`, await res.text());
      return null;
    }

    const json = (await res.json()) as { text?: string };
    return json.text?.trim() || null;
  } catch (err) {
    console.error(`[webhook] Erro ao chamar Groq Whisper:`, err);
    return null;
  }
}

async function transcreverComOpenAI(blob: Blob, filename: string): Promise<string | null> {
  if (!config.openaiApiKey) return null;
  try {
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      console.error(`[webhook] Erro na API do OpenAI Whisper (${res.status}):`, await res.text());
      return null;
    }

    const json = (await res.json()) as { text?: string };
    return json.text?.trim() || null;
  } catch (err) {
    console.error(`[webhook] Erro ao chamar OpenAI Whisper:`, err);
    return null;
  }
}

async function transcreverAudio(dados: any, instance: string): Promise<string | null> {
  if (!config.openrouterToken && !config.openaiApiKey && !config.groqToken) {
    console.warn('[webhook] Nenhuma chave de IA (OpenRouter, OpenAI ou Groq) configurada. Ignorando transcricao de audio.');
    return null;
  }

  const messageId = dados.key?.id;
  if (!messageId) return null;

  try {
    const url = `${config.evolutionUrl}/chat/getBase64FromMediaMessage/${instance}`;
    console.log(`[webhook] Baixando audio do Evolution API para transcrição. ID: ${messageId}`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.evolutionApiKey,
      },
      body: JSON.stringify({
        message: {
          key: dados.key,
          message: dados.message
        }
      }),
    });

    if (!res.ok) {
      console.error(`[webhook] Erro ao buscar base64 do audio (${res.status}):`, await res.text());
      return null;
    }

    const json = await res.json() as { base64?: string; mimeType?: string };
    let base64Data = json.base64;
    if (!base64Data) {
      console.error(`[webhook] Nao foi retornado base64 do endpoint de audio`);
      return null;
    }

    if (base64Data.includes(';base64,')) {
      base64Data = base64Data.split(';base64,')[1];
    }

    let mimeType = 'audio/ogg';
    let ext = 'ogg';
    if (json.mimeType) {
      mimeType = json.mimeType;
      const parts = json.mimeType.split('/');
      if (parts.length === 2) {
        ext = parts[1].split(';')[0];
      }
    }

    let textoTranscrito: string | null = null;

    // 1. Tenta transcrição nativa pelo OpenRouter (usando a chave já ativa do OpenRouter)
    if (config.openrouterToken) {
      console.log(`[webhook] Transcrevendo audio via OpenRouter (Gemini Audio)...`);
      textoTranscrito = await transcreverComOpenRouter(base64Data, ext);
    }

    // 2. Fallback para OpenAI Whisper se configurado
    if (!textoTranscrito && config.openaiApiKey) {
      console.log(`[webhook] Enviando audio para o OpenAI Whisper...`);
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([buffer], { type: mimeType });
      textoTranscrito = await transcreverComOpenAI(blob, `${messageId}.${ext}`);
    }

    // 3. Fallback para Groq Whisper se configurado
    if (!textoTranscrito && config.groqToken) {
      console.log(`[webhook] Enviando audio para o Groq Whisper...`);
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([buffer], { type: mimeType });
      textoTranscrito = await transcreverComGroq(blob, `${messageId}.${ext}`);
    }

    if (textoTranscrito) {
      console.log(`[webhook] Audio transcrito com sucesso: "${textoTranscrito}"`);
      return textoTranscrito;
    }

    return null;
  } catch (err) {
    console.error(`[webhook] Erro ao transcrever audio:`, err);
    return null;
  }
}

export async function rotasWebhook(app: FastifyInstance): Promise<void> {
  app.post('/webhook/evolution', async (req, reply) => {
    const payload = req.body as WebhookEvolution;

    if (normalizarEvento(payload.event) !== 'messages_upsert') {
      return reply.status(200).send({ ok: true, ignorado: payload.event });
    }

    const dados = payload.data ?? {};
    if (dados.key?.fromMe) {
      // Mensagem enviada pelo celular/painel (atendente): registra lado Tilit e agenda follow-up.
      // Evita confundir silêncio do cliente com “ainda estamos respondendo”.
      try {
        const remoteJid = dados.key?.remoteJid ?? '';
        if (!remoteJid || remoteJid.endsWith('@g.us')) {
          return reply.status(200).send({ ok: true, ignorado: 'fromMe_sem_jid' });
        }
        const telefone = telefoneDeChaveWhatsapp(dados.key);
        const instance = payload.instance ?? config.evolutionInstance;
    if (!(await linhaTemLicencaIa(instance))) {
          return reply.status(200).send({ ok: true, ignorado: 'fromMe_sem_licenca' });
        }
        const message = dados.message ?? {};
        const texto = extrairTexto(message).trim();
        if (!texto) {
          return reply.status(200).send({ ok: true, ignorado: 'fromMe_sem_texto' });
        }
        // Só marca atendente quando a IA está pausada (humano no controle).
        // Com IA ligada o debounce já grava `assistant` antes do envio.
        if (await iaEstaPausada(telefone)) {
          await adicionarAoHistorico(telefone, [
            { role: 'atendente', content: texto, timestamp: Date.now() },
          ]);
          // Não agenda FUP com IA pausada (processar ignoraria). Ao religar, reagenda.
          return reply.status(200).send({ ok: true, fromMe: 'atendente_registrado' });
        }
      } catch (err) {
        console.error('[webhook] fromMe tratamento falhou:', err);
      }
      return reply.status(200).send({ ok: true, ignorado: 'fromMe' });
    }

    const remoteJidRaw = dados.key?.remoteJid ?? '';
    if (!remoteJidRaw) {
      return reply.status(200).send({ ok: true, ignorado: 'sem_remoteJid' });
    }

    // Só 1:1 — nunca responder em grupo, lista ou newsletter. @lid é conversa 1:1.
    if (jidEhGrupoOuLista(remoteJidRaw)) {
      console.log(`[webhook] grupo/lista ignorado: ${remoteJidRaw}`);
      return reply.status(200).send({ ok: true, ignorado: 'grupo_ou_lista' });
    }

    let remoteJid = jidEnvioPreferindoLid(dados.key);
    const telefone = telefoneDeChaveWhatsapp(dados.key);
    const instance = payload.instance ?? config.evolutionInstance;
    const msgId = String(dados.key?.id || '');
    if (!jidEhLid(remoteJid)) {
      const lid = await descobrirLidNoEvolution(instance, telefone);
      if (lid) remoteJid = lid;
    }
    await lembrarJidEnvio(telefone, remoteJid);
    if (msgId) {
      void marcarMensagensLidas(instance, remoteJid, [msgId]);
    }
    void enviarPresenca(instance, remoteJid, 'available');

    

    

    const message = dados.message ?? {};

    // Comando de sistema (texto puro): bypass licença/pausa antes de mídia/STT.
    const textoComando = extrairTexto(message).trim();
    if (textoComando && (await tentarComandoRecomecarAtendimento(telefone, textoComando, 'evolution'))) {
      return reply.status(200).send({ ok: true, comando: 'recomecar-atendimento' });
    }

    if (!(await linhaTemLicencaIa(instance))) {
      console.log(`[webhook] sem licenca IA na linha ${instance} — ignorado`);
      return reply.status(200).send({ ok: true, ignorado: 'sem_licenca_ia', instance });
    }

    
    
    // Log do payload completo para debug de estrutura do Evolution API
    console.log(`[webhook] DEBUG dados recebidos para ${telefone}:`, JSON.stringify(dados, null, 2));

    const tipo = detectarTipo(message);
    
    let urlSobrescrita: string | undefined;
    if (tipo === 'imagem' || tipo === 'documento') {
      const publicUrl = await baixarEEnviarParaDirectus(dados, instance);
      if (publicUrl) {
        urlSobrescrita = publicUrl;
      }
    }

    let texto = extrairTexto(message, urlSobrescrita);

    if (tipo === 'audio') {
      const transcrito = await transcreverAudio(dados, instance);
      if (transcrito) {
        texto = `[Áudio]: ${transcrito}`;
      }
    }

    if (await iaEstaPausada(telefone)) {
      console.log(`[webhook] IA pausada para ${telefone} — mensagem ignorada`);
      return reply.status(200).send({ ok: true, ignorado: 'ia_pausada', telefone });
    }

    if (!texto) {
      if (tipo === 'texto') {
        return reply.status(200).send({ ok: true, ignorado: 'sem_texto' });
      } else {
        const labels: Record<string, string> = {
          imagem: '[Imagem]',
          video: '[Vídeo]',
          audio: '[Áudio]',
          documento: '[Arquivo]'
        };
        texto = labels[tipo] || `[${tipo}]`;
      }
    }

    await adicionarAoDebounce({
      remoteJid,
      telefone,
      conteudo: texto,
      tipo,
      pushName: dados.pushName,
      instance,
      recebidoEm: Date.now(),
    });

    return reply.status(200).send({ ok: true, processado: true });
  });
}
