/**
 * Arquivos (ESPECIFICACAO §2 e §14): no Edge/Chrome usa a File System Access
 * API (escolher onde salvar e regravar no mesmo arquivo); nos outros
 * navegadores cai para download/upload comuns. A biblioteca
 * browser-fs-access cuida da diferença.
 */
import { fileOpen, fileSave, supported } from 'browser-fs-access';

/** O navegador permite gravar direto numa pasta escolhida? */
export const suportaPastas = supported;

/**
 * Salva um arquivo. No Edge/Chrome, reaproveita o arquivo já escolhido
 * (`handle`) ou pergunta onde salvar; nos outros navegadores, baixa.
 * `salvo: false` = o usuário cancelou.
 * @param {string | Uint8Array} conteudo
 * @param {string} nome
 * @param {string} tipo
 * @param {string} extensao
 * @param {FileSystemFileHandle} [handle]
 * @returns {Promise<{ salvo: boolean, handle?: FileSystemFileHandle }>}
 */
export async function salvarArquivo(conteudo, nome, tipo, extensao, handle) {
  const blob = new Blob([typeof conteudo === 'string' ? conteudo : new Uint8Array(conteudo)], { type: tipo });
  try {
    const h = await fileSave(blob, { fileName: nome, extensions: [extensao], mimeTypes: [tipo] }, handle ?? null, false);
    return h ? { salvo: true, handle: h } : { salvo: true };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { salvo: false };
    // arquivo antigo sem permissão ou que não existe mais: pergunta onde salvar de novo
    if (handle) return salvarArquivo(conteudo, nome, tipo, extensao);
    throw e;
  }
}

/**
 * @param {string[]} extensoes
 * @returns {Promise<{ nome: string, bytes: Uint8Array, handle?: FileSystemFileHandle } | null>}
 */
export async function abrirArquivoDoDisco(extensoes) {
  try {
    const arquivo = await fileOpen({ extensions: extensoes, description: 'Processos e fluxos' });
    /** @type {{ nome: string, bytes: Uint8Array, handle?: FileSystemFileHandle }} */
    const r = { nome: arquivo.name, bytes: new Uint8Array(await arquivo.arrayBuffer()) };
    if (arquivo.handle) r.handle = arquivo.handle;
    return r;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}
