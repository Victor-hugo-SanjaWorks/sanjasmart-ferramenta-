/**
 * Inventario da frota de apps RAG (F5.8).
 * Varre pastas *-rag com ferramenta-* em /root (config.ts de cada app).
 * Best-effort filesystem — nao exige todos os apps online.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type ItemInventarioFrota = {
  app: string;
  caminho: string;
  allowlist?: string;
  embeddings?: string;
  modelo?: string;
  promptVazio: boolean;
  erros: string[];
};

const ROOT_FROTA = '/root';

async function lerConfig(caminho: string): Promise<string | null> {
  try {
    return await readFile(caminho, 'utf8');
  } catch {
    return null;
  }
}

function extrairCampo(texto: string, padroes: RegExp[]): string | undefined {
  for (const re of padroes) {
    const m = re.exec(texto);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function analisarConfig(conteudo: string): Pick<
  ItemInventarioFrota,
  'allowlist' | 'embeddings' | 'modelo' | 'promptVazio'
> {
  const allowlist = extrairCampo(conteudo, [
    /allowlist[^=]*=\s*['"`]([^'"`]+)/i,
    /ALLOWLIST[^'"]*['"]([^'"]+)/i,
  ]);
  const embeddings = extrairCampo(conteudo, [
    /embedding[^:]*:\s*['"]([^'"]+)/i,
    /MODELO_EMBED[^'"]*['"]([^'"]+)/i,
    /text-embedding[^\s'"]+/i,
  ]);
  const modelo = extrairCampo(conteudo, [
    /modeloChat[^:]*:\s*['"]([^'"]+)/i,
    /MODELO_CHAT[^'"]*['"]([^'"]+)/i,
  ]);
  const promptVazio =
    /prompt[^'"]*['"]\s*['"]/.test(conteudo) ||
    /prompt_sistema.*=\s*['"]\s*['"]/.test(conteudo);

  return { allowlist, embeddings, modelo, promptVazio };
}

export async function gerarInventarioFrota(): Promise<ItemInventarioFrota[]> {
  const itens: ItemInventarioFrota[] = [];
  let dirs: string[] = [];
  try {
    dirs = await readdir(ROOT_FROTA);
  } catch {
    return [{ app: '?', caminho: ROOT_FROTA, promptVazio: false, erros: ['nao leu /root'] }];
  }

  for (const nome of dirs) {
    if (!nome.endsWith('-rag')) continue;
    const base = join(ROOT_FROTA, nome);
    try {
      const st = await stat(base);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }

    const subdirs = await readdir(base).catch(() => [] as string[]);
    for (const ferr of subdirs) {
      if (!ferr.startsWith('ferramenta-')) continue;
      const configPath = join(base, ferr, 'app', 'src', 'config.ts');
      const conteudo = await lerConfig(configPath);
      const app = `${nome}/${ferr}`;
      if (!conteudo) {
        itens.push({
          app,
          caminho: configPath,
          promptVazio: false,
          erros: ['config.ts ausente ou ilegivel'],
        });
        continue;
      }
      const analise = analisarConfig(conteudo);
      const erros: string[] = [];
      if (analise.promptVazio) erros.push('prompt aparentemente vazio');
      if (!analise.embeddings) erros.push('embeddings nao detectado');
      itens.push({ app, caminho: configPath, ...analise, erros });
    }
  }

  return itens.sort((a, b) => a.app.localeCompare(b.app));
}
