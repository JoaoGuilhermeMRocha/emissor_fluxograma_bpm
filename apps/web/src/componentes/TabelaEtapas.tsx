import { useEffect, useRef } from 'react';
import {
  atoresConhecidos,
  atualizarEtapa,
  excluirEtapa,
  resolverRaias,
  DEFINICOES,
  type Etapa,
  type Problema,
} from '@mapeador/core';
import { useLoja } from '../estado/loja';
import { CampoTexto, DetalheEtapa, EditorSaidas, PontoProblema, SeletorTipo } from './campos';

export function piorSeveridade(problemas: Problema[], id: string): '' | 'erro' | 'aviso' | 'info' {
  const dela = problemas.filter((x) => x.etapa === id);
  if (dela.some((x) => x.severidade === 'erro')) return 'erro';
  if (dela.some((x) => x.severidade === 'aviso')) return 'aviso';
  return dela.length ? 'info' : '';
}

export function TabelaEtapas({ problemas }: { problemas: Problema[] }) {
  const p = useLoja((s) => s.processo)!;
  const aplicar = useLoja((s) => s.aplicar);
  const selecionada = useLoja((s) => s.selecionada);
  const selecionar = useLoja((s) => s.selecionar);
  const raias = resolverRaias(p);
  const atores = atoresConhecidos(p);
  const linhaSel = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    linhaSel.current?.scrollIntoView({ block: 'nearest' });
  }, [selecionada]);

  const atualizar = (id: string, campos: Partial<Omit<Etapa, 'id' | 'tipo'>>) => aplicar((q) => atualizarEtapa(q, id, campos));

  if (!p.etapas.length) {
    return <p className="vazio">Nenhuma etapa ainda. Use “+ Etapa” acima ou a paleta à esquerda do diagrama.</p>;
  }

  return (
    <div className="tabela-rolagem">
      <datalist id="lista-atores">
        {atores.map((a) => <option key={a} value={a} />)}
      </datalist>
      <table className="etapas">
        <thead>
          <tr>
            <th scope="col">Id</th>
            <th scope="col">Tipo</th>
            <th scope="col">Descrição</th>
            <th scope="col">Responsável</th>
            <th scope="col">Apoio</th>
            <th scope="col">Saídas</th>
            <th scope="col">Detalhe</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {p.etapas.map((e) => {
            const def = DEFINICOES[e.tipo];
            const sev = piorSeveridade(problemas, e.id);
            return (
              <tr
                key={e.id}
                ref={selecionada === e.id ? linhaSel : undefined}
                className={selecionada === e.id ? 'selecionada' : ''}
                onClick={() => selecionar(e.id)}
              >
                <td className="id">
                  <PontoProblema severidade={sev} titulo={problemas.filter((x) => x.etapa === e.id).map((x) => x.mensagem).join('\n')} />
                  {e.id}
                </td>
                <td><SeletorTipo etapa={e} /></td>
                <td><CampoTexto valor={e.descricao} aria-label={`Descrição de ${e.id}`} placeholder="Descrição" aoConfirmar={(v) => atualizar(e.id, { descricao: v })} /></td>
                <td>
                  {def.ator === 'nenhum' ? (
                    <span className="herdado" title="Raia herdada das etapas vizinhas">↳ {raias.get(e.id) ?? '—'}</span>
                  ) : (
                    <CampoTexto
                      valor={e.ator ?? ''}
                      list="lista-atores"
                      aria-label={`Responsável de ${e.id}`}
                      placeholder={def.ator === 'obrigatorio' ? 'Obrigatório' : `Herda: ${raias.get(e.id) ?? ''}`}
                      aoConfirmar={(v) => atualizar(e.id, { ator: v })}
                    />
                  )}
                </td>
                <td>
                  {def.familia === 'atividade' || def.familia === 'gateway' ? (
                    <CampoTexto valor={e.apoio ?? ''} aria-label={`Apoio de ${e.id}`} placeholder="Sistema, documento…" aoConfirmar={(v) => atualizar(e.id, { apoio: v })} />
                  ) : <span className="mudo">—</span>}
                </td>
                <td><EditorSaidas etapa={e} processo={p} aoMudar={(saidas) => atualizar(e.id, { saidas })} /></td>
                <td><DetalheEtapa etapa={e} processo={p} atualizar={(c) => atualizar(e.id, c)} /></td>
                <td>
                  <button
                    className="icone perigo"
                    title={`Excluir ${e.id}`}
                    aria-label={`Excluir ${e.id}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      aplicar((q) => excluirEtapa(q, e.id));
                      selecionar(null);
                    }}
                  >×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
