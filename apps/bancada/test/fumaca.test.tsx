// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

// O bpmn-js precisa de SVG real (getBBox etc.), que o jsdom não tem; o desenho é conferido no navegador.
vi.mock('../src/Diagrama', () => ({ Diagrama: () => <div className="diagrama" /> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = () => {};

const clicar = (el: Element) => act(() => (el as HTMLElement).click());
const botao = (texto: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!;

describe('bancada (fumaça)', () => {
  it('abre com o exemplo e navega por todas as abas', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    await act(() => createRoot(div).render(<App />));

    expect(document.querySelectorAll('table.etapas tbody tr')).toHaveLength(9);
    expect(document.body.textContent).toContain('Média (23)');

    for (const aba of ['Análises', 'RACI', 'Raias', 'Arquivo', 'Importação', 'Problemas']) {
      await clicar(botao(aba));
      expect(document.querySelector('.painel')!.textContent!.length).toBeGreaterThan(10);
    }

    // excluir E05 gera erro e desfazer volta
    await clicar(document.querySelector('button[title="Excluir E05"]')!);
    expect(document.querySelectorAll('table.etapas tbody tr')).toHaveLength(8);
    expect(document.body.textContent).toContain('V08');
    await clicar(botao('Desfazer'));
    expect(document.querySelectorAll('table.etapas tbody tr')).toHaveLength(9);

    // importação simulada
    await clicar(botao('Importação'));
    await clicar(botao('Normalizar'));
    expect(document.querySelector('pre.relatorio')!.textContent).toContain('Relatório de importação');
    await clicar(botao('Abrir como processo'));
    expect(document.querySelectorAll('table.etapas tbody tr')).toHaveLength(10);
  });
});
