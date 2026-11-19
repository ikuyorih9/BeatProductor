# Diário de Codificação — Beat Productor

Registro cronológico das decisões, problemas encontrados e verificações feitas
em cada fase do roadmap (ver [especificação](especificacao/especificacao-mvp.md)).

---

## 2026-11-19 — Fase 0: preparação do repositório

**Feito**
- Repositório git iniciado (`main`) com um remoto **local** (`../BeatProductor-remote.git`, repositório *bare*)
  para permitir `git push` sem serviço externo.
- Documentos originais movidos para `docs/especificacao/` (`especificacao-mvp.md` = antigo `readme.md`,
  `requisitos.md`). O `README.md` da raiz passou a ser o guia do projeto.
- Ambiente Python (`.venv`) com FastAPI, Uvicorn, NumPy, SciPy, lameenc, pytest e httpx.

**Decisões**
- Estrutura em `frontend/`, `backend/`, `tests/e2e/`, `docs/` e `scripts/` — cada parte com seus próprios testes.

---

## 2026-11-19 — Fase 1: estrutura base e grid (HTML + CSS + JS)

**Feito**
- Layout com Tailwind (CDN fixado em `3.4.17`): cabeçalho, piano roll de 3 oitavas (C3–B5) e rodapé de transporte.
- Grid com clique (nota curta) e clique-e-arraste (nota longa, em qualquer direção); clique/botão direito apaga.
- Cursor de reprodução com régua clicável, auto-rolagem e mostradores (compasso.batida e relógio).
- Atalhos: Espaço (play/pause), Home (início), End (fim).

**Decisões e interpretações da especificação**
- **Divisão de tempo (`1/2`, `1/4`, `1/6`) = células por batida.** "1/4 separará blocos de 4 notas":
  cada batida vira um bloco de 4 células (semicolcheias). `1/2` = colcheias, `1/6` = sextinas.
  Essa leitura é a mais útil para fazer beats (a outra leitura — `1/4` = uma célula por semínima — deixaria o grid grosseiro demais).
- **Unidade interna: tick = 1/12 de batida.** 12 é o MMC de 2, 4 e 6, então as três divisões são inteiras;
  trocar a divisão não desloca nem destrói notas (sem erro de ponto flutuante).
- **"A largura das células depende do BPM":** largura proporcional à duração real da célula
  (224 px/s), limitada a 16–112 px para o grid continuar utilizável.
- **Campo "Compassos"** (padrão 4) adicionado ao cabeçalho: a especificação pede "FIM" e loop,
  o que exige um tamanho de sequência definido. É não destrutivo: diminuir e voltar a aumentar não perde notas.
- **Notas por instrumento:** todas as notas convivem na mesma sequência; o instrumento selecionado define o
  das novas notas. As dos outros instrumentos aparecem esmaecidas (referência visual) e não são editáveis.
- **Bateria:** peça escolhida pela classe de altura da nota % 4 → C = Bumbo, C# = Caixa, D = Hi-Hat fechado,
  D# = Hi-Hat aberto, E = Bumbo… No modo Bateria as teclas mostram o nome da peça.
- **Transporte com relógio injetável** (`now()`): na Fase 1 usa `performance.now()`; na Fase 2 passa a usar o
  `AudioContext.currentTime`, mantendo cursor e áudio na mesma base de tempo (RNF01).

**Problemas encontrados**
- `node --test tests/` falha no Node 24 (diretório é tratado como arquivo) → script usa glob `"tests/**/*.test.js"` (Node ≥ 21).
- Teste E2E clicava em linhas fora da área visível (atrás do rodapé) → o teste agora rola o grid até a linha.
- No modo Bateria o texto da tecla preta invadia a parte branca do degradê → teclas de bateria ganharam estilo próprio.

**Verificação**
- 32 testes unitários (`node:test`) — teoria musical, tempo/layout, sequência, store e transporte.
- Teste E2E em Chrome headless via DevTools Protocol (`tests/e2e/smoke.mjs`): 17/17 verificações,
  incluindo cliques e arrastes reais de mouse, troca de instrumento/divisão/BPM, play/pause, fim sem loop,
  loop contínuo e **zero erros de JavaScript no console**.
