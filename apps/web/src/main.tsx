import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { aplicarTema, temaSalvo } from './tema';
import './estilo.css';

aplicarTema(temaSalvo());

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Só em desenvolvimento: acesso ao estado pelo console (e pelos testes de navegador)
if (import.meta.env.DEV) {
  void import('./estado/loja').then(({ useLoja }) => {
    (window as unknown as { __mapeador: unknown }).__mapeador = { loja: useLoja };
  });
}
