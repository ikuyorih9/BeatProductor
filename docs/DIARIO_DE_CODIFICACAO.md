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

**Totais:** 100 testes pytest · 90 testes `node:test` · 41 verificações E2E em navegador real.
