"""Servidor local do Mapeador de Processos.

Serve a pasta ``web/`` (HTML, CSS e JS puros) para o navegador. Usa só a
biblioteca padrão do Python.

Uso:
    uv run python server.py                 # http://localhost:5174
    uv run python server.py --porta 8080
    uv run python server.py --abrir         # já abre o navegador
    uv run python server.py --rede          # aceita acesso de outras máquinas da rede
"""

from __future__ import annotations

import argparse
import sys
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PASTA_WEB = Path(__file__).resolve().parent / "web"

# Tipos fixos: no Windows, o registro às vezes devolve text/plain para .js,
# e o navegador recusa módulos ES servidos assim.
TIPOS = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".html": "text/html",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain",
}


class Manipulador(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **TIPOS}

    def end_headers(self) -> None:
        # Sem cache: alterou um arquivo, recarregou a página, vê a mudança.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, formato: str, *args: object) -> None:
        # Só registra erros; as requisições normais poluiriam o terminal.
        if len(args) >= 2 and str(args[1]).startswith(("4", "5")):
            super().log_message(formato, *args)


def main() -> int:
    parser = argparse.ArgumentParser(description="Servidor local do Mapeador de Processos")
    parser.add_argument("--porta", type=int, default=5174, help="porta HTTP (padrão: 5174)")
    parser.add_argument("--abrir", action="store_true", help="abre o navegador ao iniciar")
    parser.add_argument(
        "--rede",
        action="store_true",
        help="escuta em todas as interfaces (outras máquinas da rede conseguem acessar)",
    )
    args = parser.parse_args()

    if not (PASTA_WEB / "index.html").is_file():
        print(f"Não encontrei {PASTA_WEB / 'index.html'}.", file=sys.stderr)
        return 1
    if not (PASTA_WEB / "vendor").is_dir():
        print("A pasta web/vendor não existe. Rode `pnpm install && pnpm vendor` uma vez.", file=sys.stderr)
        return 1

    host = "0.0.0.0" if args.rede else "127.0.0.1"
    manipulador = partial(Manipulador, directory=str(PASTA_WEB))
    try:
        servidor = ThreadingHTTPServer((host, args.porta), manipulador)
    except OSError as e:
        print(f"Não foi possível usar a porta {args.porta}: {e}", file=sys.stderr)
        return 1

    endereco = f"http://localhost:{args.porta}/"
    print(f"Mapeador de Processos em {endereco}  (Ctrl+C para parar)", flush=True)
    if args.abrir:
        webbrowser.open(endereco)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor parado.")
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
