# Manual de Uso — Beat Productor

O Beat Productor é um editor de beats em formato *piano roll*: você desenha notas num grid,
ouve o resultado na hora no navegador e exporta um arquivo **MP3**.

**Sumário**
1. [Como abrir o aplicativo](#1-como-abrir-o-aplicativo)
2. [Seu primeiro beat em 2 minutos](#2-seu-primeiro-beat-em-2-minutos)
3. [A tela](#3-a-tela)
4. [Criando e ouvindo notas](#4-criando-e-ouvindo-notas)
5. [Loop e exportação](#5-loop-e-exportação)
6. [Salvamento automático](#6-salvamento-automático)
7. [Atalhos de teclado](#7-atalhos-de-teclado)
8. [Problemas comuns](#8-problemas-comuns)

---

## 1. Como abrir o aplicativo

### Pré-requisitos
- **Python 3.12, 3.13 ou 3.14 (64 bits)**.
  - **No Windows com o `BeatProductor.exe` você não precisa instalar nada:** se o computador não tiver um Python dessa faixa, o lançador instala um sozinho (veja abaixo).
  - Pelo terminal, ou no Linux/macOS, instale pelo [python.org](https://www.python.org/downloads/). No Windows, marque *"Add Python to PATH"*.
  - Por que essa faixa: as versões das bibliotecas usadas (NumPy, SciPy, FastAPI…) só têm pacotes prontos para ela. Com um Python mais velho a instalação falhava com *"could not find a version that satisfies the requirement…"*.
- Chrome, Edge ou Firefox atualizado, com acesso à internet.

### Iniciar no Windows (jeito fácil)

Dê **duplo clique em `BeatProductor.exe`**, na pasta principal do projeto. Uma janela preta abre e:

1. na **primeira vez**, cria o ambiente Python e baixa as dependências (precisa de internet; 1 a 3 minutos);
   - se não houver um Python 3.12–3.14, ele **baixa o instalador oficial do python.org** e confere a integridade dele;
   - instala o Python 3.13 **só para o Beat Productor**, em `%LOCALAPPDATA%\BeatProductor\Python313`, sem pedir administrador e sem mexer no PATH nem em outros Pythons;
   - se quiser removê-lo, ele aparece em *Configurações > Aplicativos* como "Python 3.13";
   - se o `.venv` tiver sido criado antes com um Python incompatível, ele é recriado sozinho;
2. sobe o servidor numa porta livre (8000 ou a próxima disponível);
3. abre o Beat Productor no seu navegador.

**Deixe a janela aberta** enquanto usa o app. Para encerrar, feche a janela (ou aperte **Ctrl+C** nela).
Se você der duplo clique de novo com ele já aberto, apenas uma nova aba do navegador é aberta.

> O `BeatProductor.exe` precisa ficar na pasta do projeto, junto de `backend\` e `frontend\`.
> Para ter um atalho na Área de Trabalho: botão direito no exe → **Enviar para → Área de trabalho (criar atalho)**.

### Iniciar pelo terminal

**Windows** — abra o PowerShell na pasta do projeto e rode:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run.ps1
```

**Linux / macOS / Git Bash:**

```bash
scripts/run.sh
```

Na primeira vez o script cria o ambiente Python (`.venv`) e instala as dependências (cerca de 1 minuto).
Quando aparecer *"Beat Productor rodando em http://127.0.0.1:8000"*, abra esse endereço no navegador.

- Outra porta: `scripts\run.ps1 -Port 9000` (Windows) ou `scripts/run.sh 9000`.
- Encerrar: **Ctrl+C** no terminal.

> Abrir o `index.html` direto pelo explorador de arquivos (`file://`) **não funciona**: o navegador
> bloqueia módulos JavaScript fora de um servidor, e a exportação precisa do backend — use sempre o script.

---

## 2. Seu primeiro beat em 2 minutos

1. Em **Instrumento**, escolha **Bateria**. O grid rola até o kit: as 8 teclas de baixo mostram *Bumbo*, *Caixa*,
   *Chimbal*… e as outras ficam riscadas (desativadas).
2. Na linha **Bumbo** (C3, a última), clique na 1ª célula de cada compasso e na 3ª batida.
3. Na linha **Caixa** logo acima (C#3), clique na 2ª e na 4ª batida de cada compasso.
4. Na linha **Chimbal** (D3), clique em células alternadas para um ritmo constante. Um **Prato de ataque** (G3) na
   1ª célula marca o começo.
5. Troque para **Piano Acústico** e **arraste** na horizontal para criar notas longas (um acorde: C4, E4, G4).
6. Aperte **▶ PLAY** (ou **Espaço**). Ajuste o **BPM** enquanto toca, se quiser.
7. Marque **Loop**, digite **4** no campo ao lado e clique em **Exportar MP3**. O arquivo é baixado em seguida.

---

## 3. A tela

```
┌──────────────────────────────── CABEÇALHO ─────────────────────────────────┐
│ Instrumento│Compasso│BPM│Compassos│Célula│☐ Loop [n]│ Importar│Exportar… │
├──────────────────────────── BARRA DE EDIÇÃO ───────────────────────────────┤
│ ✎/⬚ │UNIR│SEPARAR│🗑│Limpar│Limpar tudo│     ● Piano ━━○ 100%  ● Bateria …│
├──────┬──────────────── régua (compassos) ──────────────────────────────────┤
│ B5   │                                                                     │
│ A#5  │               GRID DE MONTAGEM (piano roll)                         │
│ …    │        linhas = notas · colunas = tempo · │ = cursor                │
│ C3   │                                                                     │
├──────┴──────────────────────── RODAPÉ ─────────────────────────────────────┤
│ 1.1 | 0:00.0          ⏮ INÍCIO   ▶ PLAY   FIM ⏭          Piano: 3 nota(s)   │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Cabeçalho

| Controle | O que faz |
|---|---|
| **Instrumento** | Instrumento das novas notas: Piano Acústico, Bateria, Lofi Synth ou Lead Synth. A faixa colorida à esquerda do seletor é a cor das notas desse instrumento. As notas dos outros instrumentos continuam no grid, esmaecidas. |
| **Compasso** | Fórmula de compasso da partitura: `2/4`, `3/4`, `4/4` (padrão), `5/4`, `3/8`, `5/8`, `6/8`, `7/8`, `9/8`, `12/8`. Define as barras de compasso, os tempos da régua e a posição *compasso.tempo*. Trocar **não move** as notas. Em 3/8, 5/8, 7/8 e 9/8 a célula de semínima e a de tercina de colcheia não cabem no compasso e ficam desabilitadas (o app muda para colcheia e avisa). |
| **BPM (♩)** | Andamento em **semínimas por minuto**, de 40 a 240 (padrão 120) — o mesmo número da indicação de metrônomo "♩ = 120" da partitura. Muda em tempo real. Veja 4.7 para compassos 6/8. |
| **Compassos** | Tamanho da sequência (1 a 16; padrão 4). Diminuir não apaga notas: elas reaparecem ao aumentar de novo. |
| **Célula** | A **figura** de cada célula do grid, com o nome da partitura: `1/4` semínima ♩, `1/8` colcheia ♪, `1/8 tercina`, `1/16` semicolcheia (padrão), `1/16 tercina`. Um clique = uma nota dessa figura. Trocar a célula **não altera** as notas já criadas. |
| **Loop** + número | Liga a repetição contínua da reprodução. O número ao lado (1 a 32) é a quantidade de repetições no arquivo exportado. |
| **Importar** / **Exportar projeto** | Abre / salva o projeto inteiro num arquivo de texto (ver seção 6). |
| **Exportar MP3** | Gera o arquivo de áudio no servidor e baixa no navegador (ver seção 5). |

### 3.2 Barra de edição e mixer

| Controle | O que faz |
|---|---|
| **✎ Desenhar / ⬚ Selecionar** | Ferramenta do grid (atalhos **D** e **S**). |
| **UNIR** | Junta as notas selecionadas da mesma linha numa só (ver 4.1). Mostra quantas estão selecionadas. |
| **SEPARAR** | O inverso: corta as notas selecionadas em células do grid (ver 4.1). Mostra quantas seriam cortadas. |
| **🗑 (lixeira)** | Apaga as notas selecionadas. Só fica ativa quando há seleção (atalho **Delete**). |
| **Limpar** | Apaga as notas e pausas do instrumento atual (pede confirmação). |
| **Limpar tudo** | Apaga as notas e pausas de **todos** os instrumentos de uma vez (pede confirmação). |
| **Mixer** | Um volume por instrumento, de 0% (mudo) a 200%. **100% já vem equilibrado**: os instrumentos (e cada peça da bateria) foram calibrados para soar com intensidade parecida, e a bateria no 100% não fica abaixo do piano. A escala é perceptiva: **50% ≈ metade do volume percebido (−12 dB)**, **200% ≈ o dobro (+12 dB)**. Vale ao vivo e no MP3 exportado. **Duplo clique** no slider volta a 100%. A saída tem um limitador: mesmo com tudo no máximo, o som não distorce. |

### 3.3 Grid de montagem

- Cada **linha** é uma nota: 3 oitavas, de **B5** (topo) a **C3** (base). A tecla à esquerda mostra o nome.
- Linhas finas = células; linhas médias = tempos do compasso; linhas fortes = barras de compasso.
- Linhas horizontais destacadas marcam o início de cada oitava (nota **C**).
- A **régua** no topo numera os compassos; clicar nela move o cursor.

### 3.4 Rodapé

- **⏮ INÍCIO** — leva o cursor ao começo (atalho **Home**).
- **▶ PLAY / ⏸ PAUSE** — toca ou pausa a partir da posição do cursor (atalho **Espaço**).
- **FIM ⏭** — leva o cursor ao **fim da música**, o fim da última nota ou pausa (atalho **End**). Dar PLAY no fim recomeça do início.
- À esquerda: posição em **compasso.tempo** e o tempo decorrido. À direita: notas e pausas do instrumento atual e a duração da música.

---

## 4. Criando e ouvindo notas

O grid tem duas ferramentas, escolhidas na barra de edição: **✎ Desenhar** (padrão) e **⬚ Selecionar**.

| Ação | Ferramenta | Resultado |
|---|---|---|
| **Clique** numa célula vazia | Desenhar | Nota curta (toque solto) de 1 célula |
| **Clique e arraste** na horizontal | Desenhar | Nota longa (toque contínuo). Funciona arrastando para a direita ou para a esquerda. |
| **Clique** numa nota/pausa | Desenhar | Apaga |
| **Arraste** um retângulo | Selecionar (ou **Shift+arrastar** em qualquer uma) | Seleciona as notas/pausas que ele toca (contorno amarelo) |
| **Clique** numa nota/pausa | Selecionar | Seleciona só ela (**Shift+clique** adiciona/remove da seleção) |
| **Arraste** uma nota selecionada | Selecionar | **Move** a seleção inteira: para cima/baixo muda a altura, para os lados muda o tempo (de célula em célula) |
| **Clique** no vazio | Selecionar | Limpa a seleção |
| **Botão direito** numa célula vazia | qualquer | Cria uma **pausa** (bloco branco) de 1 célula |
| **Botão direito** numa nota/pausa | qualquer | Apaga |
| **Clique na régua** (topo) | qualquer | Move o cursor para aquele ponto (inclusive depois do fim da música, para colar ali) |

Se um novo bloco se sobrepõe a outro **do mesmo instrumento e na mesma linha**, o novo substitui o antigo.
Só os blocos do instrumento selecionado podem ser editados ou selecionados.

### 4.1 Unir notas (tamanhos de partitura)

Como o grid tem uma célula mínima, notas de tamanhos variados (semínima, mínima, semibreve…) são feitas
**unindo células**, como uma ligadura na partitura:

1. Na ferramenta **Selecionar**, arraste um retângulo sobre as notas que quer juntar.
2. Clique em **UNIR** no cabeçalho (ou aperte **U**). O botão mostra quantos blocos estão selecionados e só
   fica ativo quando há algo para unir.

Regras:
- Une-se **por linha**: as notas selecionadas da mesma linha viram **uma** nota, do início da primeira ao fim da
  última (se houver espaço vazio entre elas, ele passa a fazer parte da nota). Linhas diferentes nunca se misturam.
- Pausas também se unem entre si, formando pausas longas. Nota e pausa não se unem.
- Depois de unir, o resultado continua selecionado (dá para apertar **Delete** para apagar, por exemplo).

### 4.2 Pausas e o FIM da música

O vazio já é silêncio, mas uma **pausa explícita** (bloco branco, criado com o **botão direito** numa célula vazia)
serve para marcar **até onde a música vai**:

- O **FIM da música** é o fim do último bloco do grid, **nota ou pausa**. Ele aparece como uma **linha amarela
  tracejada** com a etiqueta **FIM** na régua.
- **Sem loop**, o PLAY para no FIM. **Com loop**, recomeça do início ao chegar no FIM.
- Para ter silêncio antes de repetir, por exemplo uma pausa até o fim do compasso, coloque uma pausa ali.
  Para "mais um tempo de pausa", estenda a pausa (ou una várias pausas).
- O botão **FIM ⏭** e a tecla **End** levam o cursor até esse ponto, e a exportação usa o mesmo FIM em cada repetição.
- Pausas não fazem som: a linha em que você as coloca é só onde elas aparecem.

### 4.3 Mover, copiar, colar e apagar a seleção

Com notas selecionadas:

| Ação | Como |
|---|---|
| **Mover** | Arraste uma das notas selecionadas, ou use as **setas**: **↑ ↓** sobe/desce um semitom (**Shift+↑↓** = uma oitava); **← →** anda uma célula. Nada sai do grid. |
| **Copiar / recortar** | **Ctrl+C** / **Ctrl+X** |
| **Colar** | Posicione o cursor (clique na régua) e aperte **Ctrl+V**. O trecho é colado **no cursor**, no **instrumento atual** — dá para copiar uma melodia do piano e colar no lead. O cursor avança para o fim do trecho colado, então **Ctrl+V de novo cola logo em seguida** (ótimo para repetir um compasso). O que foi colado fica selecionado. |
| **Selecionar tudo** | **Ctrl+A** (todas as notas do instrumento atual) |
| **Apagar** | **🗑**, **Delete** ou **Backspace** |
| **Separar** | **SEPARAR** ou **Shift+U**: corta cada nota selecionada nas divisas das células (o tamanho da célula atual). Para cortar em pedaços maiores, escolha uma célula maior antes. |

### 4.4 Ouvindo enquanto edita

- **Clique numa tecla** (coluna da esquerda) para ouvir aquela nota no instrumento selecionado.
- Ao **criar uma nota** com a reprodução parada, ela toca uma vez (pré-escuta).
- Durante o **PLAY**, as teclas acendem quando suas notas soam e a tela rola acompanhando o cursor.
- O primeiro clique/PLAY libera o áudio (exigência dos navegadores). Se não ouvir nada, confira o volume do sistema.

### 4.5 Os instrumentos

| Instrumento | Timbre | Duração da nota |
|---|---|---|
| **Piano Acústico** | Percussivo, decai naturalmente (mais rápido nos agudos) | Soltar antes encurta; notas longas deixam o som decair |
| **Bateria** | 8 peças: bumbo, caixa, chimbal, surdo, 2 tons, ride e prato de ataque (ver 4.6) | Ignorada (som *one-shot*) |
| **Lofi Synth** | Abafado e quente, com leve vibrato | Sustenta enquanto durar a nota |
| **Lead Synth** | Brilhante (dente-de-serra), para melodias | Sustenta enquanto durar a nota |

### 4.6 Bateria

Com **Bateria** selecionada, só as **8 teclas do kit** (C3 a G3, embaixo do grid) ficam ativas. Cada uma é uma peça:

| Tecla | Peça | Som |
|---|---|---|
| G3  | **Prato de ataque** | Prato longo e brilhante, para marcar começos de frase |
| F#3 | **Ride** | Prato de condução, metálico e mais contido |
| F3  | **Tom 1** | Tom agudo |
| E3  | **Tom 2** | Tom médio |
| D#3 | **Surdo** | Tom grave |
| D3  | **Chimbal** | Chimbal fechado, curto |
| C#3 | **Caixa** | |
| C3  | **Bumbo** | Grave com "knock" e estalo do pedal, audível até em alto-falante de notebook |

- As outras 28 teclas ficam **riscadas**: não tocam, não recebem notas nem pausas, e a seleção não pode ser
  arrastada (nem movida com as setas) para fora do kit. Ao colar na bateria notas copiadas de outras alturas, as
  que caem fora do kit ficam de fora (o app avisa).
- Os outros instrumentos continuam com as 3 oitavas inteiras.
- **Projetos antigos** (da bateria de 4 peças repetidas em todas as teclas) são convertidos sozinhos, tanto o
  salvo no navegador quanto um arquivo `versao = 1` importado: cada nota vai para a tecla da mesma peça no kit
  novo (o antigo *hi-hat aberto* vira *chimbal*).

### 4.7 Copiando de uma partitura (BPM, compasso e figuras)

O BPM do app conta **semínimas por minuto**, exatamente como a indicação "♩ = 90" da partitura. A 60 BPM, uma
semínima dura 1 segundo. Para a música soar no andamento certo:

1. Em **Compasso**, use a fórmula da partitura (3/4, 6/8…). Isso alinha as barras de compasso.
2. Em **BPM (♩)**, digite o número do metrônomo da partitura.
   - Em **6/8** ou **12/8** a partitura costuma indicar "♩. = N" (semínima pontuada). Nesse caso, use
     **BPM = N × 1,5** (ex.: ♩. = 60 → BPM 90). Se indicar "♪ = N" (colcheia), use **N ÷ 2**.
3. Em **Célula**, escolha a **menor figura** da música e desenhe cada nota com o número de células da sua figura:

| Figura | Com Célula = 1/16 | Com Célula = 1/8 |
|---|---|---|
| Semibreve 𝅝 | 16 células | 8 células |
| Mínima 𝅗𝅥 | 8 células | 4 células |
| Semínima ♩ | 4 células | 2 células |
| Colcheia ♪ | 2 células | 1 célula |
| Semicolcheia 𝅘𝅥𝅯 | 1 célula | — |

> **Atenção (mudança desta versão):** antes, a divisão "1/4" significava *4 células por batida* (semicolcheias),
> então desenhar uma semínima da partitura em 1 célula deixava a música **4× mais rápida**. Agora cada opção tem o
> nome da figura da partitura. Projetos antigos são convertidos automaticamente (a célula continua do mesmo tamanho).

Para músicas longas, digitar no arquivo de projeto (seção 6) costuma ser mais rápido que desenhar.

---

## 5. Loop e exportação

### 5.1 Loop na reprodução
Com **Loop** marcado, o PLAY recomeça do início toda vez que chega ao **FIM da música** (fim da última nota ou
pausa), indefinidamente, até você pausar. Sem loop, a reprodução para no FIM e as últimas notas terminam de soar
naturalmente. Para deixar silêncio antes de repetir, use pausas (seção 4.2).

### 5.2 Exportar MP3
1. (Opcional) Marque **Loop** e defina a **quantidade de repetições** (1 a 32).
2. Clique em **Exportar MP3**. O botão mostra *"Gerando…"* enquanto o servidor sintetiza o áudio.
3. O navegador baixa um arquivo `beat-productor-AAAAMMDD-HHMMSS.mp3` (MP3 192 kbps, 44,1 kHz).

O que entra no arquivo:
- Uma passada vai do início até o **FIM da música** (fim da última nota ou pausa), exatamente como no PLAY.
- **Sem loop:** uma passada. **Com loop:** a passada repetida *n* vezes.
- As notas que passam do fim de uma repetição continuam soando sobre o início da próxima — **sem cortes** nas emendas.
- Depois da última repetição, a cauda das notas (release) é preservada por até 2 s.
- O volume é normalizado automaticamente para não distorcer (pico em −1 dBFS).

Limites: o arquivo final pode ter até **10 minutos** (600 s). Se passar disso, o app avisa antes de exportar —
reduza os loops ou os compassos, ou aumente o BPM. Uma sequência sem notas (só pausas ou vazia) não é exportada.
O volume de cada instrumento no **mixer** vale também no MP3.

---

## 6. Salvamento automático e arquivo de projeto

### 6.1 Salvamento automático
Tudo o que você faz (notas, instrumento, compasso, célula, BPM, compassos, loop, mixer) é salvo automaticamente
**neste navegador**. Ao reabrir a página, o projeto volta como estava (*"Projeto anterior restaurado"*).

- O salvamento é por navegador/computador — não vai para o servidor.
- Em janela anônima, o projeto é esquecido ao fechar a janela.
- Para começar do zero: **Limpar tudo**.

### 6.2 Exportar e importar o projeto (arquivo de texto)

**Exportar projeto** baixa um arquivo `.txt` com **tudo**: o cabeçalho, o mixer e cada nota/pausa.
**Importar** abre esse arquivo e deixa o app **exatamente** como estava (mesmas posições, durações,
configurações e volumes). O arquivo é texto simples: dá para abrir no Bloco de Notas, guardar, mandar para
alguém, ou **escrever uma música inteira à mão** e importar, sem desenhar nada no grid.

```ini
# Linhas que começam com # são comentários.

[projeto]
versao      = 2
bpm         = 90       # semínimas (♩) por minuto
compasso    = 3/4
compassos   = 8
divisao     = 1/8      # figura de cada célula do grid
loop        = sim
repeticoes  = 4        # repetições do MP3 quando loop = sim
instrumento = piano    # instrumento selecionado ao abrir

[volume]               # mixer, em % (100 = equilibrado)
piano   = 100
bateria = 80
lofi    = 100
lead    = 100

[piano]
# posição   nota  duração
1.1         C4    1
1.2         E4    1/2
1.2+1/2     G4    1/2
1.3         C5    1
2.1         C4    3       pausa

[bateria]
1.1         ataque  1/2
1.1         bumbo   1/2
1.2         caixa   1/2
1.3         chimbal 1/4
3.3         surdo   1/4
```

Cada nota é uma linha **`posição  nota  duração  [pausa]`**, separadas por espaços:

| Coluna | Formato | Exemplos |
|---|---|---|
| **posição** | `compasso.tempo`, com fração opcional do tempo depois de `+` | `1.1` (início) · `2.3` (3º tempo do 2º compasso) · `1.2+1/2` (meio do 2º tempo) |
| **nota** | Nome científico, com `#` ou `b` | `C4` (dó central) · `F#3` · `Bb4`. Faixa: C3 a B5. Na **bateria**, só C3 a G3, ou o nome da peça: `bumbo`, `caixa`, `chimbal`, `surdo`, `tom-2`, `tom-1`, `ride`, `ataque`. |
| **duração** | Em **tempos** do compasso: inteiro, fração, misto ou decimal | `1` · `2` · `1/2` · `1+1/2` · `1.5` · `1/3` (tercina) |
| **pausa** | Opcional, no fim | Torna a linha uma pausa (bloco branco). Forma curta: `2.1  pausa  3`. |

- O **tempo** é a figura de baixo da fórmula de compasso: semínima em x/4; **colcheia** em x/8 (3/8, 6/8, 9/8…).
- Em 3/8, 5/8, 7/8 e 9/8 o campo `divisao` não pode ser `1/4` nem `1/8T` (não cabem no compasso).
  Em 4/4: `1` = semínima, `2` = mínima, `4` = semibreve, `1/2` = colcheia, `1/4` = semicolcheia.
- A menor fração possível é 1/12 de semínima (o grid é exato até a sextina).
- Seções e campos podem vir em qualquer ordem e com maiúsculas/acentos (`[Projeto]`, `Divisão`). Campos que
  faltarem ficam com o valor padrão; instrumentos sem notas podem ser omitidos.
- Se houver erro, **nada é importado** e o app mostra a linha e o motivo, por exemplo
  *"linha 14: tempo 5 inválido (o compasso 4/4 tem 4 tempos)"*.
- Importar **substitui** o projeto atual (o app pede confirmação).

---

## 7. Atalhos de teclado

| Tecla | Ação |
|---|---|
| **Espaço** | Play / Pause |
| **Home** | Início |
| **End** | Fim da música (fim da última nota/pausa) |
| **D** | Ferramenta Desenhar |
| **S** | Ferramenta Selecionar |
| **U** | Unir a seleção |
| **Shift+U** | Separar a seleção |
| **Delete** / **Backspace** | Apagar a seleção |
| **Esc** | Limpar a seleção |
| **↑ / ↓** | Mover a seleção um semitom (**Shift**: uma oitava) |
| **← / →** | Mover a seleção uma célula |
| **Ctrl+C** / **Ctrl+X** | Copiar / recortar a seleção |
| **Ctrl+V** | Colar no cursor (no instrumento atual) |
| **Ctrl+A** | Selecionar todas as notas do instrumento atual |

Os atalhos ficam desativados enquanto você digita num campo (BPM, Compassos, Loops).

---

## 8. Problemas comuns

| Sintoma | Solução |
|---|---|
| *"could not find a version that satisfies the requirement…"* ao instalar | O Python usado está fora da faixa 3.12–3.14. Use o `BeatProductor.exe`, que resolve sozinho. Pelo terminal, instale um Python 3.12–3.14; os scripts recriam o `.venv` automaticamente. |
| O exe diz que a instalação automática do Python falhou | A mensagem mostra o arquivo de log. Sem internet, conecte e abra de novo. Senão, instale o Python 3.13 (64 bits) pelo link mostrado e abra o exe de novo. Para forçar o Python próprio do app, use `BeatProductor.exe --install-python`. |
| A janela do exe mostra um erro e fica parada | Leia a mensagem (ela diz o que fazer) e aperte Enter para fechar. |
| O Windows/antivírus avisa sobre o exe | O lançador é compilado localmente e não tem assinatura digital. Dá para recompilá-lo a partir do código em `launcher\` com `launcher\build.ps1`, ou usar `scripts\run.ps1` no lugar. |
| `python` não é reconhecido (terminal) | Use o `BeatProductor.exe`, ou instale o Python 3.12–3.14 marcando *"Add Python to PATH"* e abra um novo terminal. |
| "A execução de scripts foi desabilitada" | Use exatamente `powershell -ExecutionPolicy Bypass -File scripts\run.ps1`. |
| Porta 8000 em uso | Rode com outra porta (`scripts\run.ps1 -Port 9000`) e abra `http://127.0.0.1:9000`. |
| Não sai som | Clique em PLAY ou numa tecla (o navegador só libera o áudio após um clique) e confira o volume. Se aparecer "Áudio indisponível", use Chrome, Edge ou Firefox atualizados. |
| "O áudio foi interrompido pelo sistema" | O sistema suspendeu o áudio (troca de fone/caixa, economia de energia). Aperte PLAY de novo. |
| Som falha com a aba em segundo plano | O navegador reduz os timers de abas ocultas; mantenha a aba visível durante a reprodução. |
| "Servidor indisponível" ao exportar | O terminal com o `run.ps1`/`run.sh` foi fechado. Inicie-o de novo e recarregue a página. |
| "API de exportação não encontrada" | A página foi aberta por outro servidor (ou `file://`). Abra pelo endereço mostrado pelo script. |
| "O áudio teria N s (máximo 600 s)" | Reduza loops ou compassos, ou aumente o BPM. |
| Página em branco ou sem estilo | Verifique a conexão com a internet (o Tailwind é carregado via CDN) e se abriu por `http://`, não `file://`. |
| BPM volta para outro valor | Valores fora da faixa 40–240 são corrigidos automaticamente ao sair do campo. |
| A música copiada da partitura ficou rápida/lenta demais | Confira a **Célula** e o **BPM (♩)** — veja a seção 4.7. Em 6/8, a partitura costuma indicar ♩. (use BPM × 1,5). |
| Um instrumento está alto/baixo demais | Ajuste o **mixer** na barra de edição (duplo clique volta a 100%). |
| "Arquivo inválido — linha N: …" ao importar | Corrija a linha indicada no arquivo de texto (o formato está na seção 6.2) e importe de novo. Nada foi alterado no projeto. |
| Ctrl+V colou no lugar errado | O trecho é colado **no cursor**: clique na régua onde quer colar antes de apertar Ctrl+V. |
