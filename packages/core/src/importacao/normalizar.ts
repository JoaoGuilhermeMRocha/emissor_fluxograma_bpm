/**
 * Normalização (ESPECIFICACAO §11.3): transforma um Grafo Intermediário,
 * venha de qual formato vier, num processo do sistema + relatório.
 * A importação sempre gera um processo novo.
 */
import { criarProcesso, formatarIdEtapa, type OpcoesCriacao } from '../modelo/fabrica';
import { ID_ETAPA, type Etapa, type Processo, type Saida } from '../modelo/schema';
import { DEFINICOES, RESULTADOS_FIM, type TipoEtapa } from '../modelo/tipos';
import { normalizarCampos } from '../regras/edicao';
import { resolverRaias } from '../regras/raias';
import { chaveNome, limparTexto } from '../util/texto';
import { validar, type Problema } from '../validacao/validar';
import type { FormaImportada, GrafoImportado, NoImportado } from './grafo-importado';

export interface OpcoesNormalizacao extends OpcoesCriacao {
  /** Identificador do formato de origem ('bpmn', 'planilha'…). */
  formato: string;
  /** Usa as coordenadas da origem como posições manuais. Padrão: reorganizar. */
  manterLayout?: boolean;
}

export interface RelatorioImportacao {
  formato: string;
  contagens: { etapas: number; setas: number; raias: number; anotacoes: number };
  mapeamentos: { forma: FormaImportada; tipo: TipoEtapa; quantidade: number }[];
  perdas: string[];
  avisos: string[];
  /** Sugestões de início e fim quando a origem não os tem. Não são aplicadas automaticamente. */
  sugestoes: { inicio: string[]; fim: string[] };
  problemas: Problema[];
}

const FORMA_PARA_TIPO: Record<FormaImportada, TipoEtapa> = {
  inicio: 'inicio',
  fim: 'fim',
  tarefa: 'tarefa',
  sistema: 'sistema',
  subprocesso: 'subprocesso',
  decisao: 'gw_exclusivo',
  paralelo: 'gw_paralelo',
  inclusivo: 'gw_inclusivo',
  complexo: 'gw_complexo',
  evento_gw: 'gw_evento',
  intermediario: 'intermediario',
  anotacao: 'anotacao',
  desconhecido: 'tarefa',
};

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', ordm: 'º', ordf: 'ª', deg: '°', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', bull: '•', middot: '·', euro: '€', times: '×',
  copy: '©', reg: '®', szlig: 'ß',
};

/** Marcas das entidades de letras acentuadas: `&ccedil;`, `&Atilde;`, `&eacute;`… */
const MARCAS: Record<string, string> = {
  acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧',
};

function entidadeNomeada(nome: string): string | undefined {
  const fixa = ENTIDADES[nome] ?? ENTIDADES[nome.toLowerCase()];
  if (fixa) return fixa;
  const m = /^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil)$/.exec(nome);
  return m ? (m[1]! + MARCAS[m[2]!]).normalize('NFC') : undefined;
}

/** Texto de rótulo vindo de draw.io, Visio etc.: tira HTML, decodifica entidades e colapsa espaços. */
export function textoDeRotulo(bruto: string | undefined): string {
  if (!bruto) return '';
  const semTags = bruto
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/\s*(div|p|li)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '');
  const decodificado = semTags.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
    if (ent[0] === '#') {
      const cod = ent[1]?.toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(cod) && cod > 0 && cod <= 0x10ffff ? String.fromCodePoint(cod) : m;
    }
    return entidadeNomeada(ent) ?? m;
  });
  return limparTexto(decodificado);
}

const SIM = /^(sim|s|yes|y|verdadeiro|true|v)$/i;
const NAO = /^(n[aã]o|n|no|falso|false|f)$/i;

/** Padroniza respostas de decisão: "sim", "Yes", "s" → "SIM"; "nao", "No" → "NÃO". */
export function padronizarRotulo(rotulo: string | undefined): string {
  const t = limparTexto(rotulo);
  if (SIM.test(t)) return 'SIM';
  if (NAO.test(t)) return 'NÃO';
  return t;
}

export function normalizarGrafo(
  g: GrafoImportado,
  opcoes: OpcoesNormalizacao,
): { processo: Processo; relatorio: RelatorioImportacao } {
  const avisos = [...g.avisos];
  const txt = (v: string | undefined) => (g.rotulosHtml ? textoDeRotulo(v) : limparTexto(v));
  const rotuloDecisao = (v: string | undefined) => padronizarRotulo(txt(v));
  const perdas = [...g.perdas];

  // 1. Ids da origem únicos
  const nos: NoImportado[] = [];
  const vistos = new Set<string>();
  for (const n of g.nos) {
    let id = n.id;
    for (let k = 2; vistos.has(id); k++) id = `${n.id}#${k}`;
    if (id !== n.id) avisos.push(`Id "${n.id}" repetido na origem; a segunda ocorrência foi renomeada`);
    vistos.add(id);
    nos.push({ ...n, id });
  }
  const porId = new Map(nos.map((n) => [n.id, n]));

  // 2. Setas válidas; setas ligadas a anotações viram associação
  const associacoes = new Map<string, string>(g.associacoes.map((a) => [a.anotacao, a.alvo]));
  const arestas = g.arestas.filter((a) => {
    const o = porId.get(a.origem);
    const d = porId.get(a.destino);
    if (!o || !d) {
      avisos.push(`Seta "${a.id}" ignorada: liga elementos que não existem`);
      return false;
    }
    if (o.forma === 'anotacao' || d.forma === 'anotacao') {
      const [nota, alvo] = o.forma === 'anotacao' ? [o, d] : [d, o];
      if (alvo.forma !== 'anotacao' && !associacoes.has(nota.id)) associacoes.set(nota.id, alvo.id);
      return false;
    }
    return true;
  });

  const saidasDe = new Map<string, typeof arestas>(nos.map((n) => [n.id, []]));
  const grauEntrada = new Map<string, number>(nos.map((n) => [n.id, 0]));
  for (const a of arestas) {
    saidasDe.get(a.origem)!.push(a);
    grauEntrada.set(a.destino, grauEntrada.get(a.destino)! + 1);
  }

  // 3. Ordem: busca em largura a partir dos inícios; o resto na ordem da origem; anotações no fim
  const fluxo = nos.filter((n) => n.forma !== 'anotacao');
  const inicios = fluxo.filter((n) => n.forma === 'inicio');
  const raizes = inicios.length ? inicios : fluxo.filter((n) => grauEntrada.get(n.id) === 0);
  const ordem: NoImportado[] = [];
  const naOrdem = new Set<string>();
  const visitar = (raiz: NoImportado) => {
    const fila = [raiz];
    naOrdem.add(raiz.id);
    for (let i = 0; i < fila.length; i++) {
      const n = fila[i]!;
      ordem.push(n);
      for (const a of saidasDe.get(n.id) ?? []) {
        if (naOrdem.has(a.destino)) continue;
        naOrdem.add(a.destino);
        fila.push(porId.get(a.destino)!);
      }
    }
  };
  for (const r of raizes) if (!naOrdem.has(r.id)) visitar(r);
  for (const n of fluxo) if (!naOrdem.has(n.id)) visitar(n);
  ordem.push(...nos.filter((n) => n.forma === 'anotacao'));

  // Arquivo do próprio sistema (ids E01, E02… únicos): mantém ids e ordem da lista
  const idsDoSistema = nos.length > 0 && nos.every((n) => ID_ETAPA.test(n.id)) && !avisos.some((a) => a.includes('repetido'));
  if (idsDoSistema) {
    ordem.length = 0;
    ordem.push(...nos);
  }
  const novoId = new Map(ordem.map((n, i) => [n.id, idsDoSistema ? n.id : formatarIdEtapa(i + 1)]));

  // 4. Raias → atores, juntando nomes iguais
  const nomeRaia = new Map<string, string>();
  const canonica = new Map<string, string>();
  for (const r of [...g.raias].sort((a, b) => a.ordem - b.ordem)) {
    const nome = txt(r.nome);
    if (!nome) continue;
    const c = canonica.get(chaveNome(nome)) ?? nome;
    canonica.set(chaveNome(nome), c);
    nomeRaia.set(r.id, c);
  }

  // 5. Etapas
  const base = criarProcesso(opcoes);
  const contagemMapa = new Map<string, { forma: FormaImportada; tipo: TipoEtapa; quantidade: number }>();
  const etapas: Etapa[] = ordem.map((n) => {
    const id = novoId.get(n.id)!;
    let tipo = FORMA_PARA_TIPO[n.forma];
    if (n.forma === 'intermediario' && n.extras?.link === 'true') tipo = 'link';
    const chave = `${n.forma}>${tipo}`;
    const m = contagemMapa.get(chave) ?? { forma: n.forma, tipo, quantidade: 0 };
    m.quantidade++;
    contagemMapa.set(chave, m);

    const rotulada = DEFINICOES[tipo].saidasRotuladas;
    const saidas: Saida[] = (saidasDe.get(n.id) ?? []).map((a) => {
      const rotulo = rotulada ? rotuloDecisao(a.rotulo) : txt(a.rotulo);
      return rotulo ? { destino: novoId.get(a.destino)!, rotulo } : { destino: novoId.get(a.destino)! };
    });

    const etapa: Etapa = {
      id,
      tipo,
      descricao: txt(n.rotulo),
      saidas,
      origem: { formato: opcoes.formato, idOriginal: n.id },
    };
    const ator = n.raiaId ? nomeRaia.get(n.raiaId) : undefined;
    if (ator) etapa.ator = ator;
    if (tipo === 'gw_complexo' && n.extras?.documentacao) etapa.regra = txt(n.extras.documentacao);
    if (n.extras?.apoio) etapa.apoio = txt(n.extras.apoio);
    const resultado = RESULTADOS_FIM.find((r) => chaveNome(r) === chaveNome(n.extras?.resultado ?? ''));
    if (tipo === 'fim' && resultado) etapa.resultado = resultado;
    if (tipo === 'intermediario' && n.extras?.evento === 'disparo') etapa.evento = 'disparo';
    if (tipo === 'anotacao') {
      const alvo = associacoes.get(n.id);
      if (alvo && novoId.has(alvo)) etapa.anotaEtapa = novoId.get(alvo)!;
    }
    if (n.forma === 'desconhecido') {
      avisos.push(`${id} ("${etapa.descricao || n.id}"): forma não reconhecida, importada como tarefa`);
    }
    if (DEFINICOES[tipo].saidasMax === 1 && saidas.length > 1) {
      avisos.push(`${id} tem ${saidas.length} saídas. Em BPMN isso equivale a um paralelo implícito: considere inserir um gateway`);
    }
    return normalizarCampos(base, etapa);
  });

  const processo: Processo = {
    ...base,
    nome: limparTexto(opcoes.nome) || txt(g.titulo) || 'Processo importado',
    etapas,
  };
  if (canonica.size) processo.layout.ordemRaias = [...new Set(nomeRaia.values())];

  // Eventos de fim: o responsável é opcional; só fica se for diferente da raia que já herdariam
  for (const e of processo.etapas) {
    if (e.tipo !== 'fim' || !e.ator) continue;
    const ator = e.ator;
    delete e.ator;
    if (resolverRaias(processo).get(e.id) !== ator) e.ator = ator;
  }
  if (opcoes.manterLayout) {
    for (const n of ordem) if (n.caixa) processo.layout.posicoes[novoId.get(n.id)!] = { x: n.caixa.x, y: n.caixa.y };
  }

  // 6. Sugestões (nunca aplicadas em silêncio)
  const fluxoEtapas = etapas.filter((e) => e.tipo !== 'anotacao');
  const entradas = new Set(fluxoEtapas.flatMap((e) => e.saidas.map((s) => s.destino)));
  const sugestoes = {
    inicio: fluxoEtapas.some((e) => e.tipo === 'inicio') ? [] : fluxoEtapas.filter((e) => !entradas.has(e.id)).map((e) => e.id),
    fim: fluxoEtapas.some((e) => e.tipo === 'fim') ? [] : fluxoEtapas.filter((e) => e.saidas.length === 0).map((e) => e.id),
  };

  const relatorio: RelatorioImportacao = {
    formato: opcoes.formato,
    contagens: {
      etapas: fluxoEtapas.length,
      setas: arestas.length,
      raias: new Set(nomeRaia.values()).size,
      anotacoes: etapas.length - fluxoEtapas.length,
    },
    mapeamentos: [...contagemMapa.values()],
    perdas,
    avisos,
    sugestoes,
    problemas: validar(processo),
  };
  return { processo, relatorio };
}

/** Relatório em texto simples, para baixar. */
export function relatorioEmTexto(r: RelatorioImportacao): string {
  const linhas = [
    `Relatório de importação (${r.formato})`,
    '',
    `Etapas: ${r.contagens.etapas} · Setas: ${r.contagens.setas} · Raias: ${r.contagens.raias} · Anotações: ${r.contagens.anotacoes}`,
    '',
    'Mapeamentos:',
    ...r.mapeamentos.map((m) => `  ${m.forma} → ${DEFINICOES[m.tipo].rotulo}: ${m.quantidade}`),
  ];
  const secao = (titulo: string, itens: string[]) => {
    if (itens.length) linhas.push('', `${titulo}:`, ...itens.map((i) => `  - ${i}`));
  };
  secao('Perdas', r.perdas);
  secao('Avisos', r.avisos);
  if (r.sugestoes.inicio.length) secao('Candidatas a início', r.sugestoes.inicio);
  if (r.sugestoes.fim.length) secao('Candidatas a fim', r.sugestoes.fim);
  secao('Problemas', r.problemas.map((p) => `[${p.codigo}] ${p.mensagem}`));
  return linhas.join('\n');
}
