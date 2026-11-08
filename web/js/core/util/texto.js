/**
 * Remove acentos (marcas diacríticas combinantes).
 * @param {string} texto
 * @returns {string}
 */
export function semAcento(texto) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Limpa texto digitado ou importado: remove caracteres de controle,
 * colapsa espaços e apara as pontas. Não faz escape de HTML: a interface
 * nunca injeta texto como HTML (RNF-06).
 * @param {string | undefined | null} texto
 * @returns {string}
 */
export function limparTexto(texto) {
  if (!texto) return '';
  return texto
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chave de comparação de nomes: minúsculo, sem acento, espaços colapsados.
 * @param {string} texto
 * @returns {string}
 */
export function chaveNome(texto) {
  return semAcento(limparTexto(texto)).toLowerCase();
}

/**
 * Slug para nomes de arquivo: minúsculo, sem acento, qualquer sequência
 * não alfanumérica vira `_`, sem `_` nas pontas.
 * Ex.: "Concessão de Crédito" → "concessao_de_credito"; "v1.2" → "v1_2".
 * @param {string} texto
 * @returns {string}
 */
export function slug(texto) {
  return semAcento(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
