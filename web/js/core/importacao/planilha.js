/** @import { Processo } from '../modelo/schema.js' */
/** @import { TipoEtapa } from '../modelo/tipos.js' */
/** @import { Linhas } from '../planilha/csv.js' */
/** @import { FormaImportada, GrafoImportado, Importador, NoImportado } from './grafo-importado.js' */
import { DEFINICOES } from '../modelo/tipos.js';
import { escreverCsv, lerCsv } from '../planilha/csv.js';
import { ehXlsx, escreverXlsx, lerXlsx } from '../planilha/xlsx.js';
import { chaveNome, limparTexto } from '../util/texto.js';

export const CAMPOS_PLANILHA = [
  'id',
  'tipo',
  'descricao',
  'responsavel',
  'apoio',
  'saidas',
  'resultado',
  'regra',
];

export const CABECALHO_PLANILHA = {
  id: 'Id',
  tipo: 'Tipo',
  descricao: 'Descrição',
  responsavel: 'Responsável',
  apoio: 'Apoio',
  saidas: 'Saídas',
  resultado: 'Resultado',
  regra: 'Regra',
};

/**
 * Nomes de coluna aceitos (comparados sem acento e sem diferenciar maiúsculas).
 * @type {Record<CampoPlanilha, string[]>}
 */
const SINONIMOS_COLUNA = {
  id: ['id', 'codigo', 'cod', '#', 'n', 'no', 'numero', 'n°', 'nº', 'item'],
  tipo: ['tipo', 'tipo de etapa', 'tipo da etapa', 'elemento', 'forma'],
  descricao: [
    'descricao',
    'atividade',
    'etapa',
    'nome',
    'o que',
    'descricao da atividade',
    'descricao da etapa',
    'passo',
  ],
  responsavel: [
    'responsavel',
    'ator',
    'area',
    'raia',
    'quem',
    'executor',
    'area responsavel',
    'responsavel (raia)',
  ],
  apoio: [
    'apoio',
    'sistema',
    'documento',
    'ferramenta',
    'observacao',
    'observacoes',
    'sistema, documento ou observacao',
    'sistema/documento',
  ],
  saidas: [
    'saidas',
    'saida',
    'proximo',
    'proxima',
    'proxima etapa',
    'proximo passo',
    'destino',
    'destinos',
    'vai para',
    'sucessor',
    'sucessores',
  ],
  resultado: ['resultado', 'desfecho'],
  regra: ['regra', 'condicao'],
};

/**
 * Tipos aceitos na coluna "tipo": códigos internos, rótulos da tela e sinônimos comuns.
 * @type {[FormaImportada, string[], Record<string, string>?][]}
 */
const SINONIMOS_TIPO = [
  ['inicio', ['inicio', 'start', 'evento de inicio', 'comeco', 'começo', 'gatilho']],
  ['fim', ['fim', 'end', 'termino', 'evento de fim', 'final', 'encerramento']],
  ['tarefa', ['tarefa', 'atividade', 'task', 'manual', 'tarefa manual', 'tarefa de usuario', 'acao']],
  [
    'sistema',
    [
      'sistema',
      'tarefa de sistema',
      'automatica',
      'automatico',
      'automacao',
      'servico',
      'service',
      'robo',
      'rpa',
    ],
  ],
  ['subprocesso', ['subprocesso', 'sub-processo', 'sub processo', 'subprocess']],
  [
    'decisao',
    [
      'decisao',
      'gw_exclusivo',
      'decisao (xor)',
      'gateway',
      'gateway exclusivo',
      'xor',
      'exclusivo',
      'condicao',
      'pergunta',
    ],
  ],
  ['paralelo', ['paralelo', 'gw_paralelo', 'paralelo (and)', 'and', 'gateway paralelo']],
  ['inclusivo', ['inclusivo', 'gw_inclusivo', 'inclusivo (or)', 'or', 'gateway inclusivo']],
  ['complexo', ['complexo', 'gw_complexo', 'gateway complexo']],
  ['evento_gw', ['gw_evento', 'gateway de eventos', 'baseado em eventos', 'gateway baseado em eventos']],
  [
    'intermediario',
    ['intermediario', 'evento intermediario', 'espera', 'evento', 'evento de captura', 'captura'],
  ],
  ['intermediario', ['evento de disparo', 'disparo', 'sinal'], { evento: 'disparo' }],
  ['intermediario', ['link', 'evento de link'], { link: 'true' }],
  ['anotacao', ['anotacao', 'nota', 'comentario']],
];

const MAPA_TIPOS = new Map();
for (const [forma, nomes, extras] of SINONIMOS_TIPO) {
  for (const n of nomes) MAPA_TIPOS.set(chaveNome(n), extras ? { forma, extras } : { forma });
}

/**
 * Rótulo do tipo usado na exportação: curto e amigável para quem edita no Excel.
 * @type {Record<TipoEtapa, string>}
 */
const TIPO_EXPORTADO = {
  inicio: 'Início',
  tarefa: 'Tarefa',
  sistema: 'Sistema',
  subprocesso: 'Subprocesso',
  gw_exclusivo: 'Decisão',
  gw_paralelo: 'Paralelo',
  gw_inclusivo: 'Inclusivo',
  gw_complexo: 'Complexo',
  gw_evento: 'Gateway de eventos',
  intermediario: 'Evento intermediário',
  link: 'Link',
  fim: 'Fim',
  anotacao: 'Anotação',
};

/**
 * Encontra a linha de cabeçalho (nas 10 primeiras) e o mapeamento das colunas.
 * @param {Linhas} linhas
 * @returns {{ linhaCabecalho: number; mapeamento: MapeamentoColunas } | null}
 */
export function detectarColunas(linhas) {
  for (let i = 0; i < Math.min(10, linhas.length); i++) {
    const mapeamento = {};
    linhas[i].forEach((celula, col) => {
      const c = chaveNome(celula);
      if (!c) return;
      for (const campo of CAMPOS_PLANILHA) {
        if (mapeamento[campo] === undefined && SINONIMOS_COLUNA[campo].includes(c)) {
          mapeamento[campo] = col;
          return;
        }
      }
    });
    if (mapeamento.descricao !== undefined && Object.keys(mapeamento).length >= 2)
      return { linhaCabecalho: i, mapeamento };
  }
  return null;
}

/**
 * "SIM: E05; NÃO: E06" ou "E05, E06" ou "E05".
 * @param {string} texto
 * @returns {{ destino: string; rotulo?: string }[]}
 */
export function lerSaidas(texto) {
  const temRotulo = (p) => /:|→|->|=>/.test(p);
  return texto
    .split(/[;|\n]+/)
    .flatMap((p) => (temRotulo(p) ? [p] : p.split(',')))
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = /^(.*?)\s*(?::|→|->|=>)\s*([^:→]+)$/.exec(p);
      if (m && m[1].trim()) return { destino: m[2].trim(), rotulo: m[1].trim() };
      return { destino: p.replace(/^(?:→|->|=>)\s*/, '') };
    });
}

/**
 * @param {Linhas} linhas
 * @param {{ mapeamento?: MapeamentoColunas; titulo?: string }} [opcoes={}]
 * @returns {ResultadoPlanilha}
 */
export function planilhaParaGrafo(linhas, opcoes = {}) {
  const detectado = detectarColunas(linhas);
  if (!detectado && !opcoes.mapeamento) {
    throw new Error(
      'Não encontrei o cabeçalho da planilha. É preciso ao menos a coluna "Descrição" e mais uma (ex.: "Responsável").',
    );
  }
  const linhaCab = detectado?.linhaCabecalho ?? 0;
  const mapa = opcoes.mapeamento ?? detectado.mapeamento;
  const cabecalho = linhas[linhaCab] ?? [];
  const valor = (l, campo) => (mapa[campo] === undefined ? '' : limparTexto(l[mapa[campo]]));

  const g = { raias: [], nos: [], arestas: [], associacoes: [], avisos: [], perdas: [] };
  if (opcoes.titulo) g.titulo = opcoes.titulo;

  const dados = linhas
    .slice(linhaCab + 1)
    .filter((l) => valor(l, 'descricao') || valor(l, 'tipo') || valor(l, 'id'));
  const raias = new Map();
  const ids = dados.map((l, i) => valor(l, 'id') || String(i + 1));
  const conjuntoIds = new Set(ids);
  const saidasPorLinha = [];

  dados.forEach((l, i) => {
    const textoTipo = valor(l, 'tipo');
    const tipo = textoTipo ? MAPA_TIPOS.get(chaveNome(textoTipo)) : { forma: 'tarefa' };
    const no = {
      id: ids[i],
      rotulo: valor(l, 'descricao'),
      forma: tipo?.forma ?? 'desconhecido',
      extras: { ...(tipo?.extras ?? {}) },
    };
    if (!tipo) g.avisos.push(`Linha ${linhaCab + i + 2}: tipo "${textoTipo}" não reconhecido`);
    const resp = valor(l, 'responsavel');
    if (resp) {
      const chave = chaveNome(resp);
      if (!raias.has(chave)) {
        raias.set(chave, resp);
        g.raias.push({ id: chave, nome: resp, ordem: g.raias.length });
      }
      no.raiaId = chave;
    }
    if (valor(l, 'apoio')) no.extras.apoio = valor(l, 'apoio');
    if (valor(l, 'resultado')) no.extras.resultado = valor(l, 'resultado');
    if (valor(l, 'regra')) no.extras.documentacao = valor(l, 'regra');
    g.nos.push(no);
    saidasPorLinha.push(valor(l, 'saidas'));
  });

  g.nos.forEach((no, i) => {
    const texto = saidasPorLinha[i];
    if (no.forma === 'anotacao') {
      const alvo = lerSaidas(texto)[0]?.destino;
      if (alvo) g.associacoes.push({ anotacao: no.id, alvo });
      return;
    }
    if (!texto) {
      // vazio = próxima linha, para tipos de saída única
      const proxima = g.nos.slice(i + 1).find((n) => n.forma !== 'anotacao');
      const unica = ![
        'fim',
        'decisao',
        'paralelo',
        'inclusivo',
        'complexo',
        'evento_gw',
        'anotacao',
      ].includes(no.forma);
      if (proxima && unica) g.arestas.push({ id: `L${i + 1}`, origem: no.id, destino: proxima.id });
      return;
    }
    lerSaidas(texto).forEach((s, k) => {
      if (!conjuntoIds.has(s.destino)) {
        g.avisos.push(`Linha ${linhaCab + i + 2}: destino "${s.destino}" não existe na planilha`);
        return;
      }
      g.arestas.push(
        s.rotulo
          ? { id: `L${i + 1}_${k}`, origem: no.id, destino: s.destino, rotulo: s.rotulo }
          : { id: `L${i + 1}_${k}`, origem: no.id, destino: s.destino },
      );
    });
  });

  return { grafo: g, mapeamento: mapa, cabecalho };
}

/**
 * Linhas da planilha no modelo do §11.6 (cabeçalho + uma linha por etapa).
 * @param {Processo} p
 * @returns {Linhas}
 */
export function processoParaLinhas(p) {
  const cab = CAMPOS_PLANILHA.map((c) => CABECALHO_PLANILHA[c]);
  const linhas = p.etapas.map((e) => {
    const saidas =
      e.tipo === 'anotacao'
        ? (e.anotaEtapa ?? '')
        : e.saidas
            .filter((s) => s.destino)
            .map((s) => (s.rotulo ? `${s.rotulo}: ${s.destino}` : s.destino))
            .join('; ');
    let tipo = TIPO_EXPORTADO[e.tipo];
    if (e.tipo === 'intermediario' && e.evento === 'disparo') tipo = 'Evento de disparo';
    return [
      e.id,
      tipo,
      e.descricao,
      e.ator ?? '',
      e.apoio ?? '',
      saidas,
      e.tipo === 'fim' ? (e.resultado ?? '') : '',
      e.regra ?? '',
    ];
  });
  return [cab, ...linhas];
}

/**
 * @param {Processo} p
 * @returns {string}
 */
export const exportarCsv = (p) => escreverCsv(processoParaLinhas(p));
/**
 * @param {Processo} p
 * @returns {Uint8Array}
 */
export const exportarXlsx = (p) =>
  escreverXlsx(processoParaLinhas(p), { nomeAba: 'Etapas', larguras: [7, 18, 42, 22, 22, 26, 13, 24] });

/**
 * @param {Uint8Array | string} conteudo
 * @returns {Linhas}
 */
export function lerPlanilha(conteudo) {
  if (typeof conteudo !== 'string' && ehXlsx(conteudo)) return lerXlsx(conteudo);
  const texto = typeof conteudo === 'string' ? conteudo : new TextDecoder('utf-8').decode(conteudo);
  return lerCsv(texto);
}

export const importadorPlanilha = {
  formato: 'planilha',
  nome: 'Planilha (CSV ou Excel)',
  extensoes: ['.csv', '.xlsx', '.txt'],
  detectar(nome, conteudo) {
    const n = nome.toLowerCase();
    if (typeof conteudo !== 'string' && ehXlsx(conteudo)) return 0.9;
    if (n.endsWith('.csv') || n.endsWith('.txt')) {
      try {
        const texto =
          typeof conteudo === 'string'
            ? conteudo
            : new TextDecoder('utf-8').decode(conteudo.subarray(0, 20000));
        return detectarColunas(lerCsv(texto).slice(0, 10)) ? 0.9 : 0.4;
      } catch {
        return 0.3;
      }
    }
    return 0;
  },
  importar: (conteudo) => [planilhaParaGrafo(lerPlanilha(conteudo)).grafo],
};

/**
 * Rótulo de um tipo, como sai na planilha.
 * @param {TipoEtapa} t
 * @returns {string}
 */
export const rotuloPlanilha = (t) => TIPO_EXPORTADO[t] ?? DEFINICOES[t].rotulo;
/** @typedef {(typeof CAMPOS_PLANILHA)[number]} CampoPlanilha */
/** @typedef {Partial<Record<CampoPlanilha, number>>} MapeamentoColunas */
/**
 * @typedef {Object} ResultadoPlanilha
 * @property {GrafoImportado} grafo
 * @property {MapeamentoColunas} mapeamento
 * @property {string[]} cabecalho
 */
