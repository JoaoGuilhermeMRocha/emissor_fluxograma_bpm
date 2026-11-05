/**
 * Tema da interface. O escuro é o padrão; a escolha fica guardada neste
 * navegador (é só uma preferência de quem está usando). Os arquivos
 * exportados (BPMN, SVG) sempre saem no tema claro, para documentos e
 * outras ferramentas.
 */
import type { CoresTipos, OpcoesBpmn } from '@mapeador/core';

export type Tema = 'escuro' | 'claro';

const CHAVE = 'mapeador-tema';

export function temaSalvo(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    if (t === 'claro' || t === 'escuro') return t;
  } catch {
    // armazenamento bloqueado (janela anônima, política do navegador): usa o padrão
  }
  return 'escuro';
}

export function aplicarTema(t: Tema): void {
  document.documentElement.dataset.tema = t;
  try {
    localStorage.setItem(CHAVE, t);
  } catch {
    // sem problema: o tema só não será lembrado
  }
}

/** Fundos escuros tingidos e bordas vivas, mantendo a mesma lógica de cor por tipo do tema claro. */
const CORES_ESCURAS: CoresTipos = {
  inicio: { fundo: '#15301f', borda: '#4ade80' },
  intermediario: { fundo: '#15301f', borda: '#4ade80' },
  fim: { fundo: '#3a1b1d', borda: '#f87171' },
  link: { fundo: '#112a3c', borda: '#38bdf8' },
  tarefa: { fundo: '#16294a', borda: '#6ea2ff' },
  sistema: { fundo: '#122f22', borda: '#34d399' },
  subprocesso: { fundo: '#1f2630', borda: '#94a3b8' },
  gw_exclusivo: { fundo: '#3a2b0f', borda: '#fbbf24' },
  gw_paralelo: { fundo: '#112a3c', borda: '#38bdf8' },
  gw_inclusivo: { fundo: '#35300e', borda: '#facc15' },
  gw_complexo: { fundo: '#3a1729', borda: '#f472b6' },
  gw_evento: { fundo: '#2f2417', borda: '#d6a77a' },
  anotacao: { fundo: '#161a21', borda: '#8892a0' },
};

/** Opções de cor do BPMN desenhado na tela, por tema. */
export const CORES_DIAGRAMA: Record<Tema, Partial<OpcoesBpmn>> = {
  claro: {},
  escuro: {
    cores: CORES_ESCURAS,
    corTexto: '#e6e9ee',
    corLinha: '#9aa4b2',
    corFundoPiscina: '#141920',
  },
};
