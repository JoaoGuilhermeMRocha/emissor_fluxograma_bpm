/**
 * Ações de arquivo: abrir (processo ou importação), salvar `.processo` e exportar.
 */
/** @import { Processo } from '../core/index.js' */
import {
  abrirArquivo,
  EXTENSOES_ACEITAS,
  exportarBpmn,
  exportarCsv,
  exportarXlsx,
  nomeArquivoBpmn,
  nomeDoArquivo,
  serializarProcesso,
  slug,
} from '../core/index.js';
import { abrirArquivoDoDisco, salvarArquivo } from './armazenamento/arquivos.js';
import { lerRegistro } from './armazenamento/banco.js';
import { ligarCabecalhos, opcoesVisualizador } from './bpmn/index.js';
import { baixar, mensagem } from './dom.js';
import {
  abrirDaBiblioteca,
  abrirNovoNaBiblioteca,
  avisar,
  definirUi,
  estado,
  marcarExportado,
  salvarAgora,
} from './estado/loja.js';

/** @typedef {'bpmn' | 'xlsx' | 'csv' | 'svg'} FormatoExportacao */

/**
 * SVG do diagrama sempre no tema claro (para documentos), num visualizador fora da tela.
 * @param {Processo} p
 * @returns {Promise<string>}
 */
async function svgNoTemaClaro(p) {
  const { default: Viewer } = await import('bpmn-js/lib/Viewer');
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-10000px;top:0;width:1600px;height:900px';
  document.body.appendChild(div);
  const v = new Viewer(opcoesVisualizador(div));
  ligarCabecalhos(v, () => 'claro');
  try {
    await v.importXML(exportarBpmn(p));
    return (await v.saveSVG()).svg;
  } finally {
    v.destroy();
    div.remove();
  }
}

/** Grava o processo aberto num arquivo `.processo` (Ctrl+S). */
export async function salvarComoArquivo() {
  await salvarAgora();
  const atual = estado().processo;
  if (!atual) return;
  const nome = nomeDoArquivo(atual);
  try {
    const r = await salvarArquivo(
      serializarProcesso(atual),
      nome,
      'application/json',
      '.processo',
      estado().registro.arquivo?.handle,
    );
    if (!r.salvo) return;
    await marcarExportado({ nome, ...(r.handle ? { handle: r.handle } : {}) });
    avisar('ok', r.handle ? `Salvo em ${r.handle.name}` : `${nome} baixado`);
  } catch (e) {
    avisar('erro', `Não foi possível salvar: ${mensagem(e)}`);
  }
}

/** Abre um `.processo` ou importa um arquivo de outra ferramenta (Ctrl+O). */
export async function abrir() {
  let escolhido;
  try {
    escolhido = await abrirArquivoDoDisco(EXTENSOES_ACEITAS);
  } catch (e) {
    avisar('erro', mensagem(e));
    return;
  }
  if (!escolhido) return;
  const r = await abrirArquivo(escolhido.nome, escolhido.bytes);
  if (r.tipo === 'erro') return avisar('erro', r.erro);
  if (r.tipo === 'importacao') {
    definirUi({
      modal: {
        tipo: 'importacao',
        dados: {
          nomeArquivo: escolhido.nome,
          formato: r.importador.formato,
          nomeFormato: r.importador.nome,
          grafos: r.grafos,
        },
        indice: 0,
        manterLayout: false,
      },
    });
    return;
  }
  const leitura = r.leitura;
  if ('erro' in leitura) {
    const detalhes = leitura.detalhes ? `: ${leitura.detalhes.slice(0, 2).join('; ')}` : '';
    return avisar('erro', `${leitura.erro}${detalhes}`);
  }
  if (leitura.somenteLeitura) return avisar('erro', leitura.avisos[0] ?? 'Arquivo de uma versão mais nova do sistema');
  leitura.avisos.forEach((a) => avisar('info', a));
  const doArquivo = leitura.processo;
  const registroArquivo = {
    arquivo: { nome: escolhido.nome, ...(escolhido.handle ? { handle: escolhido.handle } : {}) },
    revisaoExportada: doArquivo.revisao,
  };
  const existente = await lerRegistro(doArquivo.id);
  if (!existente) {
    await abrirNovoNaBiblioteca(doArquivo, registroArquivo);
    avisar('ok', `“${doArquivo.nome}” aberto e guardado na biblioteca`);
  } else if (existente.processo.revisao === doArquivo.revisao) {
    await abrirDaBiblioteca(doArquivo.id);
  } else {
    definirUi({
      modal: {
        tipo: 'conflito',
        dados: {
          arquivo: doArquivo,
          navegador: existente,
          nomeArquivo: escolhido.nome,
          ...(escolhido.handle ? { handle: escolhido.handle } : {}),
        },
      },
    });
  }
}

/** @param {FormatoExportacao} formato */
export async function exportar(formato) {
  const atual = estado().processo;
  if (!atual) return;
  const base = nomeDoArquivo(atual).replace(/\.processo$/, '');
  if (formato === 'bpmn') baixar(exportarBpmn(atual), nomeArquivoBpmn(atual), 'application/xml');
  if (formato === 'xlsx') {
    baixar(exportarXlsx(atual), `${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  if (formato === 'csv') baixar(exportarCsv(atual), `${base}.csv`, 'text/csv;charset=utf-8');
  if (formato === 'svg') {
    try {
      baixar(await svgNoTemaClaro(atual), `${slug(atual.nome) || 'processo'}.svg`, 'image/svg+xml');
    } catch (e) {
      avisar('erro', `Não foi possível gerar o SVG: ${mensagem(e)}`);
    }
  }
}
