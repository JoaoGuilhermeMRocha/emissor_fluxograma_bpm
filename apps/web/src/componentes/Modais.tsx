import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  normalizarGrafo,
  relatorioEmTexto,
  validar,
  type GrafoImportado,
  type Processo,
} from '@mapeador/core';
import { excluirRegistro, gravarProcesso, listarProcessos, type RegistroProcesso } from '../armazenamento/banco';
import { abrirDaBiblioteca, abrirNovoNaBiblioteca, novoProcesso, useLoja } from '../estado/loja';

export function Modal({ titulo, aoFechar, children, largo }: { titulo: string; aoFechar: () => void; children: ReactNode; largo?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal?.();
    const fechar = () => aoFechar();
    d.addEventListener('close', fechar);
    return () => d.removeEventListener('close', fechar);
  }, [aoFechar]);
  return (
    <dialog ref={ref} className={`modal ${largo ? 'largo' : ''}`} aria-label={titulo} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="modal-conteudo">
        <header className="modal-cabeca">
          <h2>{titulo}</h2>
          <button className="icone" aria-label="Fechar" onClick={() => ref.current?.close()}>×</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

const dataRelativa = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia ? `hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('pt-BR');
};

export function Biblioteca({ aoFechar }: { aoFechar: () => void }) {
  const [registros, setRegistros] = useState<RegistroProcesso[] | null>(null);
  const [busca, setBusca] = useState('');
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);
  const atualId = useLoja((s) => s.processo?.id);
  const avisar = useLoja((s) => s.avisar);

  const recarregar = () => void listarProcessos().then(setRegistros);
  useEffect(recarregar, []);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (registros ?? []).filter((r) => !t || `${r.nome} ${Object.values(r.processo.metadados).join(' ')}`.toLowerCase().includes(t));
  }, [registros, busca]);

  const duplicar = async (r: RegistroProcesso) => {
    const id = crypto.randomUUID();
    const agora = new Date().toISOString();
    const copia: Processo = { ...structuredClone(r.processo), id, linhagem: id, nome: `${r.processo.nome} (cópia)`, revisao: 0, criadoEm: agora, alteradoEm: agora };
    await gravarProcesso(copia);
    avisar('ok', `“${copia.nome}” criado`);
    recarregar();
  };

  return (
    <Modal titulo="Biblioteca de processos" aoFechar={aoFechar} largo>
      <div className="linha">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, área, macroprocesso…" aria-label="Buscar" autoFocus />
        <button className="primario" onClick={async () => { await novoProcesso(); aoFechar(); }}>+ Novo processo</button>
      </div>
      <p className="nota">Os processos ficam guardados neste navegador. Para ter uma cópia segura ou compartilhar, use “Salvar arquivo”.</p>
      {registros === null ? <p className="mudo">Carregando…</p> : filtrados.length === 0 ? <p className="vazio">Nenhum processo encontrado.</p> : (
        <ul className="biblioteca">
          {filtrados.map((r) => {
            const erros = validar(r.processo).filter((x) => x.severidade === 'erro').length;
            const naoExportado = r.revisaoExportada !== r.processo.revisao;
            return (
              <li key={r.id} className={r.id === atualId ? 'atual' : ''}>
                <button className="item-principal" onClick={async () => { await abrirDaBiblioteca(r.id); aoFechar(); }}>
                  <strong>{r.nome || 'Sem nome'}</strong>
                  <span className="mudo">
                    {r.processo.versao} · {r.processo.etapas.length} etapas · alterado {dataRelativa(r.atualizadoEm)}
                    {r.processo.metadados.area ? ` · ${r.processo.metadados.area}` : ''}
                  </span>
                  <span className="selos">
                    {r.id === atualId && <span className="selo">aberto</span>}
                    {erros > 0 && <span className="selo erro">{erros} erro(s)</span>}
                    {naoExportado && <span className="selo aviso" title="Alterado depois da última vez que foi salvo em arquivo">sem arquivo atualizado</span>}
                  </span>
                </button>
                <div className="item-acoes">
                  <button className="mini" onClick={() => duplicar(r)}>Duplicar</button>
                  {confirmarExclusao === r.id ? (
                    <>
                      <button className="mini perigo" onClick={async () => {
                        await excluirRegistro(r.id);
                        setConfirmarExclusao(null);
                        if (r.id === atualId) {
                          const resto = (registros ?? []).filter((x) => x.id !== r.id);
                          if (resto[0]) await abrirDaBiblioteca(resto[0].id);
                          else await novoProcesso();
                        }
                        recarregar();
                      }}>Confirmar exclusão</button>
                      <button className="mini" onClick={() => setConfirmarExclusao(null)}>Cancelar</button>
                    </>
                  ) : (
                    <button className="mini" onClick={() => setConfirmarExclusao(r.id)}>Excluir</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export interface ImportacaoPendente {
  nomeArquivo: string;
  formato: string;
  nomeFormato: string;
  grafos: GrafoImportado[];
}

export function ModalImportacao({ dados, aoFechar }: { dados: ImportacaoPendente; aoFechar: () => void }) {
  const [indice, setIndice] = useState(0);
  const [manterLayout, setManterLayout] = useState(false);
  const resultado = useMemo(() => normalizarGrafo(dados.grafos[indice]!, { formato: dados.formato, manterLayout }), [dados, indice, manterLayout]);
  const r = resultado.relatorio;
  const erros = r.problemas.filter((x) => x.severidade === 'erro').length;

  const baixarRelatorio = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([relatorioEmTexto(r)], { type: 'text/plain;charset=utf-8' }));
    a.download = `relatorio-importacao-${dados.nomeArquivo.replace(/\.[^.]+$/, '')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Modal titulo={`Importar ${dados.nomeFormato}`} aoFechar={aoFechar} largo>
      <p><strong>{dados.nomeArquivo}</strong> vai virar um <strong>processo novo</strong> na biblioteca. Nada existente é alterado.</p>
      {dados.grafos.length > 1 && (
        <label className="campo">
          <span>O arquivo tem {dados.grafos.length} pools. Qual importar?</span>
          <select value={indice} onChange={(e) => setIndice(Number(e.target.value))}>
            {dados.grafos.map((g, i) => <option key={i} value={i}>{g.titulo ?? `Pool ${i + 1}`}</option>)}
          </select>
        </label>
      )}
      <div className="grade resumo-importacao">
        <div className="dado"><span>Etapas</span><strong>{r.contagens.etapas}</strong></div>
        <div className="dado"><span>Setas</span><strong>{r.contagens.setas}</strong></div>
        <div className="dado"><span>Raias</span><strong>{r.contagens.raias}</strong></div>
        <div className={`dado ${erros ? 'destaque' : ''}`}><span>Problemas</span><strong>{erros} erro(s) · {r.problemas.length - erros} outros</strong></div>
      </div>
      {r.perdas.length > 0 && (<><h3>O que não foi importado</h3><ul className="lista">{r.perdas.map((x) => <li key={x}>{x}</li>)}</ul></>)}
      {r.avisos.length > 0 && (<><h3>Avisos</h3><ul className="lista">{r.avisos.map((x) => <li key={x}>{x}</li>)}</ul></>)}
      {(r.sugestoes.inicio.length > 0 || r.sugestoes.fim.length > 0) && (
        <>
          <h3>Sugestões</h3>
          <ul className="lista">
            {r.sugestoes.inicio.length > 0 && <li>Sem evento de início. Candidatas: {r.sugestoes.inicio.join(', ')}</li>}
            {r.sugestoes.fim.length > 0 && <li>Sem evento de fim. Candidatas: {r.sugestoes.fim.join(', ')}</li>}
          </ul>
        </>
      )}
      <label className="marcador">
        <input type="checkbox" checked={manterLayout} onChange={(e) => setManterLayout(e.target.checked)} />
        Manter o desenho original (quando o arquivo tiver coordenadas)
      </label>
      <footer className="modal-rodape">
        <button onClick={baixarRelatorio}>Baixar relatório</button>
        <span className="espaco" />
        <button onClick={aoFechar}>Cancelar</button>
        <button className="primario" onClick={async () => {
          await abrirNovoNaBiblioteca(resultado.processo);
          useLoja.getState().avisar('ok', `“${resultado.processo.nome}” importado`);
          aoFechar();
        }}>Importar</button>
      </footer>
    </Modal>
  );
}

export interface ConflitoPendente {
  arquivo: Processo;
  navegador: RegistroProcesso;
  nomeArquivo: string;
  handle?: FileSystemFileHandle;
}

export function ModalConflito({ dados, aoFechar }: { dados: ConflitoPendente; aoFechar: () => void }) {
  const { arquivo, navegador } = dados;
  const desc = (p: Processo) => `${p.versao} · revisão ${p.revisao} · ${p.etapas.length} etapas · alterado em ${new Date(p.alteradoEm).toLocaleString('pt-BR')}`;
  const registroArquivo = { arquivo: { nome: dados.nomeArquivo, ...(dados.handle ? { handle: dados.handle } : {}) }, revisaoExportada: arquivo.revisao };
  return (
    <Modal titulo="Este processo já está no navegador" aoFechar={aoFechar}>
      <p>O arquivo e a cópia do navegador são versões diferentes de “{arquivo.nome}”. Qual usar?</p>
      <div className="comparacao">
        <div><h3>Arquivo</h3><p className="mudo">{desc(arquivo)}</p></div>
        <div><h3>Navegador</h3><p className="mudo">{desc(navegador.processo)}</p></div>
      </div>
      <footer className="modal-rodape coluna">
        <button className="primario" onClick={async () => { await abrirNovoNaBiblioteca(arquivo, registroArquivo); aoFechar(); }}>Usar o do arquivo (substitui a cópia do navegador)</button>
        <button onClick={async () => { await abrirDaBiblioteca(navegador.id); aoFechar(); }}>Manter o do navegador</button>
        <button onClick={async () => {
          const id = crypto.randomUUID();
          await abrirNovoNaBiblioteca({ ...arquivo, id, nome: `${arquivo.nome} (do arquivo)` });
          aoFechar();
        }}>Guardar os dois (o do arquivo vira uma cópia)</button>
      </footer>
    </Modal>
  );
}
