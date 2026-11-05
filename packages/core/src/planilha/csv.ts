/**
 * CSV (RFC 4180) com detecção de separador. O Excel em pt-BR grava com `;`,
 * outras ferramentas com `,` ou tabulação.
 */

export type Linhas = string[][];

/** Escolhe o separador mais frequente fora de aspas na primeira linha. */
export function detectarSeparador(texto: string): string {
  const candidatos = [';', ',', '\t'];
  const contagem = new Map(candidatos.map((c) => [c, 0]));
  let aspas = false;
  for (const ch of texto) {
    if (ch === '"') aspas = !aspas;
    else if (!aspas && (ch === '\n' || ch === '\r')) break;
    else if (!aspas && contagem.has(ch)) contagem.set(ch, contagem.get(ch)! + 1);
  }
  const [melhor, vezes] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return vezes > 0 ? melhor : ';';
}

export function lerCsv(texto: string, separador = detectarSeparador(texto)): Linhas {
  const t = texto.replace(/^﻿/, '');
  const linhas: Linhas = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (aspas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
    } else if (ch === '"' && campo === '') {
      aspas = true;
    } else if (ch === separador) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += ch;
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

export function escreverCsv(linhas: Linhas, opcoes: { separador?: string; bom?: boolean } = {}): string {
  const sep = opcoes.separador ?? ';';
  const corpo = linhas
    .map((l) => l.map((c) => (/[";\r\n,\t]/.test(c) || c !== c.trim() ? `"${c.replace(/"/g, '""')}"` : c)).join(sep))
    .join('\r\n');
  // BOM: faz o Excel reconhecer UTF-8 (acentos) ao abrir com dois cliques
  return (opcoes.bom ?? true ? '﻿' : '') + corpo + '\r\n';
}
