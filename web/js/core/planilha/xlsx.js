/** @import { Linhas } from './csv.js' */
/**
 * Leitura e gravação mínimas de .xlsx (Office Open XML), só com texto:
 * primeira aba, células como string. Sem DOM, para rodar no navegador e
 * nos testes. Com limites contra arquivos malformados (ESPECIFICACAO §11.7).
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const LIMITE_ENTRADAS = 2000;
const LIMITE_DESCOMPACTADO = 100 * 1024 * 1024;

/** @extends Error */
export class ErroPlanilha extends Error {
  /** @default "ErroPlanilha" */
  name = 'ErroPlanilha';
}

/**
 * @param {string} s
 * @returns {string}
 */
const decodificarXml = (s) =>
  s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      const mapa = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      return mapa[e.toLowerCase()] ?? m;
    });

/**
 * @param {string} s
 * @returns {string}
 */
const codificarXml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // caracteres de controle não são permitidos em XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/**
 * Texto de todos os `<t>` de um trecho, ignorando a fonética (`<rPh>`).
 * @param {string} xml
 * @returns {string}
 */
const textosT = (xml) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => decodificarXml(m[1]))
    .join('');

/**
 * "B12" → 1 (coluna zero-based).
 * @param {string} ref
 * @returns {number}
 */
function indiceColuna(ref) {
  const letras = /^([A-Z]+)/.exec(ref)?.[1] ?? 'A';
  let n = 0;
  for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function ehXlsx(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  // procura o nome de entrada "xl/" nos primeiros KB do ZIP
  const inicio = strFromU8(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)), true);
  return inicio.includes('xl/') || inicio.includes('[Content_Types].xml');
}

/**
 * @param {Uint8Array} bytes
 * @returns {Linhas}
 */
export function lerXlsx(bytes) {
  if (!ehXlsx(bytes)) throw new ErroPlanilha('O arquivo não é uma planilha .xlsx');
  let entradas = 0;
  let total = 0;
  const desejado = (nome) =>
    nome === 'xl/workbook.xml' ||
    nome === 'xl/_rels/workbook.xml.rels' ||
    nome === 'xl/sharedStrings.xml' ||
    nome.startsWith('xl/worksheets/sheet');
  let arquivos;
  try {
    arquivos = unzipSync(bytes, {
      filter: (f) => {
        if (++entradas > LIMITE_ENTRADAS) throw new ErroPlanilha('Planilha com entradas demais');
        if (!desejado(f.name)) return false;
        total += f.originalSize;
        if (total > LIMITE_DESCOMPACTADO)
          throw new ErroPlanilha('Planilha grande demais depois de descompactada');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ErroPlanilha) throw e;
    throw new ErroPlanilha('Não foi possível abrir o arquivo .xlsx (ZIP corrompido)');
  }
  const ler = (nome) => (arquivos[nome] ? strFromU8(arquivos[nome]) : undefined);

  // Primeira aba pela ordem do workbook
  let caminhoAba = 'xl/worksheets/sheet1.xml';
  const workbook = ler('xl/workbook.xml');
  const rels = ler('xl/_rels/workbook.xml.rels');
  const rid = workbook && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (rid && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)]
      .map((m) => m[0])
      .find((r) => r.includes(`Id="${rid}"`));
    const alvo = rel && /Target="([^"]+)"/.exec(rel)?.[1];
    if (alvo) caminhoAba = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`;
  }
  const aba = ler(caminhoAba) ?? ler('xl/worksheets/sheet1.xml');
  if (!aba) throw new ErroPlanilha('A planilha não tem nenhuma aba legível');

  const compartilhadas = [...(ler('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    textosT(m[1]),
  );

  const linhas = [];
  for (const mLinha of aba.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const linha = [];
    let proxima = 0;
    for (const mCel of (mLinha[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = mCel[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const col = ref ? indiceColuna(ref) : proxima;
      proxima = col + 1;
      const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const conteudo = mCel[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(conteudo)?.[1];
      let valor = '';
      if (tipo === 's') valor = compartilhadas[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = textosT(conteudo);
      else if (tipo === 'b') valor = v === '1' ? 'VERDADEIRO' : 'FALSO';
      else if (v !== undefined) valor = decodificarXml(v);
      while (linha.length < col) linha.push('');
      linha[col] = valor;
    }
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

/**
 * @param {number} i
 * @returns {string}
 */
function letraColuna(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Grava uma planilha com uma aba; a primeira linha vira cabeçalho (negrito e congelado).
 * @param {Linhas} linhas
 * @param {{ nomeAba?: string; larguras?: number[] }} [opcoes={}]
 * @returns {Uint8Array}
 */
export function escreverXlsx(linhas, opcoes = {}) {
  const nomeAba = codificarXml((opcoes.nomeAba ?? 'Etapas').slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  const cols = (opcoes.larguras ?? [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const corpo = linhas
    .map((l, r) => {
      const celulas = l
        .map((v, c) =>
          v === ''
            ? ''
            : `<c r="${letraColuna(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${codificarXml(v)}</t></is></c>`,
        )
        .join('');
      return `<row r="${r + 1}">${celulas}</row>`;
    })
    .join('');

  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const nsR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const arquivos = {
    '[Content_Types].xml':
      xml +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
    '_rels/.rels':
      xml +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      xml +
      `<workbook xmlns="${ns}" xmlns:r="${nsR}"><sheets><sheet name="${nomeAba}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      xml +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
    'xl/styles.xml':
      xml +
      `<styleSheet xmlns="${ns}">` +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>',
    'xl/worksheets/sheet1.xml':
      xml +
      `<worksheet xmlns="${ns}">` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      (cols ? `<cols>${cols}</cols>` : '') +
      `<sheetData>${corpo}</sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(arquivos).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
}
