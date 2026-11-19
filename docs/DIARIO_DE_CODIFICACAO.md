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

---

## 2026-11-19 — Fase 2: Web Audio API (playback local)

**Feito**
- `audio/engine.js`: `AudioContext`, cadeia master (ganho → compressor como limitador → saída), controle de vozes,
  pré-escuta, cancelamento de notas pendentes e parada com *fade* de 20 ms (sem estalos).
- `audio/instruments.js`: os 4 timbres sintetizados em tempo real:
  - **Piano** — 5 parciais senoidais com leve inarmonicidade, ataque de 4 ms e decaimento mais rápido nos agudos;
  - **Bateria** — bumbo (seno com queda de 150→45 Hz), caixa (ruído passa-alta + corpo triangular),
    hi-hats fechado/aberto (ruído passa-alta 7 kHz com decaimentos de 50/350 ms);
  - **Lofi Synth** — triângulo + seno desafinados ±8 cents, vibrato de 4,5 Hz e passa-baixa em 900 Hz;
  - **Lead Synth** — duas dentes-de-serra ±6 cents com passa-baixa em 4,5 kHz.
- `audio/scheduler.js`: agendador com *lookahead* (timer de 25 ms agenda 120 ms à frente no relógio do áudio).
- `core/schedule.js`: cálculo puro das notas numa janela de ticks, inclusive atravessando a volta do loop.
- Frequências: `f = 440 · 2^((midi − 69)/12)` (temperamento igual, A4 = 440 Hz).
- Pré-escuta ao clicar numa tecla e ao criar uma nota (quando parado); teclas acendem quando a nota soa.

**Decisões**
- **Relógio único:** o transporte passou a usar `AudioContext.currentTime`. O cursor visual usa
  `tickAt(agora − outputLatency)`, ficando alinhado com o som que efetivamente sai do alto-falante (RNF01).
- **Mudanças durante o play** (seek, loop, compassos) disparam `reanchor`: o motor descarta vozes ainda
  não iniciadas e o agendador recomeça da nova posição — evita notas duplicadas.
- **BPM em tempo real** não reancora a posição absoluta, então o agendador continua de onde estava (sem duplicar nem pular).
- **No fim sem loop** o motor não corta as vozes: as caudas (release) terminam naturalmente. Só o PAUSE silencia (com fade).
- Se o timer atrasar muito (aba em segundo plano), o agendador pula o trecho perdido em vez de disparar uma rajada de notas.
- Sem Web Audio API, o app continua funcionando em modo silencioso e avisa o usuário.

**Problemas encontrados**
- Teste E2E da pré-escuta clicava na primeira tecla, escondida sob a régua *sticky* → `scroll-margin-top` nas teclas
  e o teste usa uma tecla do meio.
- Renderização offline revelou pico de **1,01** na caixa (ruído 0,55 + corpo 0,5) → níveis reduzidos para 0,42/0,38.

**Verificação**
- 40 testes unitários (+8: janelas de agendamento, travessia de loop, janelas consecutivas sem duplicar/perder, `tickAt`).
- E2E 20/20: `AudioContext` em `running`, vozes agendadas durante o play, pré-escuta, e **renderização offline de cada
  instrumento em 5 notas** (sem NaN, pico entre 0,02 e 1,0).
