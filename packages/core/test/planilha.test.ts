import { describe, expect, it } from 'vitest';
import {
  detectarColunas,
  detectarSeparador,
  ErroPlanilha,
  escreverCsv,
  escreverXlsx,
  exportarCsv,
  exportarXlsx,
  importadorPlanilha,
  lerCsv,
  lerPlanilha,
  lerSaidas,
  lerXlsx,
  normalizarGrafo,
  planilhaParaGrafo,
  processoExemplo,
  type Etapa,
} from '../src';

const fixo = { agora: new Date('2026-11-04T12:00:00Z'), gerarId: () => 'proc-1' };
const semOrigem = (etapas: Etapa[]) => etapas.map(({ origem: _o, ...r }) => r);

describe('CSV', () => {
  it('detecta separador e respeita aspas', () => {
    expect(detectarSeparador('a;b;c\n1;2;3')).toBe(';');
    expect(detectarSeparador('a,b,c')).toBe(',');
    expect(detectarSeparador('a\tb')).toBe('\t');
    expect(detectarSeparador('"a;b",c,d')).toBe(',');
    expect(lerCsv('﻿Id;Descrição\r\nE01;"Analisar; conferir ""tudo"""\nE02;"duas\nlinhas"\n\n')).toEqual([
      ['Id', 'Descrição'],
      ['E01', 'Analisar; conferir "tudo"'],
      ['E02', 'duas\nlinhas'],
    ]);
  });

  it('escreve com BOM, ; e aspas quando precisa', () => {
    const csv = escreverCsv([['a', 'b;c'], ['"x"', ' y']]);
    expect(csv).toBe('﻿a;"b;c"\r\n"""x""";" y"\r\n');
    expect(lerCsv(csv)).toEqual([['a', 'b;c'], ['"x"', ' y']]);
  });
});

describe('XLSX', () => {
  it('ida e volta com acentos, caracteres especiais e células vazias', () => {
    const linhas = [['Id', 'Descrição', 'Obs'], ['E01', 'Ação & <teste> "aspas"', ''], ['E02', '', 'só no fim']];
    const bytes = escreverXlsx(linhas);
    expect(bytes[0]).toBe(0x50); // ZIP
    expect(lerXlsx(bytes)).toEqual([['Id', 'Descrição', 'Obs'], ['E01', 'Ação & <teste> "aspas"'], ['E02', '', 'só no fim']]);
  });

  it('recusa o que não é xlsx', () => {
    expect(() => lerXlsx(new TextEncoder().encode('id;descricao'))).toThrow(ErroPlanilha);
    expect(() => lerXlsx(new Uint8Array([0x50, 0x4b, 3, 4, ...new TextEncoder().encode('xl/ lixo')]))).toThrow(ErroPlanilha);
  });
});

describe('modelo de planilha', () => {
  it('detecta cabeçalho com nomes variados, mesmo depois de linhas de título', () => {
    const linhas = [['Levantamento do processo X'], [''], ['Nº', 'Atividade', 'Área responsável', 'Próxima etapa']];
    expect(detectarColunas(linhas)).toEqual({ linhaCabecalho: 2, mapeamento: { id: 0, descricao: 1, responsavel: 2, saidas: 3 } });
    expect(detectarColunas([['coluna a', 'coluna b']])).toBeNull();
  });

  it('lê saídas em vários formatos', () => {
    expect(lerSaidas('SIM: E05; NÃO: E06')).toEqual([{ destino: 'E05', rotulo: 'SIM' }, { destino: 'E06', rotulo: 'NÃO' }]);
    expect(lerSaidas('E05, E06')).toEqual([{ destino: 'E05' }, { destino: 'E06' }]);
    expect(lerSaidas('Sim -> 4 | Não → 7')).toEqual([{ destino: '4', rotulo: 'Sim' }, { destino: '7', rotulo: 'Não' }]);
    expect(lerSaidas('→ E03')).toEqual([{ destino: 'E03' }]);
  });

  it('ida e volta sem perdas pelo CSV e pelo Excel', () => {
    const p = processoExemplo(fixo);
    p.etapas.push({ id: 'E10', tipo: 'anotacao', descricao: 'Prazo; 2 dias', anotaEtapa: 'E03', saidas: [] });
    for (const conteudo of [exportarCsv(p), exportarXlsx(p)]) {
      const [g] = importadorPlanilha.importar(conteudo) as ReturnType<typeof planilhaParaGrafo>['grafo'][];
      const { processo, relatorio } = normalizarGrafo(g!, { formato: 'planilha', ...fixo });
      expect(semOrigem(processo.etapas)).toEqual(p.etapas);
      expect(relatorio.avisos).toEqual([]);
    }
  });

  it('planilha simples, sem id e sem tipo: vira sequência de tarefas', () => {
    const csv = 'Atividade;Responsável;Sistema\nReceber pedido;Vendas;CRM\nSeparar itens;Estoque;\nEntregar;Logística;Roteirizador\n';
    const { grafo } = planilhaParaGrafo(lerPlanilha(csv));
    const { processo, relatorio } = normalizarGrafo(grafo, { formato: 'planilha', ...fixo });
    expect(processo.etapas.map((e) => [e.id, e.tipo, e.ator, e.apoio, e.saidas.map((s) => s.destino).join()])).toEqual([
      ['E01', 'tarefa', 'Vendas', 'CRM', 'E02'],
      ['E02', 'tarefa', 'Estoque', undefined, 'E03'],
      ['E03', 'tarefa', 'Logística', 'Roteirizador', ''],
    ]);
    expect(relatorio.sugestoes).toEqual({ inicio: ['E01'], fim: ['E03'] });
  });

  it('tipos por sinônimo, destinos por número de linha e avisos', () => {
    const csv = [
      'Tipo;Descrição;Responsável;Saídas',
      'Início;Pedido chega;;',
      'Atividade;Conferir;Compras;',
      'Pergunta;Está ok?;Compras;Sim: 4; Não: 5',
      'Automático;Gerar nota;ERP;6',
      'Nuvem;???;;',
      'fim;Concluído;;',
      'Decisão;Sem destino;X;Sim: 99',
    ].join('\n');
    const { grafo } = planilhaParaGrafo(lerCsv(csv));
    expect(grafo.nos.map((n) => n.forma)).toEqual(['inicio', 'tarefa', 'decisao', 'sistema', 'desconhecido', 'fim', 'decisao']);
    expect(grafo.arestas.find((a) => a.origem === '3' && a.rotulo === 'Sim')!.destino).toBe('4');
    expect(grafo.avisos).toEqual(['Linha 6: tipo "Nuvem" não reconhecido', 'Linha 8: destino "99" não existe na planilha']);
  });

  it('erro claro sem cabeçalho', () => {
    expect(() => planilhaParaGrafo([['a', 'b'], ['c', 'd']])).toThrow(/cabeçalho/);
  });

  it('detecção', () => {
    expect(importadorPlanilha.detectar('x.xlsx', exportarXlsx(processoExemplo(fixo)))).toBe(0.9);
    expect(importadorPlanilha.detectar('x.csv', 'Descrição;Responsável\na;b')).toBe(0.9);
    expect(importadorPlanilha.detectar('x.csv', 'foo;bar')).toBe(0.4);
    expect(importadorPlanilha.detectar('x.bpmn', '<xml/>')).toBe(0);
  });
});

describe('planilha feita em outra ferramenta (openpyxl, com textos compartilhados)', () => {
  it('lê título, números e decisões', async () => {
    const { readFileSync } = await import('node:fs');
    const bytes = new Uint8Array(readFileSync(new URL('./amostras/openpyxl-compras.xlsx', import.meta.url)));
    expect(importadorPlanilha.detectar('compras.xlsx', bytes)).toBe(0.9);
    const { grafo } = planilhaParaGrafo(lerPlanilha(bytes));
    const { processo, relatorio } = normalizarGrafo(grafo, { formato: 'planilha', ...fixo });
    expect(processo.etapas.map((e) => `${e.id}:${e.tipo}:${e.ator ?? ''}`)).toEqual([
      'E01:inicio:', 'E02:tarefa:Solicitante', 'E03:gw_exclusivo:Compras', 'E04:tarefa:Financeiro', 'E05:sistema:Compras', 'E06:fim:',
    ]);
    expect(processo.etapas[2]!.descricao).toBe('Valor > R$ 5 mil?');
    expect(processo.etapas[2]!.saidas).toEqual([{ destino: 'E04', rotulo: 'SIM' }, { destino: 'E05', rotulo: 'NÃO' }]);
    expect(relatorio.problemas.filter((x) => x.severidade === 'erro')).toEqual([]);
  });
});

describe('xlsx no formato do Excel (sharedStrings, rich text, colunas puladas)', () => {
  it('lê corretamente', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const bytes = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8(`<workbook xmlns="${ns}" xmlns:r="r"><sheets><sheet name="Fluxo" sheetId="7" r:id="rId3"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId3" Type="x" Target="/xl/worksheets/sheet7.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8(
        `<sst xmlns="${ns}"><si><t>Descrição</t></si><si><t>Responsável</t></si>` +
          '<si><r><rPr><b/></rPr><t>Analisar</t></r><r><t xml:space="preserve"> pedido &amp; anexos</t></r><rPh><t>ignorar</t></rPh></si>' +
          '<si><t>Área_x000D_ A</t></si></sst>',
      ),
      'xl/worksheets/sheet7.xml': strToU8(
        `<worksheet xmlns="${ns}"><sheetData>` +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="3"/><c r="C2" t="s"><v>3</v></c><c r="D2" t="b"><v>1</v></c><c r="E2"><v>42</v></c></row>' +
          '</sheetData></worksheet>',
      ),
    });
    expect(lerXlsx(bytes)).toEqual([
      ['Descrição', '', 'Responsável'],
      ['Analisar pedido & anexos', '', 'Área\r A', 'VERDADEIRO', '42'],
    ]);
  });
});
