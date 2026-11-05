import { useEffect, useState, type InputHTMLAttributes } from 'react';
import {
  DEFINICOES,
  RESULTADOS_FIM,
  TIPOS_ETAPA,
  trocarTipo,
  type Etapa,
  type Processo,
  type Saida,
} from '@mapeador/core';
import { useLoja } from '../estado/loja';

/**
 * Campo que só grava ao sair ou com Enter: a limpeza de texto do núcleo
 * apagaria espaços no meio da digitação. Esc desfaz o que foi digitado.
 */
export function CampoTexto({
  valor,
  aoConfirmar,
  multilinha,
  ...resto
}: { valor: string; aoConfirmar: (v: string) => void; multilinha?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const confirmar = () => texto !== valor && aoConfirmar(texto);
  if (multilinha) {
    return (
      <textarea
        value={texto}
        rows={3}
        placeholder={resto.placeholder}
        aria-label={resto['aria-label']}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === 'Escape' && setTexto(valor)}
      />
    );
  }
  return (
    <input
      {...resto}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setTexto(valor);
      }}
    />
  );
}

export function SeletorTipo({ etapa }: { etapa: Etapa }) {
  const aplicar = useLoja((s) => s.aplicar);
  const familia = DEFINICOES[etapa.tipo].familia;
  return (
    <select
      value={etapa.tipo}
      aria-label="Tipo"
      title="Só aparecem tipos que mantêm o sentido das saídas"
      onChange={(e) => aplicar((q) => trocarTipo(q, etapa.id, e.target.value as Etapa['tipo']))}
    >
      {TIPOS_ETAPA.filter((t) => DEFINICOES[t].familia === familia).map((t) => (
        <option key={t} value={t}>{DEFINICOES[t].rotulo}</option>
      ))}
    </select>
  );
}

export function EditorSaidas({ etapa, processo, aoMudar }: { etapa: Etapa; processo: Processo; aoMudar: (s: Saida[]) => void }) {
  const def = DEFINICOES[etapa.tipo];
  if (def.saidasMax === 0 && etapa.saidas.length === 0) return <span className="mudo">sem saída</span>;
  const opcoes = processo.etapas.filter((x) => x.id !== etapa.id && x.tipo !== 'anotacao');
  const mudar = (i: number, s: Saida) => aoMudar(etapa.saidas.map((x, k) => (k === i ? s : x)));
  const rotulavel = def.familia === 'gateway';

  return (
    <div className="saidas">
      {etapa.saidas.map((s, i) => (
        <div key={i} className="saida">
          {rotulavel && (
            <CampoTexto
              valor={s.rotulo ?? ''}
              placeholder={def.saidasRotuladas ? 'Rótulo' : 'Rótulo (opcional)'}
              aria-label={`Rótulo da saída ${i + 1}`}
              className="rotulo-saida"
              aoConfirmar={(v) => mudar(i, v ? { ...s, rotulo: v } : { destino: s.destino })}
            />
          )}
          <select
            value={s.destino}
            aria-label={`Destino da saída ${i + 1}`}
            onChange={(e) => mudar(i, { ...s, destino: e.target.value })}
            className={s.destino ? '' : 'pendente'}
          >
            <option value="">→ sem destino</option>
            {opcoes.map((x) => (
              <option key={x.id} value={x.id}>→ {x.id} · {x.descricao.slice(0, 32) || DEFINICOES[x.tipo].rotulo}</option>
            ))}
            {s.destino && !opcoes.some((x) => x.id === s.destino) && <option value={s.destino}>→ {s.destino} (inexistente)</option>}
          </select>
          {(etapa.saidas.length > def.saidasMin || etapa.saidas.length > def.saidasMax) && (
            <button className="icone" title="Remover saída" aria-label="Remover saída" onClick={() => aoMudar(etapa.saidas.filter((_, k) => k !== i))}>×</button>
          )}
        </div>
      ))}
      {etapa.saidas.length < def.saidasMax && (
        <button className="mini" onClick={() => aoMudar([...etapa.saidas, { destino: '' }])}>+ saída</button>
      )}
    </div>
  );
}

export function DetalheEtapa({ etapa: e, processo, atualizar }: { etapa: Etapa; processo: Processo; atualizar: (c: Partial<Etapa>) => void }) {
  if (e.tipo === 'fim') {
    return (
      <select value={e.resultado ?? 'Finalizado'} aria-label="Resultado" onChange={(ev) => atualizar({ resultado: ev.target.value as Etapa['resultado'] })}>
        {RESULTADOS_FIM.map((r) => <option key={r}>{r}</option>)}
      </select>
    );
  }
  if (e.tipo === 'gw_complexo') return <CampoTexto valor={e.regra ?? ''} placeholder="Regra do gateway" aria-label="Regra" aoConfirmar={(v) => atualizar({ regra: v })} />;
  if (e.tipo === 'intermediario') {
    return (
      <select value={e.evento ?? 'captura'} aria-label="Tipo de evento" onChange={(ev) => atualizar({ evento: ev.target.value as 'captura' | 'disparo' })}>
        <option value="captura">Captura (espera algo)</option>
        <option value="disparo">Disparo (sinaliza algo)</option>
      </select>
    );
  }
  if (e.tipo === 'anotacao') {
    return (
      <select value={e.anotaEtapa ?? ''} aria-label="Etapa anotada" onChange={(ev) => atualizar({ anotaEtapa: ev.target.value || undefined })}>
        <option value="">Ligada a…</option>
        {processo.etapas.filter((x) => x.tipo !== 'anotacao').map((x) => <option key={x.id} value={x.id}>{x.id} · {x.descricao.slice(0, 30)}</option>)}
      </select>
    );
  }
  return null;
}

/** Pontinho de gravidade do pior problema da etapa. */
export function PontoProblema({ severidade, titulo }: { severidade: '' | 'erro' | 'aviso' | 'info'; titulo: string }) {
  return <span className={`ponto ${severidade}`} title={titulo} aria-label={severidade ? `Problema: ${severidade}` : undefined} />;
}
