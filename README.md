# Beat Productor

Aplicação web minimalista para criação rápida de beats e sequências musicais em um grid estilo *piano roll*.

- **Frontend:** HTML5 + Tailwind CSS (CDN) + Vanilla JS (ES Modules) + Web Audio API.
- **Backend:** Python (FastAPI) + NumPy/SciPy para síntese e exportação do áudio.

📘 **[Manual de uso](docs/MANUAL_DE_USO.md)** · 📓 **[Diário de codificação](docs/DIARIO_DE_CODIFICACAO.md)** · 🔌 **[API](docs/API.md)** ·
📐 **[Especificação do MVP](docs/especificacao/especificacao-mvp.md)** · 📝 **[Requisitos originais](docs/especificacao/requisitos.md)**

---

## Requisitos

- **Python 3.10+** (testado com 3.12)
- **Node.js 21+** — apenas para rodar os testes do frontend/E2E
- **Chrome ou Edge** — para o teste E2E (ou defina `CHROME_PATH`)
- Conexão com a internet no navegador (Tailwind via CDN)

## Execução rápida

### Windows: duplo clique em **`BeatProductor.exe`** (na raiz do projeto)

Ele faz tudo sozinho: encontra o Python, prepara o ambiente na primeira vez, escolhe uma porta livre,
sobe o servidor e abre o navegador. Para encerrar, feche a janela.
Opções de linha de comando: `--port N`, `--no-browser`, `--no-pause`.

### Pelo terminal

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\run.ps1
```

```bash
# Linux / macOS / Git Bash
scripts/run.sh
```

Abra **http://127.0.0.1:8000**. Na primeira execução o script cria o `.venv` e instala as dependências.

## Testes

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test.ps1   # ou: scripts/test.sh
```

Roda, em sequência: pytest (backend), `node:test` + verificação de sintaxe (frontend) e o E2E em navegador headless
(incluindo uma exportação MP3 real).

| Suíte | Quantidade |
|---|---|
| Backend (pytest) | 94 testes |
| Frontend (`node:test`) | 89 testes |
| E2E (Chrome/Edge headless) | 40 verificações |

## Estrutura de diretórios

```
BeatProductor/
├── frontend/                 # Interface (servida como arquivos estáticos)
│   ├── index.html
│   ├── css/styles.css        # Estilos complementares ao Tailwind
│   ├── js/
│   │   ├── main.js           # Ponto de entrada: liga estado, UI, áudio e transporte
│   │   ├── config.js         # Constantes (ticks, faixas, instrumentos)
│   │   ├── core/             # Lógica pura, sem DOM (testável no Node)
│   │   │   ├── music.js      #   notas, MIDI, frequências, bateria
│   │   │   ├── timing.js     #   ticks ↔ segundos, divisões, formatação
│   │   │   ├── layout.js     #   geometria do grid
│   │   │   ├── sequence.js   #   modelo de notas e pausas (unir, fim da música)
│   │   │   ├── store.js      #   estado da aplicação
│   │   │   ├── schedule.js   #   notas numa janela de tempo (agendamento)
│   │   │   ├── export.js     #   pedido de exportação + pré-validação
│   │   │   ├── project.js    #   projeto salvo (serialização/saneamento)
│   │   │   ├── project-file.js#   arquivo de projeto em texto (exportar/importar)
│   │   │   ├── selection.js  #   seleção, mover, copiar/colar, UNIR/SEPARAR
│   │   │   └── transport.js  #   relógio musical (play/pause/seek/loop)
│   │   ├── audio/            # Web Audio API
│   │   │   ├── engine.js     #   AudioContext, master, vozes
│   │   │   ├── instruments.js#   síntese dos 4 instrumentos
│   │   │   └── scheduler.js  #   agendador com lookahead
│   │   ├── services/         # Mundo externo
│   │   │   ├── api.js        #   chamada ao backend e download
│   │   │   └── storage.js    #   salvamento automático (localStorage)
│   │   └── ui/               # Componentes de interface (DOM)
│   ├── tests/                # Testes unitários (node:test)
│   ├── scripts/              # Verificação de sintaxe/imports
│   └── package.json          # Só scripts de teste — sem dependências
├── backend/                  # API Python (FastAPI) — também serve o frontend
│   ├── app/
│   │   ├── main.py           # Criação da aplicação + arquivos estáticos
│   │   ├── schemas.py        # Contrato JSON (Pydantic)
│   │   ├── api/routes.py     # /api/health e /api/export
│   │   ├── audio/
│   │   │   ├── instruments.py#   síntese NumPy/SciPy dos 4 instrumentos
│   │   │   ├── renderer.py   #   mixagem, loops (overlap-add), normalização
│   │   │   └── encoder.py    #   WAV e MP3 (lameenc)
│   │   └── core/             # Configuração e teoria musical
│   ├── tests/                # Testes pytest
│   ├── requirements.txt      # Dependências de execução
│   ├── requirements-dev.txt  # + dependências de teste
│   └── pyproject.toml        # Configuração do pytest
├── BeatProductor.exe         # Lançador para Windows (duplo clique)
├── launcher/                 # Código do lançador (C#), ícone e script de build
├── tests/e2e/                # Teste ponta a ponta em navegador headless (CDP)
├── docs/                     # Manual, diário, API e especificação
└── scripts/                  # run.ps1/.sh (executar) e test.ps1/.sh (testar tudo)
```

## Roadmap

- [x] **Fase 1** — Estrutura base, grid de 3 oitavas e cursor de reprodução
- [x] **Fase 2** — Web Audio API (playback local)
- [x] **Fase 3** — Backend Python e síntese
- [x] **Fase 4** — Exportação MP3 e ajustes finais
