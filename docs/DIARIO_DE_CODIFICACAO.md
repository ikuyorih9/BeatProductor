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

---

## 2026-11-19 — Fase 3: backend em Python e estrutura de dados

**Feito**
- API **FastAPI** (`backend/app`) com `GET /api/health` e `POST /api/export`; o mesmo servidor entrega o frontend.
- Contrato JSON validado com **Pydantic** (`schemas.py`): `{ time, note, duration, instrument }` por evento,
  mais `length`, `loop`, `loops`, `bpm` e `format`. Ver [API.md](API.md).
- Síntese em **NumPy/SciPy** (`audio/instruments.py`) espelhando os timbres do navegador: parciais do piano,
  bumbo com queda de frequência, caixa/hi-hats com ruído filtrado (Butterworth), lofi com vibrato e passa-baixa,
  lead com dente-de-serra **PolyBLEP** (menos aliasing).
- Mixagem (`audio/renderer.py`) com *overlap-add* das repetições, normalização a −1 dBFS e fades de borda.
- Codificação (`audio/encoder.py`): WAV pela biblioteca padrão e MP3 192 kbps pelo `lameenc`.
- Scripts `scripts/run.ps1|sh` (cria `.venv`, instala e sobe o servidor) e `scripts/test.ps1|sh` (roda tudo).

**Decisões**
- **FastAPI** em vez de Flask: validação declarativa do JSON, respostas 422 detalhadas e documentação `/docs` grátis.
- **`lameenc` em vez de `pydub`** para o MP3: o `pydub` depende do binário externo **ffmpeg** (fora do pip), uma fonte
  clássica de erro de instalação. O `lameenc` traz o encoder LAME como wheel — `pip install` e pronto.
  A mixagem que o `pydub` faria (somar trechos, ajustar ganho) é feita diretamente em NumPy, com mais controle.
- **Tempos em segundos** no contrato (como no exemplo da especificação); o frontend converte a partir dos ticks.
- **Loops por overlap-add** de uma única passada renderizada: barato (renderiza o padrão uma vez) e garante que as
  caudas atravessem as emendas — nenhuma repetição começa com corte abrupto (RNF03).
- **Limites de segurança**: 5000 eventos, padrão ≤ 120 s, total ≤ 600 s — evita que um pedido derrube o servidor por memória.
- **Tolerância de ponto flutuante** (1e-6) ao validar `time < length`: divisões 1/6 geram dízimas no navegador.
- Rota de exportação síncrona (`def`): o FastAPI a executa no pool de threads, sem bloquear o loop de eventos.
- `mimetypes` fixado para `.js`/`.css`: no Windows o registro pode mapear `.js` para `text/plain`, e o navegador
  recusaria os ES Modules.

**Problemas encontrados**
- O `TestClient` do Starlette emite um aviso de depreciação sugerindo o pacote `httpx2`. A instalação desse pacote
  foi bloqueada pela política de permissões do ambiente; como o `httpx` atual funciona normalmente, o aviso foi
  filtrado em `pyproject.toml` (somente essa mensagem).
- `scripts/test.ps1` falhou na primeira execução porque a porta 8765 ainda estava ocupada pelo servidor estático
  usado nas fases 1–2 → processo encerrado e a mensagem de erro do script passou a sugerir outra porta.
- Scripts `.ps1` salvos com BOM UTF-8: o Windows PowerShell 5.1 lê arquivos sem BOM como ANSI e corromperia os acentos.

**Verificação**
- **88 testes pytest**: teoria musical (paridade com o frontend), cada instrumento × 7 notas (finito, audível, sem
  clipping, termina em silêncio), ADSR, posição exata da nota em amostras, voltas idênticas amostra a amostra,
  continuidade na emenda do loop, normalização, 13 casos de pedido inválido → 422, frontend servido com MIME correto
  e **decodificação do MP3 com ffmpeg** sem erros e com a duração esperada.
- `scripts/test.ps1` e `scripts/test.sh`: backend + 40 testes do frontend + E2E 20/20 contra o servidor FastAPI.

---

## 2026-11-19 — Fase 4: exportação de arquivo e ajustes finais

**Feito**
- **Exportação integrada:** `core/export.js` monta o pedido a partir do grid (ticks → segundos) com loop e
  quantidade de repetições; `services/api.js` chama `POST /api/export`, recebe o MP3 e dispara o download
  (`Blob` + `<a download>`), usando o nome enviado pelo servidor.
- **Pré-validação no navegador** com os mesmos limites do backend: sequência vazia e áudio > 600 s geram mensagem
  clara sem chamar o servidor. Erros 422 do FastAPI são traduzidos para uma frase legível.
- Botão em estado *"Gerando…"* (bloqueia clique duplo) e mensagens de sucesso/erro.
- **Salvamento automático** no `localStorage` (`services/storage.js` + `core/project.js`): configurações e notas,
  com saneamento de tudo que é lido (dados corrompidos caem nos padrões). Salva também no `pagehide`.
- **Polimento de sincronia:**
  - destaques de tecla pendentes são cancelados no pause/seek (antes, uma tecla podia acender depois do pause);
  - um arraste em andamento é cancelado se a geometria mudar (BPM/divisão/compassos), evitando nota no lugar errado;
  - se o sistema suspender o `AudioContext`, o transporte pausa (o cursor não segue andando em silêncio);
  - `togglePlayback` ignora disparos repetidos enquanto o áudio está sendo liberado.
- Polimento visual: faixa com a cor do instrumento no seletor; CSS sem regras mortas.
- Manual de uso reescrito (tutorial "primeiro beat", exportação, salvamento, problemas comuns).

**Decisões**
- Download via `Blob` em vez de navegar até uma URL: permite exibir os erros do servidor na própria interface.
- Salvamento local (não no servidor): o MVP não tem contas de usuário; o navegador é o lugar natural.
- Os scripts de teste agora rodam o E2E com `--export`, exercitando o fluxo completo navegador → API → arquivo baixado.

**Verificação**
- 48 testes unitários do frontend (+8: payload no formato da API, bloqueios de validação, eventos sempre dentro do
  padrão inclusive em 1/6 com BPM "quebrado", mensagens de erro, nome do arquivo, saneamento e ida-e-volta do projeto).
- 88 testes do backend.
- **E2E 23/23** no Chrome headless contra o servidor FastAPI: inclui exportação real com loop (arquivo `.mp3` baixado
  e com cabeçalho válido), erro amigável ao exportar sem notas e projeto restaurado após recarregar a página —
  sem nenhum erro de JavaScript no console.
- `scripts/test.ps1` e `scripts/test.sh` passam do início ao fim; `scripts/run.ps1` sobe o servidor e responde em `/api/health`.

---

## 2026-11-19 — Extra: lançador `BeatProductor.exe`

**Feito**
- `BeatProductor.exe` na raiz (17 KB): duplo clique encontra o Python 3.10+ (`py -3`, `python`, `python3`), cria o
  `.venv` na primeira vez, instala as dependências **só quando `requirements.txt` muda** (hash SHA-256 guardado em
  `.venv/.beatproductor-deps`), escolhe porta livre de 8000 a 8020, sobe o servidor, espera `/api/health` e abre o navegador.
- Se o app já estiver rodando, o exe apenas abre o navegador. Fechar a janela ou Ctrl+C encerra o servidor.
- Erros com instrução do que fazer (Python ausente, porta ocupada, exe fora da pasta do projeto, falha de instalação);
  a janela espera Enter para o usuário conseguir ler a mensagem.
- Código em `launcher/BeatProductor.cs`, ícone gerado por `launcher/make_icon.py` (biblioteca padrão),
  build com `launcher/build.ps1`.

**Decisões**
- **C# compilado com o `csc.exe` do .NET Framework** (vem em todo Windows) em vez de PyInstaller: o exe fica com
  17 KB em vez de centenas de MB (NumPy/SciPy embutidos), não precisa de pacote extra e é recompilável sem Visual Studio.
  Código restrito a C# 5, a versão suportada por esse compilador.
- O exe **não embute** Python nem as bibliotecas: usa o Python da máquina e o `.venv` do projeto, como os scripts.
- Duas checagens de porta (conectar + reservar com `ExclusiveAddressUse`), porque no Windows um bind em
  `127.0.0.1` pode ter sucesso mesmo com outro programa escutando em `0.0.0.0`.

**Verificação** (exe real, janela oculta, saída capturada)
- A: início normal → servidor responde em `/api/health`; o carimbo de dependências é gravado.
- B: segunda instância → detecta o app rodando e termina com código 0.
- C: `--port 8000` ocupada por outro programa → erro claro, código 1.
- D: 8000 ocupada por outro programa → usa 8001 e pula o pip ("Dependências OK").
- E: **clone limpo sem `.venv`** → cria o ambiente, instala tudo da internet, sobe o servidor e `POST /api/export` devolve um MP3.
- F: exe fora da pasta do projeto → erro explicando onde ele deve ficar.

---

## 2026-11-19 — Unir notas, pausas e fim da música

**Pedido**
- Unir notas para obter tamanhos variados, como numa partitura, usando uma seleção por arraste e um botão UNIR no cabeçalho.
- Botão direito numa célula vazia cria uma pausa (bloco branco).
- O play deve parar no fim da última nota, ou recomeçar dali se o loop estiver ativo.

**Feito**
- **Modelo:** cada item da sequência ganhou `kind` (`'note'` | `'rest'`). As pausas não soam e não viram eventos
  na exportação, mas contam para o fim. Novos métodos: `addRest`, `removeNotes`, `mergeItems`, `activeItems`, `endTick`, `hasItems`.
  Projetos salvos antes (sem `kind`) carregam como notas.
- **Ferramentas** no cabeçalho (*Edição*): **✎ Desenhar** / **⬚ Selecionar** + botão **UNIR** (mostra a contagem e só
  acende quando há o que unir). Shift+arrastar seleciona em qualquer ferramenta.
- **Seleção por retângulo** (`core/selection.js`, puro e testado), contorno amarelo nos selecionados, Shift+clique
  para adicionar/remover, clique no vazio limpa.
- **UNIR** (`Sequence.mergeItems`): por linha (instrumento + altura + tipo), do início do primeiro ao fim do último;
  o resultado continua selecionado.
- **Pausa** com botão direito na célula vazia; botão direito num bloco apaga (em qualquer ferramenta).
- **Fim da música** = fim do último item (nota ou pausa): o transporte usa esse comprimento, então o play para ali
  (sem loop) ou recomeça (com loop). O botão FIM/End vai até ele, e há um marcador amarelo tracejado com etiqueta **FIM** na régua.
- **Atalhos:** D (desenhar), S (selecionar), U (unir), Delete/Backspace (apagar seleção), Esc (limpar seleção).
- Rodapé mostra notas, pausas e duração da música.
- Correções visuais: cabeçalho compactado para caber numa linha a 1400 px; o fundo da régua agora acompanha
  a rolagem horizontal (antes terminava no meio — defeito anterior a esta mudança).

**Decisões**
- **UNIR por linha** (como a ligadura da partitura, que liga notas de mesma altura). Selecionar várias linhas e
  unir junta cada linha separadamente; notas não se unem a pausas. Se houver espaço vazio entre as notas
  selecionadas, ele passa a fazer parte da nota longa — permite "esticar" uma nota selecionando o início e o fim.
- **Ferramenta explícita** em vez de só uma tecla modificadora: o arraste no modo Desenhar continua criando notas
  longas, então a seleção precisava de um modo próprio. Shift+arrastar fica como atalho.
- **A exportação também vai até o fim da música**, não até o fim do grid: assim o loop exportado tem exatamente a
  mesma duração do loop tocado no navegador. Para estender a passada (silêncio antes de repetir), usa-se uma pausa.
- Sem nenhum item no grid, o fim vale o tamanho do grid (o cursor continua utilizável num projeto vazio).
- A ferramenta ativa não é salva: o app sempre abre em Desenhar, para um clique nunca "não fazer nada" por engano.

**Verificação**
- 62 testes unitários (+14): pausas, compatibilidade com projetos antigos, fim da música, UNIR (vizinhas, com
  lacuna, várias linhas, instrumentos/tipos diferentes, nada a unir), seleção por retângulo, exportação estendida por pausa.
- **E2E 29/29** (+6): FIM no fim da última nota; play sem loop para em ~0,5 s em vez de 4 s; loop nunca passa do
  fim da última nota; botão direito cria pausa branca que estende o fim e o loop; botão direito apaga a pausa;
  retângulo + UNIR transformam 4 células numa nota de 12 ticks; clique no modo Selecionar não apaga; Esc e Delete.
- 88 testes do backend inalterados e passando.

---

## 2026-11-19 — Lixeira, copiar/colar, mover, Limpar tudo, BPM × partitura, arquivo de projeto, mixer, SEPARAR

**Pedido (7 itens)**
1. Lixeira ao lado de Limpar, ativa só com seleção.
2. Ctrl+C/Ctrl+V e arrastar a seleção para cima/baixo.
3. "Limpar tudo".
4. Verificar o BPM: músicas copiadas de partituras soavam erradas (4/4? 3/4?).
5. Exportar/importar um arquivo de projeto legível, com cabeçalho e notas, restaurando **exatamente** a configuração.
6. Volume por instrumento.
7. Botão SEPARAR para notas unidas.

**Diagnóstico do BPM (item 4)**
- A conta estava certa: 1 batida = 1 semínima = 12 ticks, e 120 BPM → 0,5 s, coberto por teste.
- O problema era o **nome da divisão**:
  - "1/4" significava *4 células por batida*, ou seja, cada célula era uma **semicolcheia**;
  - na partitura, "1/4" é a **semínima**;
  - quem desenhava uma semínima em 1 célula ouvia a música **4× mais rápida**.
- Além disso, o compasso era fixo em 4/4. Isso não muda o andamento, mas desalinhava as barras de 3/4 e 6/8.
- Correções:
  - **Célula** passou a ter o nome da figura: `1/4` semínima, `1/8` colcheia, `1/8T`, `1/16` semicolcheia (padrão, a mesma célula de antes), `1/16T`. Foi incluída a semínima, que não existia.
  - Novo campo **Compasso**: 2/4, 3/4, 4/4, 5/4, 6/8, 12/8. Todos têm um número inteiro de semínimas, então qualquer célula encaixa.
  - O rótulo virou **BPM (♩)**, porque o BPM conta semínimas, como no metrônomo da partitura. O manual explica 6/8 com ♩. (×1,5).
  - Projetos salvos na v1 migram a divisão para o nome novo, mantendo a mesma célula (`PROJECT_VERSION = 2`).

**Volume (item 6) — medição antes de mexer**
- O RMS de cada instrumento foi medido nos dois motores:
  - navegador: piano −11,5, lofi −13,3, **lead −19,7**, bumbo −14,3 dB;
  - Python: piano −14,6, lofi −14,4, **lead −19,9**, bumbo −17,4 dB.
- O lead estava cerca de 6 dB abaixo dos outros. Cada motor recebeu sua **calibração**, para 100% soar equilibrado:
  - `INSTRUMENT_TRIM` no JS: lead ×2,1, piano ×0,85;
  - no Python: lead ×1,9, bateria ×1,25.
- Os motores são diferentes, então cada um tem os próprios valores.
- Mixer na barra de edição: 0–150%, duplo clique volta a 100%.
- No navegador, cada instrumento tem um **canal** (GainNode), e o volume muda ao vivo, com rampa de 30 ms.
- No MP3, cada evento leva `gain` (campo novo e opcional da API; o padrão 1 mantém a compatibilidade).

**Arquivo de projeto (item 5)**
- Formato de texto no estilo INI, pensado para ser lido e escrito à mão:
  - seções `[projeto]`, `[volume]` e uma por instrumento;
  - uma nota por linha: `posição  nota  duração  [pausa]`.
- A posição é `compasso.tempo+fração` e a duração é em tempos (`1`, `1/2`, `1+1/2`, `1.5`), com **frações exatas**. Um teste faz a ida e volta em todos os compassos × células, tick a tick.
- Aceita bemóis (`Bb4`), minúsculas, acentos e nomes de peças da bateria (`bumbo`, `caixa`…).
- Com erro, nada é importado e o app mostra a linha e o motivo. Sobreposições e notas depois do fim do grid geram aviso.
- **Bug pego pela ida e volta:** o `#` de comentário cortava sustenidos (`C#3`). Agora um comentário só começa no início da linha ou depois de um espaço.

**Edição (itens 1, 2, 3, 7)**
- O cabeçalho virou duas faixas:
  - em cima, a música: instrumento, compasso, BPM, compassos, célula, loop, importar/exportar;
  - embaixo, a barra de edição: ferramenta, UNIR, SEPARAR, 🗑, Limpar, Limpar tudo e o mixer.
- **Mover:**
  - arrastar uma nota selecionada move o grupo (vertical = altura, horizontal = células);
  - durante o arraste há uma prévia com `transform`;
  - o deslocamento é limitado às bordas (`clampMove`);
  - as setas também movem (Shift+↑↓ = oitava);
  - `Sequence.moveItems` preserva os ids, então a seleção continua valendo.
- **Copiar/colar:**
  - a área de transferência é interna e guarda posições relativas ao tempo onde a seleção começa;
  - colar vai no **cursor** e no **instrumento atual**;
  - o cursor avança pelo tamanho do trecho (arredondado a tempos), então Ctrl+V repetido encadeia;
  - também há Ctrl+X e Ctrl+A.
- **SEPARAR:** `splitItems` corta nas divisas das células do grid. É o inverso de UNIR e vale para pausas.

**Defeito encontrado e corrigido no caminho**
- Na entrega anterior, o transporte passou a ter o tamanho do **fim da música**, e o `seek` ficava limitado a ele.
- Consequência: o cursor não podia ser posicionado depois da última nota, o que impedia colar ali.
- Correção: o transporte agora tem dois limites:
  - `lengthTicks` (fim da música: onde o play para ou recomeça);
  - `gridTicks` (até onde o cursor vai parado).
- Dar play além do fim recomeça do início.

**Verificação**
- pytest: ganho por evento (escala, mudo, tudo mudo sem erro), calibração (melódicos a menos de 3 dB entre si) e validação de `gain`.
- node:test (+22):
  - figuras e compassos, migração v1, projeto sem a ferramenta;
  - SEPARAR, mover, colar encadeado, gain na exportação;
  - arquivo de projeto: frações, posições em todos os compassos, notas, ida e volta exata, arquivo escrito à mão, erros com linha, avisos;
  - transporte com dois limites.
- E2E 39/39 (+10), com cliques, arrastes e teclas reais:
  - lixeira, arrastar para baixo/cima/lado, setas, Ctrl+C/Ctrl+V encadeado e entre instrumentos, SEPARAR, compasso 3/4, mixer (ganho real do canal);
  - **exportar projeto → Limpar tudo → importar** devolve projeto e configurações idênticos.
- O helper `cellPoint` do E2E rolava a tela a cada chamada. Com o cabeçalho mais alto, o início e o fim de um arraste caíam na mesma altura. Agora ele só rola quando a linha está fora da vista.

---

## 2026-11-19 — Compassos 3/8, 5/8, 7/8 e 9/8

**Pedido:** "não tem 3/8 no compasso".

**Por que não havia:** a lista inicial só tinha compassos com um número inteiro de semínimas, para que **toda** célula
encaixasse. Um compasso de 3/8 tem 1 semínima e meia (18 ticks): a célula de semínima (12) e a de tercina de
colcheia (4) não dividem o compasso.

**Feito**
- Entraram 3/8, 5/8, 7/8 e 9/8.
- Nova regra `divisionFitsMeter(célula, compasso)`, que verifica se o compasso é múltiplo da célula. Ela vale em todos os pontos:
  - no **cabeçalho**, as células que não cabem ficam desabilitadas. Trocar para um desses compassos com uma célula incompatível muda a célula para **colcheia** (que cabe em todos) e mostra um aviso;
  - no **projeto salvo**, uma combinação inválida cai na célula padrão (1/16, que cabe em todos);
  - no **arquivo de projeto**, uma combinação inválida é erro, com a explicação.

**Verificação**
- node:test 89 (+2): 3/8 e 7/8, a tabela completa de compatibilidade e um arquivo em 3/8 (válido e inválido).
- O teste de ida e volta passou a escolher uma célula compatível em cada compasso.
- E2E +1: semínima → 3/8 vira colcheia, a opção fica desabilitada e o aviso aparece.

---

## 2026-11-19 — Bateria baixa e mixer que "não aumentava"

**Pedido:** "o som da bateria tá baixo no 100%. E o aumento de volume não aumenta realmente muito".

**Medição (RMS numa janela de 150 ms, mais justa para sons de ataque)**
- No navegador, em relação aos instrumentos melódicos (cerca de −10 dB):
  - bumbo −9 dB (ok);
  - caixa −20 dB (10 dB abaixo);
  - **hi-hat fechado −31 dB** (21 dB abaixo);
  - hi-hat aberto −22 dB.
- Um beat é quase só caixa e hi-hat, por isso parecia baixo. No Python, o mesmo padrão um pouco menor.
- **Slider:** era linear, então 150% dava só +3,5 dB.
- **Pior:** medi o beat inteiro pela cadeia real do navegador. De 100% para 200% a bateria subia só **3,5 dB**, porque o compressor de saída (limiar −8 dB, master 0,7) "devolvia" o reforço.
- A mesma medição mostrou **picos de +0,5 a +3,6 dBFS** na saída, ou seja, risco de distorção digital.

**Feito**
- **Calibração por peça da bateria** nos dois motores, para o mesmo equilíbrio: caixa −1,5, hi-hat fechado −8, aberto −5 dB em relação ao bumbo.
  - JS: caixa ×2,8, fechado ×7, aberto ×2,4, medidos **na cadeia de saída real**;
  - Python: ×2,3, ×3,9, ×2,6.
  - No navegador, a calibração é aplicada no ganho de cada voz, não no sintetizador. Assim o teste de clipping de cada voz continua valendo.
- **Caixa e hi-hat fechado mais encorpados**, nos dois motores e iguais:
  - caixa: ruído decai em 0,3 s (era 0,2) e corpo em 0,15 s (era 0,1);
  - hi-hat fechado: 80 ms (era 50).
  - Motivo: o primeiro E2E da cadeia real mostrou que reforçar a caixa só alimentava o limitador. O pico dela é cerca de 17 dB acima da média, e ela chegava 5 dB abaixo do bumbo mesmo calibrada. Com mais corpo, ela soa mais alta com o mesmo pico.
- **Curva perceptiva do volume:** ganho = (%/100)², com faixa de 0 a 200%. 50% ≈ −12 dB e 200% ≈ +12 dB. A API passou a aceitar `gain` até 4.
- **Nova cadeia de saída:** master 0,45 (mais folga), compressor leve (−2 dB, 4:1) e um **limitador suave** (WaveShaper com teto de 0,98).
  - Testei quatro configurações com medição.
  - O `oversample` do WaveShaper ficou desligado, porque o filtro de oversample criava sobressinal acima do teto.
- **Resultado:**
  - pico sempre ≤ −0,7 dBFS, mesmo com tudo a 200%;
  - bateria +11 dB de 50% para 100% e cerca de +8 dB de 100% para 200%. O restante é segurado pelo limitador, porque os ataques da bateria já chegam perto do teto.
- O limitador mudou de lugar, então o app ficou cerca de 2 dB mais baixo no geral. Em troca, há folga real para o mixer.

**Verificação**
- pytest: peças da bateria a menos de 3 dB (caixa) e 10 dB (hi-hats) do bumbo; 200% = +12,04 dB na mixagem do MP3.
- node:test: curva do volume e `gain` enviado na curva.
- E2E: renderiza um beat denso pela **cadeia de saída real** (`createOutputChain`, exportada para o teste) e confere:
  - equilíbrio das peças;
  - pico < 0 dBFS a 100% e com tudo a 200%;
  - 200% reforça mais de 6 dB e 50% atenua mais de 9 dB.

---

## 2026-11-19 — Instalação falhava em computadores sem o Python certo

**Relato:** em alguns computadores a instalação falhava com *"could not find a version that satisfies the requirement fastapi==0.165.0"*.

**Causa:** o projeto dizia "Python 3.10+", mas isso não era verdade.
- As versões fixadas em `requirements.txt` exigem Python ≥ 3.11 (fastapi) e **≥ 3.12** (numpy 2.5, scipy 1.18).
- O pip só lista as versões compatíveis com o Python da máquina; por isso dizia que a versão "não existe".
- O lançador aceitava qualquer 3.10+, e um `.venv` criado com um Python velho ficava "preso" para sempre.

**Faixa real, conferida no PyPI:** simulei o `pip install --only-binary` de todo o `requirements-dev.txt`, inclusive as dependências transitivas.
- Há pacotes prontos para **3.12, 3.13 e 3.14**, em Windows x64, Linux x64 e macOS arm64.
- No 3.15 falha, porque o pyyaml do uvicorn ainda não tem wheel.

**Feito**
- **Lançador (C#):**
  - aceita só Python 3.12–3.14, 64 bits e não free-threaded;
  - procura no Python próprio do app, no registro do Windows (PEP 514, por usuário e para todos), no `py -3.x` e no `python`/`python3`;
  - recria o `.venv` se ele tiver sido criado com um Python fora da faixa;
  - **sem Python compatível, instala um sozinho:**
    - baixa o instalador oficial do Python 3.13.14 do python.org, forçando TLS 1.2, porque o .NET Framework antigo usa TLS 1.0;
    - confere o **SHA-256 fixado no código**; também conferi que a assinatura Authenticode é da Python Software Foundation;
    - instala em modo silencioso, **só para o usuário**, em `%LOCALAPPDATA%\BeatProductor\Python313`, sem administrador, sem PATH e sem o `py` launcher;
  - pip com `--only-binary :all:`, para nunca tentar compilar código C, e com `--retries 5`;
  - opção `--install-python` para forçar o Python próprio do app.
- **`run.ps1` e `run.sh`:**
  - mesma faixa, com recriação do `.venv` incompatível;
  - sem Python compatível no Windows, chamam o `BeatProductor.exe`, que instala;
  - no Linux/macOS, mostram como instalar (apt/brew).
- **`pyproject.toml`:** `requires-python = ">=3.12,<3.15"`.
- **Teste novo** (`test_python_support.py`): falha se a faixa divergir entre o lançador, os scripts e o pyproject, ou se o Python embutido sair dela.

**Verificação (num clone limpo, sem mexer no `.venv` em uso)**
- Lançador num caminho normal: achou o 3.12, criou o `.venv` e subiu o servidor.
- **`--install-python` de verdade:** baixou 27 MB, conferiu o hash, instalou o 3.13.14, criou o `.venv`, instalou as dependências e subiu o servidor.
  - A **suíte inteira passou no Python 3.13**, duas vezes: 96 pytest, 90 node e 41 E2E.
  - Na primeira rodada, 3 verificações E2E oscilaram com a máquina carregada pela instalação. Não se repetiram.
- `.venv` fora da faixa (build de teste com teto 3.12 sobre um `.venv` 3.13): avisou, recriou com o 3.12 e subiu.
- `run.ps1` do zero, `run.ps1` com `.venv` quebrado e `run.sh`: os três subiram o servidor.
- Depois dos testes, desinstalei o Python 3.13 de teste e apaguei a pasta dele. Esta máquina já tinha o 3.12.

---

## 2026-11-19 — Bateria com 8 peças, faixa reduzida e mais volume

**Relato:**
- as 4 peças da bateria se repetiam pelas 3 oitavas;
- pedido de um kit com Surdo, Ride, Tom 1, Tom 2, Chimbal, Caixa, Bumbo e Prato de ataque, com as outras teclas desativadas;
- a bateria ainda soava baixa no 100%.

**Kit novo:** uma peça por tecla, de C3 a G3, embaixo do grid (bumbo, caixa, chimbal, surdo, tom 2, tom 1, ride, prato de ataque).
- Tabela única em `config.js` (`DRUM_PIECES`, com a calibração de cada peça) e espelho em `music.py` (`DRUM_KIT`).
  Um teste pytest lê o `config.js` e falha se as duas divergirem.
- **Síntese nova, igual nos dois motores:**
  - tons e surdo: seno com queda de afinação, mais o estalo da baqueta;
  - ride e prato de ataque: 6 ondas quadradas desafinadas (timbre metálico, estilo TR-808) mais ruído agudo;
  - no Python, as quadradas são somadas só com harmônicos abaixo de Nyquist, como o oscilador do navegador.
- O buffer de ruído do navegador passou de 1 s para 2 s, para cobrir a cauda do prato.

**Teclas desativadas:**
- teclas e linhas fora do kit ficam riscadas e não tocam;
- desenhar, criar pausa e arrastar ali não fazem nada;
- mover a seleção (arrastando ou com as setas) para no limite do kit (`clampMove` ganhou `minRow`/`maxRow`);
- colar na bateria descarta, com aviso, o que cair fora do kit;
- ao escolher a bateria, o grid rola até o kit;
- o servidor recusa com 422 uma nota de bateria fora do kit, com mensagem clara.

**Projetos antigos:** são migrados sem perder o ritmo.
- Projeto salvo no navegador: v2 → v3. Arquivo de texto: `versao = 1` → `2`. Arquivo sem `versao` é lido como atual.
- Cada nota vai para a tecla da mesma peça; o hi-hat aberto vira chimbal.
- Peças que caem na mesma tecla não se sobrepõem: a anterior é encurtada e as simultâneas viram uma só.
- Nomes novos no arquivo de texto: `surdo`, `tom-1`, `tom-2`, `ride`, `ataque`… Os antigos continuam valendo.

**Volume:**
- **Diagnóstico:** o bumbo terminava em 45 Hz, e alto-falante de notebook/celular praticamente não reproduz essa faixa.
  Golpes curtos também soam mais baixos que notas sustentadas de mesmo RMS.
- **Bumbo:** ganhou um "knock" de 330→110 Hz e o estalo do pedal. Acima de 150 Hz, onde caixas pequenas tocam, ficou **+5 dB**.
- **Barramento da bateria:** +6 dB no navegador (o limitador segura os picos) e +3,4 dB no servidor (que normaliza o pico do arquivo).
- **Medido na cadeia real do navegador, com um beat de bumbo, caixa e chimbal:**
  - 100% ficou **+3,3 dB** mais alto que antes e passou o piano (−15,2 contra −16,3 dBFS RMS);
  - 200% também ficou mais alto que o 200% antigo;
  - nunca passa de 0 dBFS.
- **Custo:** como o 100% agora chega perto do limitador, o ganho do 200% sobre o 100% caiu de ~5,6 para ~4,4 dB RMS.
  O teste E2E passou a exigir > 3,5 dB nesse reforço (antes > 6) e > 7 dB na atenuação do 50% (antes > 9).
  Também passou a exigir que a bateria no 100% não fique abaixo do piano.
- **Equilíbrio das peças em relação ao bumbo** (RMS dos primeiros 150 ms, iguais nos dois motores):
  - caixa ≈ −1,7 dB, tons ≈ −1 dB, chimbal ≈ −8 dB;
  - ride ≈ −9 dB, prato de ataque ≈ −5 dB.

**Verificação:**
- 124 pytest, incluindo as 8 peças: audíveis, sem estouro, terminando em silêncio, diferentes entre si, com equilíbrio, mais o 422;
- 99 `node:test`, incluindo as migrações v1/v2, os nomes das peças, o erro fora do kit e o limite do arraste;
- 42 E2E em Chrome headless, incluindo teclas desativadas, rolagem até o kit, limite das setas/arraste e o equilíbrio na cadeia real.

---

## 2026-11-19 — App "completamente bugado" depois da atualização da bateria

**Relato:** depois da atualização, o app abria mas não dava para escolher instrumento e as notas não apareciam.

**Causa (reproduzida):** cache do navegador.
- O servidor de arquivos não mandava `Cache-Control`. Sem ele, o navegador decide sozinho por quanto tempo reaproveitar cada arquivo, pela idade do arquivo.
- Depois da atualização, uns módulos vieram novos e outros antigos do cache. O `music.js` novo importava `DRUM_HIGHEST_MIDI` do `config.js` antigo.
- Resultado: `SyntaxError: The requested module '../config.js' does not provide an export named 'DRUM_HIGHEST_MIDI'`. O JS inteiro deixa de carregar e a página fica só com o HTML parado.
- Os testes não pegaram porque cada execução usa um navegador com o cache vazio.
- Reproduzi servindo a versão anterior (`eecc43e`), trocando o servidor pela nova e recarregando. Com arquivos antigos e novos misturados, deu exatamente o erro acima. Com todos antigos, o navegador rodou a versão velha inteira.

**Correção:**
- **Servidor:** `Cache-Control: no-cache` em todo o frontend. O navegador confere cada arquivo a cada abertura; sem mudança, a resposta é um 304 barato.
- **Rede de segurança no `index.html`:** se o app não iniciar, ou iniciar com outra versão (`APP_BUILD` do `config.js` diferente da esperada pelo HTML):
  - busca de novo todos os scripts, com `fetch(..., { cache: 'reload' })`, o que atualiza o cache;
  - recarrega uma única vez;
  - se ainda assim falhar, mostra um aviso com o que fazer (Ctrl+F5).
- **Verificação:** no mesmo cenário de cache misturado, a página caiu no erro, recarregou sozinha e abriu a versão nova. No cenário "tudo antigo", também abriu a nova.
- **Testes novos:**
  - pytest: o frontend sai com `no-cache` e a API não;
  - `node:test`: o `APP_BUILD` do HTML bate com o do `config.js`.

---

## 2026-11-19 — Bateria no centro do grid e som limpo (o bumbo chiava)

**Pedido:** kit da bateria centralizado e som limpo; o bumbo estava chiando.

**Kit no centro:** D4 a A4, com 14 teclas desativadas acima e 14 abaixo. Ao escolher a bateria, a tela centraliza o kit.
- Projeto salvo no navegador v3 → v4; arquivo de texto `versao = 2` → `3`.
- `migrateDrumItems(items, mapa)` separa a conversão de tecla do tratamento de sobreposições.
- **Nomes de peça** (`bumbo`…) nunca são convertidos. A forma curta `pausa` da bateria virou o bumbo.
- Avisos de conversão saem como informação (`notices`), não como erro.

**Por que chiava — três causas, medidas na cadeia real do navegador:**
1. **Estalo de ruído do bumbo:** o "clique do pedal" da versão anterior era ruído agudo, literalmente chiado a cada batida. **Removido** (o knock médio continua).
2. **Saturação:** sem o limitador, a bateria no 100% chegava a 1,8× (caixa), 2,6× (chimbal) e quase 4× (beat) acima do ponto em que o limitador suave começava a distorcer (0,7).
3. **Calibração inflada por um artefato de medição:** o `DynamicsCompressor` do Chrome atenua o som nos primeiros instantes depois de criado.
   - Nas medições num `OfflineAudioContext` com o golpe no instante 0, o chimbal saía ~10 dB mais baixo, a caixa ~7 e o bumbo ~5.
   - No app isso não acontece, porque o compressor já está rodando.
   - A calibração anterior compensou um problema que não existia (chimbal 7×, caixa 2,8×). No app real esses golpes ficavam altos demais e saturavam.

**Correção:**
- **Calibração nova das peças:** pela intensidade de curto prazo (maior RMS em 50 ms, como se ouve um golpe), medida nas vozes sem a cadeia.
  - O pico de cada peça fica limitado a 1,2× o do bumbo.
  - Abaixo do bumbo: caixa ≈ −3,5 dB, chimbal ≈ −12, tons ≈ −1, ride ≈ −10, prato ≈ −4. Iguais (±0,5 dB) no navegador e no servidor.
- **Limitador suave:** o joelho subiu de 0,7 para 0,9, acima do limiar do compressor (≈ 0,79). Quem segura os picos agora é o compressor, sem distorção; a saturação é só a última proteção. Vale para todos os instrumentos.
- **Barramento da bateria:** 1,5. O bumbo fica com 0,6 de pico na saída (era 0,43 antes da sessão de volume e 0,98, saturando, na versão anterior).
- **Medido (saturação = o que o limitador mudou no sinal):**
  - cada peça isolada: abaixo de −110 dB, ou seja, nenhuma;
  - beat de bumbo + caixa + chimbal: entre −49 e −72 dB, inaudível.
- **Testei e descartei** um compressor mais forte (limiar −4/−6 dB, razão 20): limpa a saturação, mas comprime demais e o som "bombeia".
- **Custo, dito com franqueza:** em RMS, um beat no 100% ficou ~4 dB abaixo do piano.
  A versão anterior parecia mais alta justamente porque o chimbal estava exagerado e saturado.
  O bumbo, peça a peça, está +3 dB acima do original.

**Testes:**
- E2E:
  - mede a saturação de cada peça e do beat na cadeia real (deixa de exigir "bateria acima do piano");
  - renderiza depois de 0,5 s, para não cair no artefato do compressor;
  - confere que o kit fica no meio da tela.
- pytest: equilíbrio por intensidade de curto prazo, limite de pico por peça e kit centralizado.
- `node:test`: migrações v3 → v4 e arquivo v2 → v3.

---

## 2026-11-19 — Ctrl+Z, 9 peças novas na bateria e teclas acesas só do instrumento aberto

**Pedido:**
1. Ctrl+Z para desfazer.
2. Completar a bateria: splash, china, stack, bell, octobans, rototons, cowbell, jam block e pandeirola.
3. No play, as teclas da esquerda acendiam com as notas de todos os instrumentos. Mostrar só as do instrumento aberto, sem mudar o som.

**Desfazer/refazer** (`frontend/js/core/history.js`, módulo puro):
- Guarda "fotos" da lista de notas (JSON). Ctrl+Z desfaz; Ctrl+Y ou Ctrl+Shift+Z refaz; até 200 passos.
- O registro fica em `onSequenceChanged`, por onde passa toda edição. Assim, desenhar, apagar, mover, unir, separar, colar, Limpar, Limpar tudo e Importar são desfeitos sem código específico para cada um.
- **Um arrasto = um passo:** entre `pointerdown` e `pointerup` as mudanças são agrupadas. O registro acontece depois dos handlers do grid, porque a nota é criada no `pointerup`.
- **Importar** também guarda as configurações anteriores (BPM, compasso, volumes…): o Ctrl+Z desfaz a importação inteira. As outras edições não guardam configurações, para que desfazer uma nota não volte o BPM.
- Campos de texto (BPM etc.) continuam com o Ctrl+Z nativo do navegador.

**Bateria com 17 peças** (A3 a C#5):
- As 8 antigas **não mudaram de tecla** (D4 a A4), então nenhum projeto precisou de conversão.
- As novas ficam em volta: percussão embaixo (pandeirola A3, jam block, cowbell, rototons, octobans C#4) e pratos em cima (splash A#4, china, stack, bell C#5).
- O grid fica com 9 teclas desativadas abaixo e 10 acima.
- `migrateBottomKitMidi` usava a posição na lista `DRUM_PIECES`, o que quebraria com as peças novas no começo. Passou a usar uma lista fixa de ids.
- **Síntese**, espelhada no navegador e no servidor:
  - rototons e octobans: o mesmo modelo dos tons (seno com queda de afinação), mais agudos;
  - splash, china e stack: o modelo dos pratos, com dois parâmetros novos (`scale`, que multiplica as frequências do metal, e `noiseCutoff`);
  - bell, cowbell, jam block e pandeirola: um modelo novo, `ping`, que é uma soma de senos com um envelope de golpe e ruído agudo opcional (as platinelas da pandeirola).
- **Calibração:** o mesmo método da sessão anterior (intensidade em 50 ms relativa ao bumbo, pico ≤ 1,2× o do bumbo), medida separadamente no navegador e no servidor.
  - Abaixo do bumbo: rototons e octobans −1,5 dB; china −4; splash e stack −5; cowbell −7; jam block −8; bell e pandeirola −9.
  - O E2E confere que nenhuma das 17 peças satura.

**Teclas acesas:** o destaque agendado só acende se a nota for do instrumento aberto no momento em que soa. O som não muda, e o E2E confere que o piano continua sendo agendado.
- Verificação do teste: com a correção desligada, o E2E novo falha (a tecla da nota do piano acendia na bateria).

**Testes:**
- pytest:
  - kit de 17 peças, centralização 9/10;
  - equilíbrio e pico das 9 novas;
  - exportação com as 17.
- `node:test`:
  - histórico (desfazer, refazer, limite, configurações da importação);
  - kit, faixa, nomes das peças no arquivo de texto e arrasto preso ao kit.
- E2E:
  - Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, com o arrasto desfeito num passo só e Limpar tudo desfeito;
  - teclas acesas só do instrumento aberto;
  - 17 peças na tela e no equilíbrio.

---

## 2026-11-19 — Instrumento Baixo

**Pedido:** adicionar o instrumento BAIXO.

**Decisão de alcance:** o grid vai de C3 a B5, e no tom escrito o grave dele (130 Hz) soaria como um violoncelo. O baixo **soa uma oitava abaixo do escrito**, a mesma convenção da partitura de baixo: C3 → C2 (65 Hz), até B5 → B4.
- `BASS_TRANSPOSE = -12` está nos dois sintetizadores.
- A dica de cada tecla, no modo baixo, mostra a nota real.

**Timbre (baixo elétrico dedilhado):**
- 0,6 seno + 0,4 dente-de-serra na mesma frequência, passa-baixa Butterworth em 900 Hz e envelope de corda pinçada (ataque 5 ms, decai para 55% em ~0,4 s, release 80 ms).
- O seno dá o peso. A dente-de-serra dá os harmônicos, que fazem o baixo ser ouvido em alto-falante de notebook, que não reproduz 65 Hz.

**Bug de paridade encontrado na calibração:** o baixo saía 6,7 dB mais alto no navegador que no servidor.
- Causa: a dente-de-serra da Web Audio começa em zero subindo, e a PolyBLEP do servidor (`2p − 1`) começa meio ciclo depois, com a fundamental invertida.
- Somada ao seno, a fundamental se reforçava no navegador e se cancelava em parte no servidor.
- Correção: a fase da dente-de-serra do baixo no servidor foi deslocada meio ciclo. Agora os dois ficam a 0,3 dB um do outro.
- O Lead não foi afetado: são duas dentes-de-serra, sem seno.

**Calibração:** RMS na média dos outros instrumentos melódicos (trim 0,96 no navegador e 0,93 no servidor). O teste de "intensidade parecida" agora inclui o baixo.

**Integração:**
- Baixo na lista de instrumentos (cor rosa), entre a bateria e o lofi: seletor, mixer, schema da API, `[baixo]` no arquivo de projeto e `/api/health`.
- Projetos e arquivos antigos abrem com o baixo em 100%.
- Ao escolher o baixo, a tela desce até as teclas graves.
- O mixer, agora com 5 canais, quebra para uma segunda linha em telas estreitas (até ~1500 px), sem afetar o grid.

**Teste instável corrigido (E2E):**
- Sintoma: o teste das teclas acesas falhou uma vez em duas.
- Causa: sem loop, o play para sozinho no fim, e o "clique no PLAY para pausar" do teste anterior às vezes **começava** a tocar de novo; o teste seguinte então pausava em vez de tocar.
- Correção: um auxiliar `pauseIfPlaying()`. Depois disso, 4 de 4 execuções seguidas passaram.
- Antes, um script separado confirmou que o app acende a tecla certa 15 de 15 vezes.

**Testes:**
- pytest:
  - o baixo soa C2 (65,4 Hz) para C3 escrito, pelo FFT;
  - termina em silêncio, segue a duração e tem volume parecido com os outros instrumentos.
- `node:test`:
  - seção `[baixo]` no arquivo de projeto, ida e volta;
  - arquivo e projeto antigos sem baixo abrem com o baixo em 100%.
- E2E:
  - baixo no seletor e no mixer, sem teclas desativadas;
  - nota criada em C3, com a tela nas teclas graves;
  - frequência real de 65 Hz no navegador.

---

## 2026-11-19 — Baixo de corda (modelagem física) e exportar em WAV

**Pedido:**
1. "Baixo muito sintético; quero um baixo de corda, exatamente como o instrumento de 4 cordas."
2. Manter o botão Exportar como está, mas transformá-lo num seletor com a 2ª opção "Exportar como WAV".

**Baixo por modelagem física (Karplus-Strong estendido):**
- Em vez de osciladores, uma **corda simulada**: uma linha de atraso do tamanho de um período, realimentada com perda.
- A perda é um filtro `[a, 1−2a, a]` (mais forte nos agudos) com **interpolação linear** da parte fracionária do período. Afinação medida: erro < 1 cent em toda a faixa.
- **Excitação = o dedo puxando a corda:** o formato triangular da corda deslocada, com o vértice em 22% do comprimento a partir do cavalete, mais 15% de ruído para o atrito do dedo.
- O decaimento depende da nota (T60 de 5 s no C2, mínimo 2,2 s nos agudos).
- Depois, captador/amplificador (passa-baixa de 1ª ordem em 1,4 kHz e bloqueio de DC) e "abafar com a mão" ao fim da nota (release de 0,1 s).
- **Resultado medido:** o brilho do ataque (centroide ~1,4 kHz) cai para ~240 Hz em 1 s, como uma corda real. O teste exige ataque > 3× mais brilhante que a sustentação.
- **Mesmo algoritmo, amostra por amostra, no navegador e no servidor:**
  - o navegador calcula a onda em JS (Float64, ~5 ms por nota, com cache) e toca como `AudioBuffer`;
  - o ruído do dedo vem de um gerador xorshift32 determinístico, igual nos dois lados;
  - diferença máxima medida: 6·10⁻¹¹;
  - testes de paridade (pytest e `node:test`) conferem as **mesmas amostras de referência** nos dois lados;
  - no servidor, a realimentação é vetorizada em blocos de um período (cada bloco só depende de amostras pelo menos um período atrás).
- Calibração: ≈1,39 nos dois lados (RMS na média dos instrumentos melódicos).

**Exportar com seletor:**
- O botão **Exportar MP3** continua igual.
- Uma **seta ▾** colada nele abre o menu "Exportar como MP3 / Exportar como WAV". O menu fecha ao escolher, ao clicar fora ou com Esc, e navega com ↑/↓.
- O servidor já gerava WAV, então só o frontend mudou.
- A seta empurrava os botões do cabeçalho para uma 2ª linha em 1384 px. O espaço entre grupos caiu de 12 para 8 px, e o cabeçalho voltou a uma linha (medido).

**Testes:**
- pytest: paridade da corda e o brilho que decai.
- `node:test`: paridade, a nota termina em silêncio e respeita a duração.
- E2E: menu (abre, fecha clicando fora, opções), download de um WAV válido (RIFF/WAVE), mensagem "WAV gerado" e o botão volta a "Exportar MP3".

---

## 2026-11-19 — Baixo elétrico de verdade, medido de uma gravação

**Pedido:** "Eu não quero um violão, eu quero um BAIXO BASS GUITAR". O usuário deixou nos Downloads a nota B1 de um baixo real como referência.

**Análise da gravação** (decodificada no Chrome headless, `decodeAudioData`):
- f0 = 61,94 Hz (B1, +6 cents); ataque de ~3 ms quase sem energia acima de 1 kHz (0,2%); centroide ~200 Hz.
- Sustentação longa: o nível cai só ~7 dB em 2 s.
- Harmônicos fortes só até o 5º (o 2º começa tão forte quanto a fundamental); do 7º em diante, abaixo de −30 dB.
- Inarmonicidade pequena (B ≈ 1,5·10⁻⁴).

**Por que o anterior soava como violão:** o modelo de corda (Karplus-Strong) tinha o ataque brilhante (~1,4 kHz), morria rápido demais e tocava no registro errado. O grid vai de C3 a B5; uma oitava abaixo, isso dá C2 a B4, a região de um violão. Um baixo de 4 cordas vai de E1 (41 Hz) até ~G3.

**O que mudou:**
- **Registro:** o baixo soa **duas oitavas** abaixo da tecla (`BASS_TRANSPOSE = -24`). E3 = E1 (a corda Mi solta) e B5 = B3. As 4 teclas C3 a D#3 ficam desativadas no baixo, com o mesmo mecanismo das teclas fora do kit da bateria (`playableRange`). O servidor recusa baixo abaixo de E3 com 422.
- **Timbre:** **síntese modal**. Cada harmônico é um seno com nível próprio e um envelope de duas fases (uma parte cai rápido logo após o ataque, o resto sustenta). Os parâmetros foram ajustados por **mínimos quadrados** à trajetória de cada harmônico na gravação, de 0 a 3,2 s em janelas de 50 ms.
  - Erro médio dos harmônicos 1 a 6 contra a referência: **1,0 dB**.
  - Queda de nível em 0,2/0,5/1/2/3 s: referência −1,7/−3,5/−5,4/−7,2/−8,9 dB; modelo −1,9/−3,4/−5,1/−7,3/−8,9 dB.
  - Notas mais agudas decaem mais rápido: × (f0/61,7 Hz)^0,7. Um corte suave em 1 kHz (captador) evita que as notas altas fiquem brilhantes.
- **Mesma conta no navegador e no servidor:** no Python, vetorizado; no JS, por recorrência (fasor girando e fatores de decaimento por amostra). São ~2 ms por nota típica e 20 ms para uma nota de 4 s, 10× mais rápido que o cálculo direto. Diferença máxima medida: 1,5·10⁻⁸. Os testes de paridade conferem as mesmas amostras nos dois lados.
- **Calibração:** 1,06 nos dois lados (RMS no C4 contra piano/lofi/lead).
- **Migração (o som de projetos antigos não muda):**
  - projeto salvo v4 → v5 e arquivo de texto `versao` 3 → 4;
  - notas de baixo antigas sobem uma oitava no grid e soam exatamente como antes;
  - notas que passariam do B5 ficam de fora com aviso; a importação mostra um aviso informativo.
- **Privacidade/licença:** a gravação de referência **não** foi incluída no repositório. Só os números medidos dela entram no código.

**Testes:**
- pytest: altura por autocorrelação (E3 → 41,2 Hz, B3 → 61,7 Hz, E4 → 82,4 Hz); paridade; "escuro e sustentado como a referência" (centroide < 260 Hz, queda de 5 a 10 dB em 2 s, 2º harmônico −8 a −14 dB após 2 s); 422 abaixo do E3.
- `node:test`: paridade; faixa tocável; migração de oitava (projeto v4 e arquivo v3, inclusive a nota que sai).
- E2E: 4 teclas riscadas, C3 não cria nota, E3 cria, a dica diz "soa E1" e o áudio real mede 41,2 Hz.

---

## 2026-11-20 — Tracejado entre as notas e grid que cresce sozinho

**Pedidos:**
1. "Pelo menos um tracejado horizontal pra eu saber em qual nota eu tô tocando lá no final da track."
2. "Não ponha limite de tempo. Deixe o limite na tela, mas assim que um bloco de tempo surgir, você adiciona mais um."

**Tracejado:**
- Cada linha do grid ganhou uma borda inferior **tracejada** e visível (`--line-row`, cinza a 28%). Antes era uma borda sólida quase da cor do fundo.
- A linha do **C** (início de oitava) é tracejada em azul (`--line-row-c`).
- A borda é da própria linha, então vai de ponta a ponta do grid, qualquer que seja o tamanho.

**Grid sem limite e que cresce:**
- `BARS.MAX` passou de 16 para 999 (limite técnico só para o campo).
- O campo **Compassos** continua na tela.
- `growGridToFitContent()` roda a cada edição. Se o fim da última nota ou pausa entra no último compasso, `bars = ceil(fim / compasso) + 1`, então sempre sobra um compasso vazio.
- O grid **só cresce**: diminuir é escolha do usuário.
- Desfazer e importar não mexem no tamanho, para o projeto importado voltar exatamente como foi salvo.
- O play e a exportação continuam indo até o **FIM** da música, não até o fim do grid: o compasso vazio extra não vira silêncio no MP3.

**Limites de exportação:**
- Com o grid sem teto, os 600 s (10 min) apertavam. Medi uma renderização de 30 minutos com 3600 notas: 1,5 s e ~0,9 GB de pico de memória.
- Novos limites, iguais no servidor e na pré-validação do navegador:
  - padrão e total até **1800 s**;
  - nota até 1800 s;
  - **50 000** eventos.

**Testes:**
- E2E: tracejado nas linhas comuns e na do C, de largura igual à do grid.
- E2E: uma nota no último compasso faz o grid ganhar um compasso (campo e régua atualizados), e isso se repete no compasso novo; passar de 16 funciona; Ctrl+Z desfaz as notas.
- pytest e `node:test`: limites novos (2000 s recusado com 422; a mensagem "máximo 1800 s").

---

## Resumo final

| Requisito | Onde |
|---|---|
| RF01 Seleção de instrumentos | `ui/header.js`, `audio/instruments.js`, `backend/app/audio/instruments.py` |
| RF02 Tempo e BPM em tempo real | `core/timing.js`, `core/transport.js` (`setBpm`) |
| RF03 Grid de 3 oitavas, notas curtas e arrastadas | `ui/grid.js`, `core/layout.js`, `core/sequence.js` |
| RF04 Playback no navegador | `audio/engine.js`, `audio/scheduler.js` |
| RF05 Transporte (play/pause/início/fim) | `ui/transport-controls.js`, `core/transport.js` |
| RF06 Loop e quantidade de repetições | `core/transport.js`, `core/schedule.js`, `backend/app/audio/renderer.py` |
| RF07 Exportação | `core/export.js`, `services/api.js`, `backend/app/api/routes.py` |
| RNF01 Sincronia cursor/áudio | relógio único (`AudioContext.currentTime`) + compensação de latência |
| RNF02 Sem build/dependências pesadas | Vanilla JS em ES Modules + Tailwind via CDN, zero pacotes npm |
| RNF03 MP3 limpo, sem cortes no loop | overlap-add, normalização −1 dBFS, fades de borda |

**Totais:** 171 testes pytest · 116 testes `node:test` · 48 verificações E2E em navegador real.
