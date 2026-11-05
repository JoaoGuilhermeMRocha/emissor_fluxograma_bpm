import { useEffect, useRef, useState } from 'react';
import { CampoTexto } from './campos';
import { useLoja, type EstadoSalvamento } from '../estado/loja';

export interface AcoesTopo {
  biblioteca(): void;
  novo(): void;
  abrir(): void;
  salvarArquivo(): void;
  exportar(formato: 'bpmn' | 'xlsx' | 'csv' | 'svg'): void;
}

function textoSalvamento(s: EstadoSalvamento): string {
  switch (s.estado) {
    case 'pronto': return 'Salvo no navegador';
    case 'pendente': return 'Alterações pendentes…';
    case 'salvando': return 'Salvando…';
    case 'salvo': return `Salvo às ${new Date(s.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    case 'erro': return 'Erro ao salvar';
  }
}

export function Topo({ acoes }: { acoes: AcoesTopo }) {
  const p = useLoja((s) => s.processo)!;
  const salvamento = useLoja((s) => s.salvamento);
  const registro = useLoja((s) => s.registro);
  const podeDesfazer = useLoja((s) => s.passado.length > 0);
  const podeRefazer = useLoja((s) => s.futuro.length > 0);
  const tema = useLoja((s) => s.tema);
  const { aplicar, desfazer, refazer, alternarTema } = useLoja.getState();
  const [menuAberto, setMenuAberto] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const semArquivo = registro.revisaoExportada !== p.revisao;

  useEffect(() => {
    if (!menuAberto) return;
    const fechar = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && setMenuAberto(false);
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [menuAberto]);

  return (
    <header className="topo">
      <div className="marca" aria-label="Mapeador de Processos">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="var(--primaria)" />
          <circle cx="8" cy="16" r="3.2" fill="#fff" />
          <rect x="13" y="12" width="8" height="8" rx="2" fill="#fff" />
          <path d="M24 16l3-3 3 3-3 3z" fill="#fff" />
          <path d="M11 16h2M21 16h3" stroke="#fff" strokeWidth="1.6" />
        </svg>
        <span className="marca-nome">Mapeador</span>
      </div>

      <div className="titulo-processo">
        <CampoTexto valor={p.nome} aria-label="Nome do processo" placeholder="Nome do processo" aoConfirmar={(v) => aplicar((q) => ({ ...q, nome: v.trim() }))} />
        <span className={`estado-salvamento ${salvamento.estado}`} title={salvamento.estado === 'erro' ? salvamento.erro : 'Tudo é salvo automaticamente neste navegador'}>
          {textoSalvamento(salvamento)}
        </span>
      </div>

      <nav className="acoes" aria-label="Ações">
        <button onClick={desfazer} disabled={!podeDesfazer} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
        <button onClick={refazer} disabled={!podeRefazer} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">↷</button>
        <button className="botao-tema" onClick={alternarTema} title={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'} aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}>
          {tema === 'escuro' ? '☀' : '☾'}
        </button>
        <span className="sep" />
        <button onClick={acoes.biblioteca}>Biblioteca</button>
        <button onClick={acoes.novo}>Novo</button>
        <button onClick={acoes.abrir} title="Abrir .processo, BPMN, Excel ou CSV">Abrir…</button>
        <div className="menu" ref={menu}>
          <button onClick={() => setMenuAberto((v) => !v)} aria-expanded={menuAberto} aria-haspopup="menu">Exportar ▾</button>
          {menuAberto && (
            <div className="menu-itens" role="menu">
              {([['bpmn', 'BPMN 2.0 (.bpmn)'], ['xlsx', 'Planilha Excel (.xlsx)'], ['csv', 'Planilha CSV (.csv)'], ['svg', 'Imagem SVG (.svg)']] as const).map(([f, r]) => (
                <button key={f} role="menuitem" onClick={() => { setMenuAberto(false); acoes.exportar(f); }}>{r}</button>
              ))}
            </div>
          )}
        </div>
        <button className={`primario ${semArquivo ? 'com-indicador' : ''}`} onClick={acoes.salvarArquivo} title={semArquivo ? 'Há alterações que ainda não estão em arquivo (Ctrl+S)' : 'Arquivo atualizado (Ctrl+S)'}>
          Salvar arquivo
        </button>
      </nav>
    </header>
  );
}

export function Avisos() {
  const avisos = useLoja((s) => s.avisos);
  const dispensar = useLoja((s) => s.dispensarAviso);
  return (
    <div className="notificacoes" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className={`notificacao ${a.tipo}`}>
          <span>{a.texto}</span>
          <button className="icone" aria-label="Dispensar" onClick={() => dispensar(a.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
