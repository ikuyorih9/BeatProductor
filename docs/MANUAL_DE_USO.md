# Manual de Uso — Beat Productor

O Beat Productor é um editor de beats em formato *piano roll*: você desenha notas num grid,
ouve o resultado no navegador e exporta um arquivo de áudio.

> Este manual é atualizado a cada fase do desenvolvimento.

---

## 1. Como abrir o aplicativo

### Pré-requisitos
- **Python 3.10 ou mais novo** ([python.org](https://www.python.org/downloads/)) — no Windows, marque *"Add Python to PATH"* na instalação.
- Chrome, Edge ou Firefox atualizado, com acesso à internet.

### Iniciar

**Windows** — abra o PowerShell na pasta do projeto e rode:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run.ps1
```

**Linux / macOS / Git Bash:**

```bash
scripts/run.sh
```

Na primeira vez o script cria o ambiente Python (`.venv`) e instala as dependências (leva cerca de 1 minuto).
Quando aparecer *"Beat Productor rodando em http://127.0.0.1:8000"*, abra esse endereço no navegador.

- Outra porta: `scripts\run.ps1 -Port 9000` (Windows) ou `scripts/run.sh 9000`.
- Encerrar: **Ctrl+C** no terminal.

> Abrir o `index.html` direto pelo explorador de arquivos (`file://`) **não funciona**: o navegador
> bloqueia módulos JavaScript fora de um servidor — use sempre o script.

---

## 2. A tela

```
┌──────────────────────────── CABEÇALHO ─────────────────────────────┐
│ Instrumento │ Divisão │ BPM │ Compassos │ ☐ Loop [n] │ Limpar │ Exportar MP3 │
├──────┬─────────────── régua (compassos) ───────────────────────────┤
│ B5   │                                                             │
│ A#5  │            GRID DE MONTAGEM (piano roll)                    │
│ …    │     linhas = notas · colunas = tempo · │ = cursor           │
│ C3   │                                                             │
├──────┴────────────────────── RODAPÉ ───────────────────────────────┤
│ 1.1 | 0:00.0        ⏮ INÍCIO   ▶ PLAY   FIM ⏭        Piano: 3 nota(s) │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 Cabeçalho

| Controle | O que faz |
|---|---|
| **Instrumento** | Instrumento das novas notas: Piano Acústico, Bateria, Lofi Synth ou Lead Synth. As notas de outros instrumentos continuam no grid, esmaecidas. |
| **Divisão** | Quantas células cada batida tem: `1/2` (2 células), `1/4` (4 células — padrão), `1/6` (6 células, para tercinas/swing). Trocar a divisão **não altera** as notas já criadas. |
| **BPM** | Andamento, de 40 a 240 (padrão 120). Muda em tempo real, inclusive durante a reprodução. A largura das células acompanha o BPM. |
| **Compassos** | Tamanho da sequência (1 a 16 compassos de 4 batidas; padrão 4). Diminuir não apaga notas: elas reaparecem ao aumentar de novo. |
| **Loop** + número | Liga a repetição contínua da reprodução. O número ao lado (1 a 32) é a quantidade de repetições no arquivo exportado. |
| **Limpar** | Apaga as notas do instrumento selecionado (pede confirmação). |
| **Exportar MP3** | Gera o arquivo de áudio (habilitado na Fase 4). |

### 2.2 Grid de montagem

- Cada **linha** é uma nota: 3 oitavas, de **B5** (topo) a **C3** (base). A tecla à esquerda mostra o nome.
- Linhas finas = células; linhas médias = batidas; linhas fortes = compassos.
- Linhas horizontais destacadas marcam o início de cada oitava (nota **C**).

### 2.3 Rodapé

- **⏮ INÍCIO** — leva o cursor ao começo (atalho **Home**).
- **▶ PLAY / ⏸ PAUSE** — toca ou pausa a partir da posição do cursor (atalho **Espaço**).
- **FIM ⏭** — leva o cursor ao fim da sequência (atalho **End**). Dar PLAY no fim recomeça do início.
- À esquerda: posição em **compasso.batida** e o tempo decorrido. À direita: contagem de notas.

---

## 3. Criando notas

| Ação | Resultado |
|---|---|
| **Clique** numa célula vazia | Nota curta (toque solto) de 1 célula |
| **Clique e arraste** na horizontal | Nota longa (toque contínuo) — ideal para piano e synths. Funciona arrastando para a direita ou para a esquerda. |
| **Clique** numa nota do instrumento atual | Apaga a nota |
| **Botão direito** numa nota | Apaga a nota |
| **Clique na régua** (topo) | Move o cursor para aquele ponto |

Se uma nova nota se sobrepõe a outra **do mesmo instrumento e na mesma linha**, a nova substitui a antiga.

### 3.1 Ouvindo enquanto edita

- **Clique numa tecla** (coluna da esquerda) para ouvir aquela nota no instrumento selecionado.
- Ao **criar uma nota** com a reprodução parada, ela toca uma vez (pré-escuta).
- Durante o **PLAY**, as teclas acendem quando suas notas soam.
- O primeiro clique/PLAY libera o áudio (exigência dos navegadores). Se não ouvir nada, confira o volume do sistema.

### 3.2 Os instrumentos

| Instrumento | Timbre | Duração da nota |
|---|---|---|
| **Piano Acústico** | Percussivo, decai naturalmente (mais rápido nos agudos) | Soltar antes encurta; notas longas deixam o som decair |
| **Bateria** | Bumbo, caixa e hi-hats (ver 3.3) | Ignorada (som *one-shot*) |
| **Lofi Synth** | Abafado e quente, com leve vibrato | Sustenta enquanto durar a nota |
| **Lead Synth** | Brilhante (dente-de-serra), para melodias | Sustenta enquanto durar a nota |

### 3.3 Bateria

Com **Bateria** selecionada, as teclas mostram a peça tocada em cada linha (o padrão se repete a cada 4 notas):

| Nota | Peça |
|---|---|
| C, E, G#  | Bumbo |
| C#, F, A  | Caixa |
| D, F#, A# | Hi-Hat fechado |
| D#, G, B  | Hi-Hat aberto |

Os sons de bateria são *one-shot*: a duração da nota não muda o som.

---

## 4. Atalhos de teclado

| Tecla | Ação |
|---|---|
| **Espaço** | Play / Pause |
| **Home** | Início |
| **End** | Fim |

Os atalhos ficam desativados enquanto você digita num campo (BPM, Compassos, Loops).

---

## 5. Problemas comuns

| Sintoma | Solução |
|---|---|
| Não sai som | Clique em PLAY ou numa tecla (o navegador só libera o áudio após um clique) e confira o volume. Se aparecer "Áudio indisponível", o navegador não suporta Web Audio API — use Chrome, Edge ou Firefox atualizados. |
| Som falha com a aba em segundo plano | O navegador reduz os timers de abas ocultas; mantenha a aba visível durante a reprodução. |
| `python` não é reconhecido | Instale o Python 3.10+ marcando *"Add Python to PATH"* e abra um novo terminal. |
| "A execução de scripts foi desabilitada" | Use exatamente `powershell -ExecutionPolicy Bypass -File scripts\run.ps1`. |
| Porta 8000 em uso | Rode com outra porta (`scripts\run.ps1 -Port 9000`) e abra `http://127.0.0.1:9000`. |
| Página em branco ou sem estilo | Verifique a conexão com a internet (o Tailwind é carregado via CDN) e se abriu por `http://`, não `file://`. |
| BPM volta para outro valor | Valores fora da faixa 40–240 são corrigidos automaticamente ao sair do campo. |
