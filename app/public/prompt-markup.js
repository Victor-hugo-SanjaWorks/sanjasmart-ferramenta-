"use strict";
var teaPromptMarkup = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/prompt-markup.ts
  var prompt_markup_exports = {};
  __export(prompt_markup_exports, {
    RE_TOOL_MENTION: () => RE_TOOL_MENTION,
    balancearEsteticaPorLinha: () => balancearEsteticaPorLinha,
    corSecaoDoTitulo: () => corSecaoDoTitulo,
    corValida: () => corValida,
    ehMencaoTool: () => ehMencaoTool,
    htmlEditorParaTexto: () => htmlEditorParaTexto,
    inlineHtmlParaWhatsapp: () => inlineHtmlParaWhatsapp,
    inlineWhatsappParaHtml: () => inlineWhatsappParaHtml,
    legacyMarkdownParaMarkup: () => legacyMarkdownParaMarkup,
    listarSecoesMarkup: () => listarSecoesMarkup,
    markupParaLlm: () => markupParaLlm,
    normalizarMarkup: () => normalizarMarkup,
    pareceMarkupPrompt: () => pareceMarkupPrompt,
    parseBlocos: () => parseBlocos,
    removerEstetica: () => removerEstetica,
    tamanhoValido: () => tamanhoValido,
    temMarcadoresSecao: () => temMarcadoresSecao,
    textoParaHtmlEditor: () => textoParaHtmlEditor,
    tituloSecaoComCor: () => tituloSecaoComCor,
    tituloSecaoLimpo: () => tituloSecaoLimpo
  });
  var RE_ABERTURA = /~abertura da seção:\s*([^~]+?)~/gi;
  var RE_FIM = /~fim da seção:\s*([^~]+?)~/gi;
  var RE_H_LEGACY = /^(#{2,4})\s+(.+)$/;
  function escaparHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function desencaparHtml(s) {
    return String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  var RE_TOOL_MENTION = /@tool-(?:midia-)?[a-zA-Z0-9_-]+/g;
  function ehMencaoTool(texto) {
    return /^@tool-(?:midia-)?[a-zA-Z0-9_-]+$/.test(String(texto || ""));
  }
  var RE_COR = /\{cor:(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)(\|h)?\}([\s\S]*?)\{\/cor(\|h)?\}/g;
  var RE_TAM = /\{tam:(\d{1,3})(\|h)?\}([\s\S]*?)\{\/tam(\|h)?\}/g;
  var RE_MARCA_ESTETICA = /\{cor:(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\}|\{tam:(\d{1,3})\}|\{\/(cor|tam)\}/g;
  function corValida(valor) {
    const v = String(valor || "").trim();
    return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(v) ? v : "";
  }
  var RE_SEC_COR_TITULO = /\s*\[(#[0-9a-fA-F]{3,8})\]\s*$/i;
  function tituloSecaoLimpo(titulo) {
    return String(titulo || "").replace(RE_SEC_COR_TITULO, "").replace(/\s+/g, " ").trim();
  }
  function corSecaoDoTitulo(titulo) {
    const m = String(titulo || "").match(RE_SEC_COR_TITULO);
    return m && corValida(m[1]) ? m[1] : "";
  }
  function tituloSecaoComCor(titulo, cor) {
    const limpo = tituloSecaoLimpo(titulo);
    const c = corValida(cor);
    return c ? `${limpo} [${c}]` : limpo;
  }
  function tamanhoValido(valor) {
    const n = Math.round(Number(valor));
    return Number.isFinite(n) && n >= 6 && n <= 120 ? n : 0;
  }
  function removerEstetica(texto) {
    let s = String(texto || "");
    let antes = "";
    while (s !== antes) {
      antes = s;
      s = s.replace(RE_COR, "$3").replace(RE_TAM, "$3");
    }
    return s.replace(RE_MARCA_ESTETICA, "");
  }
  function balancearEsteticaPorLinha(texto) {
    const linhas = String(texto || "").replace(/\r\n/g, "\n").split("\n");
    const pilha = [];
    const saida = [];
    for (const linha of linhas) {
      const ehMarcadorSecao = RE_LINHA_ABERTURA.test(linha) || RE_LINHA_FIM.test(linha);
      const prefixo = pilha.map((p) => `{${p.tipo}:${p.valor}|h}`).join("");
      RE_MARCA_ESTETICA.lastIndex = 0;
      let m;
      while ((m = RE_MARCA_ESTETICA.exec(linha)) !== null) {
        if (m[1] && corValida(m[1])) pilha.push({ tipo: "cor", valor: m[1] });
        else if (m[2] && tamanhoValido(m[2])) pilha.push({ tipo: "tam", valor: String(m[2]) });
        else if (m[3]) {
          for (let i = pilha.length - 1; i >= 0; i--) {
            if (pilha[i].tipo === m[3]) {
              pilha.splice(i, 1);
              break;
            }
          }
        }
      }
      const sufixo = pilha.slice().reverse().map((p) => `{/${p.tipo}|h}`).join("");
      saida.push(ehMarcadorSecao ? linha : prefixo + linha + sufixo);
    }
    return saida.join("\n");
  }
  function heranca(hAbre, hFecha) {
    return `${hAbre ? ' data-ab="1"' : ""}${hFecha ? ' data-fe="1"' : ""}`;
  }
  function inlineWhatsappParaHtml(texto) {
    let s = escaparHtml(texto);
    const tools = [];
    s = s.replace(RE_TOOL_MENTION, (token) => {
      const indice = tools.push(token) - 1;
      return `\uE000${indice}\uE001`;
    });
    s = s.replace(/```([^`]+?)```/g, "<code>$1</code>");
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<strong>$2</strong>");
    s = s.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, "$1<em>$2</em>");
    s = s.replace(/~(?!(?:abertura|fim) da seção:)([^~\n]+?)~/gi, "<s>$1</s>");
    let antes = "";
    while (s !== antes) {
      antes = s;
      s = s.replace(RE_COR, (todo, cor, hAbre, dentro, hFecha) => {
        const c = corValida(cor);
        if (!c) return todo;
        return `<span class="pl-cor" data-cor="${c}"${heranca(hAbre, hFecha)} style="color:${c}">${dentro}</span>`;
      });
      s = s.replace(RE_TAM, (todo, tam, hAbre, dentro, hFecha) => {
        const n = tamanhoValido(tam);
        if (!n) return todo;
        return `<span class="pl-tam" data-tam="${n}"${heranca(hAbre, hFecha)} style="font-size:${n}px">${dentro}</span>`;
      });
    }
    s = s.replace(/\uE000(\d+)\uE001/g, (_marca, indiceCru) => {
      const token = tools[Number(indiceCru)] || "";
      const midia = token.startsWith("@tool-midia-");
      return `<span class="pl-tool${midia ? " pl-tool-midia" : ""}" contenteditable="false" data-token="${token}">${token}</span>`;
    });
    return s;
  }
  function spansEsteticaParaMarcacao(html) {
    const re = /<span\b[^>]*>|<\/span>/gi;
    let out = "";
    let ultimo = 0;
    const pilha = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      out += html.slice(ultimo, m.index);
      ultimo = m.index + m[0].length;
      const tag = m[0];
      if (tag.toLowerCase().startsWith("</")) {
        const fecha = pilha.pop();
        out += fecha === void 0 ? tag : fecha;
        continue;
      }
      const cor = corValida((tag.match(/data-cor="([^"]+)"/i) || [])[1] || "");
      const tam = tamanhoValido((tag.match(/data-tam="([^"]+)"/i) || [])[1] || "");
      const abriuSozinho = /data-ab="1"/i.test(tag);
      const fechaSozinho = /data-fe="1"/i.test(tag);
      if (cor) {
        out += abriuSozinho ? "" : `{cor:${cor}}`;
        pilha.push(fechaSozinho ? "" : "{/cor}");
      } else if (tam) {
        out += abriuSozinho ? "" : `{tam:${tam}}`;
        pilha.push(fechaSozinho ? "" : "{/tam}");
      } else {
        out += tag;
        pilha.push("</span>");
      }
    }
    return out + html.slice(ultimo);
  }
  function inlineHtmlParaWhatsapp(html) {
    let s = String(html || "");
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/(p|div)>/gi, "\n");
    s = spansEsteticaParaMarcacao(s);
    s = s.replace(
      /<span[^>]*class="[^"]*\bpl-tool\b[^"]*"[^>]*(?:data-token="([^"]+)")?[^>]*>([\s\S]*?)<\/span>/gi,
      (_m, token, inner) => {
        const t = String(token || "").trim();
        if (t && ehMencaoTool(t)) return t;
        const txt = desencaparHtml(String(inner || "").replace(/<[^>]+>/g, "")).trim();
        return ehMencaoTool(txt) ? txt : txt;
      }
    );
    s = s.replace(/<(strong|b)(\s[^>]*)?>/gi, "*");
    s = s.replace(/<\/(strong|b)>/gi, "*");
    s = s.replace(/<(em|i)(\s[^>]*)?>/gi, "_");
    s = s.replace(/<\/(em|i)>/gi, "_");
    s = s.replace(/<(s|strike|del)(\s[^>]*)?>/gi, "~");
    s = s.replace(/<\/(s|strike|del)>/gi, "~");
    s = s.replace(/<code(\s[^>]*)?>/gi, "```");
    s = s.replace(/<\/code>/gi, "```");
    s = s.replace(/<u(\s[^>]*)?>/gi, "_");
    s = s.replace(/<\/u>/gi, "_");
    s = s.replace(/<[^>]+>/g, "");
    return desencaparHtml(s);
  }
  function normalizarQuebras(t) {
    return String(t || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function legacyMarkdownParaMarkup(texto) {
    const lines = String(texto || "").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let aberto = null;
    let buf = [];
    function fechar() {
      if (!aberto) {
        if (buf.length) out.push(buf.join("\n"));
        buf = [];
        return;
      }
      out.push(`~abertura da se\xE7\xE3o: ${aberto}~`);
      const corpo = buf.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
      if (corpo) out.push(corpo);
      out.push(`~fim da se\xE7\xE3o: ${aberto}~`);
      aberto = null;
      buf = [];
    }
    for (const line of lines) {
      const m = line.match(RE_H_LEGACY);
      if (m) {
        fechar();
        aberto = m[2].trim();
        continue;
      }
      buf.push(line);
    }
    fechar();
    return normalizarQuebras(out.join("\n\n"));
  }
  function temMarcadoresSecao(texto) {
    RE_ABERTURA.lastIndex = 0;
    return RE_ABERTURA.test(String(texto || ""));
  }
  function normalizarMarkup(texto) {
    const t = String(texto || "");
    if (temMarcadoresSecao(t)) return normalizarQuebras(t);
    if (/^#{2,4}\s+/m.test(t)) return legacyMarkdownParaMarkup(t);
    return normalizarQuebras(t);
  }
  function parseBlocos(texto) {
    const src = normalizarMarkup(texto);
    const blocos = [];
    RE_ABERTURA.lastIndex = 0;
    const hits = [];
    let m;
    const reA = new RegExp(RE_ABERTURA.source, "gi");
    const reF = new RegExp(RE_FIM.source, "gi");
    while (m = reA.exec(src)) {
      hits.push({ i: m.index, kind: "a", titulo: m[1].trim(), len: m[0].length });
    }
    while (m = reF.exec(src)) {
      hits.push({ i: m.index, kind: "f", titulo: m[1].trim(), len: m[0].length });
    }
    hits.sort((a, b) => a.i - b.i);
    if (!hits.length) {
      if (src.trim()) blocos.push({ tipo: "gap", texto: src });
      return blocos;
    }
    let cursor = 0;
    let aberto = null;
    function pushGap(from, to) {
      const t = src.slice(from, to).replace(/^\n+/, "").replace(/\n+$/, "");
      if (t.trim()) blocos.push({ tipo: "gap", texto: t });
    }
    for (const h of hits) {
      if (h.kind === "a") {
        if (aberto) {
          const corpo = src.slice(aberto.startConteudo, h.i).replace(/^\n+/, "").replace(/\n+$/, "");
          blocos.push({ tipo: "secao", titulo: aberto.titulo, corpo });
          aberto = null;
        } else {
          pushGap(cursor, h.i);
        }
        aberto = { titulo: h.titulo, startConteudo: h.i + h.len };
        cursor = h.i + h.len;
      } else {
        if (aberto) {
          const corpo = src.slice(aberto.startConteudo, h.i).replace(/^\n+/, "").replace(/\n+$/, "");
          blocos.push({ tipo: "secao", titulo: aberto.titulo, corpo });
          aberto = null;
          cursor = h.i + h.len;
        } else {
          cursor = Math.max(cursor, h.i + h.len);
        }
      }
    }
    if (aberto) {
      const corpo = src.slice(aberto.startConteudo).replace(/^\n+/, "").replace(/\n+$/, "");
      blocos.push({ tipo: "secao", titulo: aberto.titulo, corpo });
    } else {
      pushGap(cursor, src.length);
    }
    return blocos;
  }
  var RE_LINHA_ABERTURA = /^\s*~abertura da seção:\s*([^~]*?)~\s*$/i;
  var RE_LINHA_FIM = /^\s*~fim da seção:\s*([^~]*?)~\s*$/i;
  function listarSecoesMarkup(texto) {
    const linhas = normalizarMarkup(texto).split("\n");
    const secoes = [];
    const pilha = [];
    for (let i = 0; i < linhas.length; i++) {
      const abertura = linhas[i].match(RE_LINHA_ABERTURA);
      if (abertura) {
        const titulo = tituloSecaoLimpo(abertura[1]);
        const pai = pilha[pilha.length - 1];
        pilha.push({
          titulo,
          caminho: pai ? `${pai.caminho} > ${titulo}` : titulo,
          nivel: pilha.length + 1,
          linhaAbertura: i
        });
        continue;
      }
      const fim = linhas[i].match(RE_LINHA_FIM);
      if (!fim || !pilha.length) continue;
      const tituloFim = tituloSecaoLimpo(fim[1]).toLocaleLowerCase("pt-BR");
      let idx = pilha.length - 1;
      while (idx >= 0 && tituloSecaoLimpo(pilha[idx].titulo).toLocaleLowerCase("pt-BR") !== tituloFim)
        idx--;
      if (idx < 0) continue;
      while (pilha.length - 1 >= idx) {
        const aberta = pilha.pop();
        secoes.push({
          ...aberta,
          linhaFim: i,
          corpo: linhas.slice(aberta.linhaAbertura + 1, i).join("\n").trim()
        });
      }
    }
    const ultimaLinha = Math.max(0, linhas.length - 1);
    while (pilha.length) {
      const aberta = pilha.pop();
      secoes.push({
        ...aberta,
        linhaFim: ultimaLinha,
        corpo: linhas.slice(aberta.linhaAbertura + 1).join("\n").trim()
      });
    }
    return secoes.sort((a, b) => a.linhaAbertura - b.linhaAbertura);
  }
  function textoParaHtmlEditor(texto) {
    let src = String(texto || "").replace(/\r\n/g, "\n");
    if (!temMarcadoresSecao(src) && /^#{2,4}\s+/m.test(src)) {
      src = legacyMarkdownParaMarkup(src);
    }
    const linhas = balancearEsteticaPorLinha(src).split("\n");
    const out = [];
    const pilha = [];
    const linhaHtml = (l, classe) => `<div class="pl${classe ? " " + classe : ""}">${l ? inlineWhatsappParaHtml(l) : "<br>"}</div>`;
    const linhaTitulo = (linha, tituloBruto, tituloVisivel, nivel) => {
      const doisPontos = linha.indexOf(":");
      let inicioTitulo = doisPontos >= 0 ? doisPontos + 1 : 0;
      while (/\s/.test(linha[inicioTitulo] || "")) inicioTitulo++;
      const antes = linha.slice(0, inicioTitulo);
      const depois = linha.slice(antes.length + tituloBruto.length);
      return `<div class="pl pl-marca pl-marca-abre" data-nivel="${nivel}"><span class="pl-fold" contenteditable="false" role="button" tabindex="-1" aria-label="Abrir ou fechar se\xE7\xE3o"></span><span class="pl-marca-sintaxe">${escaparHtml(antes)}</span><span class="pl-titulo">${escaparHtml(tituloVisivel)}</span><span class="pl-marca-sintaxe">${escaparHtml(depois)}</span></div>`;
    };
    for (const l of linhas) {
      const abertura = l.match(RE_LINHA_ABERTURA);
      if (abertura) {
        const tituloBruto = abertura[1].trim();
        const titulo = tituloSecaoLimpo(tituloBruto);
        const cor = corSecaoDoTitulo(tituloBruto);
        const nivel = pilha.length + 1;
        const corAttr = cor ? ` data-sec-cor="${escaparHtml(cor)}" style="--sec-cor:${escaparHtml(cor)}"` : "";
        out.push(`<div class="prompt-sec" data-nivel="${nivel}"${corAttr}>`);
        pilha.push(titulo);
        out.push(linhaTitulo(l, tituloBruto, titulo, nivel));
        continue;
      }
      const fim = l.match(RE_LINHA_FIM);
      if (fim) {
        out.push(linhaHtml(l, "pl-marca pl-marca-fecha"));
        const tituloFim = tituloSecaoLimpo(fim[1]).toLocaleLowerCase("pt-BR");
        if (pilha.length && tituloSecaoLimpo(pilha[pilha.length - 1]).toLocaleLowerCase("pt-BR") === tituloFim) {
          out.push("</div>");
          pilha.pop();
        } else {
          const idx = pilha.map((t) => tituloSecaoLimpo(t).toLocaleLowerCase("pt-BR")).lastIndexOf(tituloFim);
          if (idx >= 0) {
            while (pilha.length > idx) {
              out.push("</div>");
              pilha.pop();
            }
          }
        }
        continue;
      }
      out.push(linhaHtml(l, pilha.length ? "pl-dentro" : ""));
    }
    while (pilha.length) {
      out.push("</div>");
      pilha.pop();
    }
    if (!out.length) out.push('<div class="pl"><br></div>');
    return out.join("");
  }
  function tituloDeHeading(hHtml) {
    return desencaparHtml(
      String(hHtml || "").replace(/<(?:button|span)[^>]*class="[^"]*\bpl-fold\b[^"]*"[^>]*>[\s\S]*?<\/(?:button|span)>/gi, "").replace(/<span[^>]*class="[^"]*prompt-fold-seta[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "").replace(/<[^>]+>/g, "")
    ).trim();
  }
  function plParaTexto(html) {
    const re = /<div[^>]*class="[^"]*\bpl\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    const linhas = [];
    let m;
    while (m = re.exec(html)) {
      const inner = String(m[1] || "").replace(
        /<(?:button|span)[^>]*class="[^"]*\bpl-fold\b[^"]*"[^>]*>[\s\S]*?<\/(?:button|span)>/gi,
        ""
      );
      linhas.push(inlineHtmlParaWhatsapp(inner).replace(/\n+$/, "").replace(/\u00a0/g, " "));
    }
    if (!linhas.length) return null;
    return linhas.join("\n").replace(/\r\n/g, "\n");
  }
  function legadoParaTexto(html) {
    let s = String(html || "");
    s = s.replace(/<span[^>]*class="[^"]*prompt-fold-seta[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "");
    const reBlocoExistente = /<div[^>]*class="[^"]*prompt-bloco[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi;
    const partes = [];
    let lastIdx = 0;
    let bm;
    const wrapBareHeads = (chunk) => chunk.replace(/<h([123])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, _n, inner) => {
      const titulo = tituloDeHeading(inner);
      if (!titulo) return "";
      return `<div class="prompt-bloco"><h1>${escaparHtml(titulo)}</h1><div class="prompt-bloco-corpo"></div></div>`;
    });
    while (bm = reBlocoExistente.exec(s)) {
      partes.push(wrapBareHeads(s.slice(lastIdx, bm.index)));
      partes.push(bm[0]);
      lastIdx = bm.index + bm[0].length;
    }
    partes.push(wrapBareHeads(s.slice(lastIdx)));
    s = partes.join("");
    const out = [];
    const reBloco = /<div[^>]*class="[^"]*prompt-bloco[^"]*"[^>]*>\s*(?:<!--[\s\S]*?-->)?\s*<h[123][^>]*>([\s\S]*?)<\/h[123]>\s*<div[^>]*class="[^"]*prompt-bloco-corpo[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    let last = 0;
    let m;
    while (m = reBloco.exec(s)) {
      const gapTxt = inlineHtmlParaWhatsapp(s.slice(last, m.index)).trim();
      if (gapTxt) out.push(gapTxt);
      const titulo = tituloDeHeading(m[1]);
      const corpo = inlineHtmlParaWhatsapp(m[2]).replace(/^\n+/, "").replace(/\n+$/, "");
      if (titulo) {
        out.push(`~abertura da se\xE7\xE3o: ${titulo}~`);
        if (corpo) out.push(corpo);
        out.push(`~fim da se\xE7\xE3o: ${titulo}~`);
      } else if (corpo) {
        out.push(corpo);
      }
      last = m.index + m[0].length;
    }
    const after = inlineHtmlParaWhatsapp(s.slice(last)).trim();
    if (after) out.push(after);
    if (!out.length) return normalizarMarkup(inlineHtmlParaWhatsapp(String(html || "")));
    return normalizarQuebras(out.join("\n\n"));
  }
  function htmlEditorParaTexto(html) {
    const linear = plParaTexto(String(html || ""));
    if (linear !== null) return linear;
    return legadoParaTexto(html);
  }
  function markupParaLlm(texto) {
    const linhas = normalizarMarkup(texto).split("\n");
    const out = [];
    const pilha = [];
    for (const linha of linhas) {
      const abertura = linha.match(RE_LINHA_ABERTURA);
      if (abertura) {
        const titulo = tituloSecaoLimpo(abertura[1]);
        pilha.push(titulo);
        out.push(`${"#".repeat(Math.min(6, pilha.length + 1))} ${titulo}`);
        continue;
      }
      const fim = linha.match(RE_LINHA_FIM);
      if (fim) {
        if (pilha.length) pilha.pop();
        continue;
      }
      out.push(linha);
    }
    return removerEstetica(normalizarQuebras(out.join("\n")));
  }
  function pareceMarkupPrompt(texto) {
    const t = String(texto || "");
    if (temMarcadoresSecao(t)) return true;
    if (/^#{2,4}\s+\S+/m.test(t)) return true;
    if (/(^|[^*])\*[^*\n]+\*(?!\*)/.test(t)) return true;
    if (/(^|[^_])_[^_\n]+_(?!_)/.test(t)) return true;
    return false;
  }
  return __toCommonJS(prompt_markup_exports);
})();
window.teaPromptMarkup=teaPromptMarkup
