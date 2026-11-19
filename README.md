# Beat Productor

Aplicação web minimalista para criação rápida de beats e sequências musicais em um grid estilo *piano roll*.

- **Frontend:** HTML5 + Tailwind CSS (CDN) + Vanilla JS (ES Modules) + Web Audio API.
- **Backend:** Python (FastAPI) + NumPy/SciPy para síntese e exportação do áudio.

📘 **[Manual de uso](docs/MANUAL_DE_USO.md)** · 📓 **[Diário de codificação](docs/DIARIO_DE_CODIFICACAO.md)** ·
📐 **[Especificação do MVP](docs/especificacao/especificacao-mvp.md)** · 📝 **[Requisitos originais](docs/especificacao/requisitos.md)**

---

## Estrutura de diretórios

```
BeatProductor/
├── frontend/                 # Interface (servida como arquivos estáticos)
│   ├── index.html
│   ├── css/styles.css        # Estilos complementares ao Tailwind
│   ├── js/
│   │   ├── main.js           # Ponto de entrada: liga estado, UI e transporte
│   │   ├── config.js         # Constantes (ticks, faixas, instrumentos)
│   │   ├── core/             # Lógica pura, sem DOM (testável no Node)
│   │   │   ├── music.js      #   notas, MIDI, frequências, bateria
│   │   │   ├── timing.js     #   ticks ↔ segundos, divisões, formatação
│   │   │   ├── layout.js     #   geometria do grid
│   │   │   ├── sequence.js   #   modelo das notas
│   │   │   ├── store.js      #   estado da aplicação
│   │   │   ├── schedule.js   #   notas numa janela de tempo (agendamento)
│   │   │   └── transport.js  #   relógio musical (play/pause/seek/loop)
│   │   ├── audio/            # Web Audio API
│   │   │   ├── engine.js     #   AudioContext, master, vozes
│   │   │   ├── instruments.js#   síntese dos 4 instrumentos
│   │   │   └── scheduler.js  #   agendador com lookahead
│   │   └── ui/               # Componentes de interface (DOM)
│   ├── tests/                # Testes unitários (node:test)
│   ├── scripts/              # Verificação de sintaxe/imports
│   └── package.json          # Só scripts de teste — sem dependências
├── backend/                  # API Python (Fase 3)
├── tests/e2e/                # Teste ponta a ponta em navegador headless (CDP)
├── docs/                     # Manual, diário e especificação
└── scripts/                  # Scripts de execução e teste
```

## Execução rápida

```powershell
python -m http.server 8000 --directory frontend
# abra http://127.0.0.1:8000
```

## Testes

```powershell
cd frontend; npm test; npm run check          # unitários + sintaxe/imports
node tests/e2e/smoke.mjs http://127.0.0.1:8000/   # E2E (com o servidor rodando)
```

## Roadmap

- [x] **Fase 1** — Estrutura base, grid de 3 oitavas e cursor de reprodução
- [x] **Fase 2** — Web Audio API (playback local)
- [ ] **Fase 3** — Backend Python e síntese
- [ ] **Fase 4** — Exportação MP3 e ajustes finais
