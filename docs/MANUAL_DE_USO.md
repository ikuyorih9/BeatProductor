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
- **Python 3.10 ou mais novo** ([python.org](https://www.python.org/downloads/)) — no Windows, marque *"Add Python to PATH"* na instalação.
- Chrome, Edge ou Firefox atualizado, com acesso à internet.

### Iniciar no Windows (jeito fácil)

Dê **duplo clique em `BeatProductor.exe`**, na pasta principal do projeto. Uma janela preta abre e:

1. na **primeira vez**, cria o ambiente Python e baixa as dependências (precisa de internet; 1 a 3 minutos);
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

1. Em **Instrumento**, escolha **Bateria**. As teclas à esquerda passam a mostrar *Bumbo*, *Caixa*, *Hi-Hat*…
2. Na linha **Bumbo** mais de baixo (C3), clique na 1ª célula de cada compasso e na 3ª batida.
3. Na linha **Caixa** logo acima (C#3), clique na 2ª e na 4ª batida de cada compasso.
4. Na linha **Hi-Hat fechado** (D3), clique em células alternadas para um ritmo constante.
5. Troque para **Piano Acústico** e **arraste** na horizontal para criar notas longas (um acorde: C4, E4, G4).
6. Aperte **▶ PLAY** (ou **Espaço**). Ajuste o **BPM** enquanto toca, se quiser.
7. Marque **Loop**, digite **4** no campo ao lado e clique em **Exportar MP3**. O arquivo é baixado em seguida.

---

## 3. A tela

```
┌──────────────────────────────── CABEÇALHO ─────────────────────────────────┐
│ Instrumento│Divisão│BPM│Compassos│☐ Loop [n]│✎/⬚ UNIR│ Limpar│Exportar MP3│
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
| **Divisão** | Quantas células cada batida tem: `1/2` (2 células), `1/4` (4 células — padrão), `1/6` (6 células, para tercinas/swing). Trocar a divisão **não altera** as notas já criadas. |
| **BPM** | Andamento, de 40 a 240 (padrão 120). Muda em tempo real, inclusive durante a reprodução. A largura das células acompanha o BPM. |
| **Compassos** | Tamanho da sequência (1 a 16 compassos de 4 batidas; padrão 4). Diminuir não apaga notas: elas reaparecem ao aumentar de novo. |
| **Loop** + número | Liga a repetição contínua da reprodução. O número ao lado (1 a 32) é a quantidade de repetições no arquivo exportado. |
| **Edição** | Ferramenta do grid — **✎ Desenhar** ou **⬚ Selecionar** — e o botão **UNIR**, que junta as notas selecionadas da mesma linha (ver 4.1). |
| **Limpar** | Apaga as notas e pausas do instrumento selecionado (pede confirmação). |
| **Exportar MP3** | Gera o arquivo de áudio no servidor e baixa no navegador (ver seção 5). |

### 3.2 Grid de montagem

- Cada **linha** é uma nota: 3 oitavas, de **B5** (topo) a **C3** (base). A tecla à esquerda mostra o nome.
- Linhas finas = células; linhas médias = batidas; linhas fortes = compassos.
- Linhas horizontais destacadas marcam o início de cada oitava (nota **C**).
- A **régua** no topo numera os compassos; clicar nela move o cursor.

### 3.3 Rodapé

- **⏮ INÍCIO** — leva o cursor ao começo (atalho **Home**).
- **▶ PLAY / ⏸ PAUSE** — toca ou pausa a partir da posição do cursor (atalho **Espaço**).
- **FIM ⏭** — leva o cursor ao **fim da música**, o fim da última nota ou pausa (atalho **End**). Dar PLAY no fim recomeça do início.
- À esquerda: posição em **compasso.batida** e o tempo decorrido. À direita: notas e pausas do instrumento atual e a duração da música.

---

## 4. Criando e ouvindo notas

O grid tem duas ferramentas, escolhidas em **Edição** no cabeçalho: **✎ Desenhar** (padrão) e **⬚ Selecionar**.

| Ação | Ferramenta | Resultado |
|---|---|---|
| **Clique** numa célula vazia | Desenhar | Nota curta (toque solto) de 1 célula |
| **Clique e arraste** na horizontal | Desenhar | Nota longa (toque contínuo). Funciona arrastando para a direita ou para a esquerda. |
| **Clique** numa nota/pausa | Desenhar | Apaga |
| **Arraste** um retângulo | Selecionar (ou **Shift+arrastar** em qualquer uma) | Seleciona as notas/pausas que ele toca (contorno amarelo) |
| **Clique** numa nota/pausa | Selecionar | Seleciona só ela (**Shift+clique** adiciona/remove da seleção) |
| **Clique** no vazio | Selecionar | Limpa a seleção |
| **Botão direito** numa célula vazia | qualquer | Cria uma **pausa** (bloco branco) de 1 célula |
| **Botão direito** numa nota/pausa | qualquer | Apaga |
| **Clique na régua** (topo) | qualquer | Move o cursor para aquele ponto |

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

### 4.3 Ouvindo enquanto edita

- **Clique numa tecla** (coluna da esquerda) para ouvir aquela nota no instrumento selecionado.
- Ao **criar uma nota** com a reprodução parada, ela toca uma vez (pré-escuta).
- Durante o **PLAY**, as teclas acendem quando suas notas soam e a tela rola acompanhando o cursor.
- O primeiro clique/PLAY libera o áudio (exigência dos navegadores). Se não ouvir nada, confira o volume do sistema.

### 4.4 Os instrumentos

| Instrumento | Timbre | Duração da nota |
|---|---|---|
| **Piano Acústico** | Percussivo, decai naturalmente (mais rápido nos agudos) | Soltar antes encurta; notas longas deixam o som decair |
| **Bateria** | Bumbo, caixa e hi-hats (ver 4.5) | Ignorada (som *one-shot*) |
| **Lofi Synth** | Abafado e quente, com leve vibrato | Sustenta enquanto durar a nota |
| **Lead Synth** | Brilhante (dente-de-serra), para melodias | Sustenta enquanto durar a nota |

### 4.5 Bateria

Com **Bateria** selecionada, as teclas mostram a peça tocada em cada linha (o padrão se repete a cada 4 notas):

| Nota | Peça |
|---|---|
| C, E, G#  | Bumbo |
| C#, F, A  | Caixa |
| D, F#, A# | Hi-Hat fechado |
| D#, G, B  | Hi-Hat aberto |

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

---

## 6. Salvamento automático

Tudo o que você faz (notas, instrumento, divisão, BPM, compassos, loop) é salvo automaticamente **neste navegador**.
Ao reabrir a página, o projeto volta como estava e aparece a mensagem *"Projeto anterior restaurado"*.

- O salvamento é por navegador/computador — não vai para o servidor.
- Em janela anônima, o projeto é esquecido ao fechar a janela.
- Para começar do zero: use **Limpar** em cada instrumento.

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
| **Delete** / **Backspace** | Apagar a seleção |
| **Esc** | Limpar a seleção |

Os atalhos ficam desativados enquanto você digita num campo (BPM, Compassos, Loops).

---

## 8. Problemas comuns

| Sintoma | Solução |
|---|---|
| O exe diz "Python 3.10 ou mais novo não foi encontrado" | Instale o Python pelo link mostrado, marcando *"Add Python to PATH"*, e abra o exe de novo. |
| A janela do exe mostra um erro e fica parada | Leia a mensagem (ela diz o que fazer) e aperte Enter para fechar. |
| O Windows/antivírus avisa sobre o exe | O lançador é compilado localmente e não tem assinatura digital. Dá para recompilá-lo a partir do código em `launcher\` com `launcher\build.ps1`, ou usar `scripts\run.ps1` no lugar. |
| `python` não é reconhecido | Instale o Python 3.10+ marcando *"Add Python to PATH"* e abra um novo terminal. |
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
