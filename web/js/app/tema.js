/**
 * Tema da interface. O escuro é o padrão; a escolha fica guardada neste
 * navegador (é só uma preferência de quem está usando). Os arquivos
 * exportados (BPMN, SVG) sempre saem no tema claro, para documentos e
 * outras ferramentas.
 */
/** @import { CoresTipos, OpcoesBpmn } from '../core/index.js' */

/** @typedef {'escuro' | 'claro'} Tema */

const CHAVE = 'mapeador-tema';

/** @returns {Tema} */
export function temaSalvo() {
  if (typeof document === 'undefined') return 'escuro'; // fora do navegador (testes)
  try {
    const t = localStorage.getItem(CHAVE);
    if (t === 'claro' || t === 'escuro') return t;
  } catch {
    // armazenamento bloqueado (janela anônima, política do navegador): usa o padrão
  }
  return 'escuro';
}

/** @param {Tema} t */
export function aplicarTema(t) {
  document.documentElement.dataset.tema = t;
  try {
    localStorage.setItem(CHAVE, t);
  } catch {
    // sem problema: o tema só não será lembrado
  }
}

/**
 * Mesma lógica de cor do tema claro (padrão Bizagi), com fundos escuros
 * tingidos e bordas vivas.
 * @type {CoresTipos}
 */
const CORES_ESCURAS = {
  inicio: { fundo: '#1f3312', borda: '#9bd84a' },
  intermediario: { fundo: '#3a2810', borda: '#f0a73a' },
  link: { fundo: '#3a2810', borda: '#f0a73a' },
  fim: { fundo: '#3a1b1d', borda: '#f87171' },
  tarefa: { fundo: '#13283a', borda: '#4fb0e3' },
  sistema: { fundo: '#13283a', borda: '#4fb0e3' },
  subprocesso: { fundo: '#13283a', borda: '#4fb0e3' },
  gw_exclusivo: { fundo: '#38310f', borda: '#e8c547' },
  gw_paralelo: { fundo: '#38310f', borda: '#e8c547' },
  gw_inclusivo: { fundo: '#38310f', borda: '#e8c547' },
  gw_complexo: { fundo: '#38310f', borda: '#e8c547' },
  gw_evento: { fundo: '#38310f', borda: '#e8c547' },
  anotacao: { fundo: '#161a21', borda: '#8892a0' },
};

/**
 * Opções de cor do BPMN desenhado na tela, por tema.
 * @type {Record<Tema, Partial<OpcoesBpmn>>}
 */
export const CORES_DIAGRAMA = {
  claro: {},
  escuro: {
    cores: CORES_ESCURAS,
    corTexto: '#e6e9ee',
    corLinha: '#9aa4b2',
    corFundoPiscina: '#141920',
  },
};

/**
 * Faixas de cabeçalho da pool e das raias (onde fica o nome na vertical), como no Bizagi.
 * @type {Record<Tema, { piscina: string, raia: string }>}
 */
export const CABECALHOS = {
  claro: { piscina: '#D5E1EF', raia: '#E9EFF7' },
  escuro: { piscina: '#1e2836', raia: '#19212c' },
};

/** Fonte dos rótulos do diagrama (na tela e no SVG exportado). */
export const FONTE_DIAGRAMA = {
  fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif',
  fontSize: 11.5,
  lineHeight: 1.2,
};
