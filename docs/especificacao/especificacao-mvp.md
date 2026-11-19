# BEAT PRODUCTOR — Documento de Especificação para MVP (Claude Code)

## 1. Visão Geral e Arquitetura do Sistema
O **Beat Productor** é uma aplicação web minimalista para criação rápida de beats e sequências musicais em um grid estilo *piano roll*. 

*   **Frontend (Interface & Interação):** HTML5, Tailwind CSS (para estilização rápida e limpa) e JavaScript puro (Vanilla JS) usando a **Web Audio API** para feedback sonoro em tempo real durante a edição.
*   **Backend (Geração de Áudio & Exportação):** Python (com bibliotecas como `pydub` e `numpy` ou `scipy`) para sintetizar as ondas sonoras e exportar o arquivo final em **MP3/WAV**.
*   **Estrutura de Dados (Save/Export):** A sequência montada pelo usuário no grid deve ser serializada em uma estrutura limpa (ex: lista de tuplas/objetos `(tempo_inicio, instrumento, nota, duracao)`) para ser processada pelo backend.

---

## 2. Instrumentos e Síntese
Para o MVP, teremos **4 instrumentos** com identidades sonoras distintas:
1.  **Piano Acústico (Simulado):** Timbre percussivo com decaimento natural.
2.  **Bateria (Drum Kit):** Sons percussivos mapeados nas notas (Bumbo, Caixa, Hi-Hat fechado, Hi-Hat aberto).
3.  **Lofi Synth (Sintetizador Abafado):** Onda senoidal/triangular com filtro passa-baixa e leve modulação (*detune* / lofi vibe).
4.  **Lead Synth:** Onda dente-de-serra (*sawtooth*) brilhante para melodias.

---

## 3. Especificação da Interface (UI/UX)

*   **Cabeçalho (Header):**
    *   Seletor de **Instrumento** (Piano, Bateria, Lofi Synth, Lead Synth).
    *   Seletor de **Divisão de Tempo / Metrônomo** (`1/2`, `1/4`, `1/6`).
    *   Input de **BPM** (Padrão: 120).
    *   Checkbox **"Loop"** + Input numérico para **Quantidade de Loops** na exportação.
    *   Botão **"Exportar MP3"**.
*   **Área Central (Piano Roll / Grid de Montagem):**
    *   Grades baseadas em 3 oitavas na vertical (organizadas de cima para baixo da nota mais aguda para a mais grave, ou vice-versa).
    *   À esquerda: Teclas de piano verticais estáticas como referência visual.
    *   O grid divide-se em colunas proporcionais ao tempo selecionado (ex: blocos de 1/4).
    *   **Comportamento de Clique:** Suporta cliques para notas curtas (toques soltos) e clique-e-arrastar para notas longas/contínuas (essencial para o piano).
*   **Rodapé (Footer - Controles de Playback):**
    *   Botões centralizados: **INÍCIO** (retorna o cursor para o beat 0), **PLAY / PAUSE**, **FIM** (vai para o final da sequência).

---

## 4. Requisitos Funcionais
1.  **RF01 - Seleção de Instrumentos:** Permitir alternar entre os 4 instrumentos disponíveis.
2.  **RF02 - Configuração de Tempo e BPM:** Ajustar o BPM em tempo real e a divisão rítmica da grade.
3.  **RF03 - Grid de 3 Oitavas:** Renderizar o espaço de edição com suporte a notas curtas e notas sustentadas (arrastadas).
4.  **RF04 - Playback em Tempo Real:** Tocar a sequência no navegador usando JavaScript/Web Audio API para audição prévia antes de exportar.
5.  **RF05 - Controles de Transporte:** Executar, pausar, ir para o início e ir para o fim da timeline.
6.  **RF06 - Configuração de Loop:** Ativar o loop e definir o número de repetições desejadas para o arquivo final.
7.  **RF07 - Exportação:** Enviar o array de eventos musicais para o backend em Python, que renderizará o arquivo de áudio final e disponibilizará para download.

---

## 5. Requisitos Não Funcionais
1.  **RNF01 - Baixa Latência Visual e Sonora:** O playback local no navegador deve manter sincronia precisa entre o cursor visual e o áudio gerado via Web Audio API.
2.  **RNF02 - Simplicidade e Zero Dependências Pesadas no Frontend:** Utilizar Vanilla JS e Tailwind via CDN para facilitar a execução imediata sem necessidade de build complexo.
3.  **RNF03 - Qualidade de Exportação:** O arquivo gerado pelo Python deve ser exportado em formato `.mp3` limpo, sem cortes abruptos (*clipping*) entre as repetições do loop.

---

## 6. Fases de Desenvolvimento (Roadmap para o Claude)

### FASE 1: Estrutura Base e Grid Frontend (HTML + CSS + JS)
*   Criar o layout principal com Tailwind CSS (cabeçalho, grade de 3 oitavas, rodapé).
*   Implementar a lógica do grid em JavaScript para permitir clicar nas células e criar blocos de notas (com suporte a notas simples e arrastadas para duração).
*   Implementar o mecanismo visual do cursor de reprodução correndo pelo grid.

### FASE 2: Web Audio API (Playback Local no Browser)
*   Mapear as 3 oitavas para frequências reais em Hz usando fórmulas matemáticas de notas musicais.
*   Implementar osciladores básicos e sintetizadores simples em JavaScript para que o usuário ouça o som ao dar "Play" na interface, respeitando o BPM e a divisão de tempo.

### FASE 3: Backend em Python e Estrutura de Dados
*   Criar um endpoint em Python (FastAPI ou Flask) que recebe o JSON contendo os dados do grid (ex: `[{ "time": 0.0, "note": "C4", "duration": 0.5, "instrument": "piano" }]`).
*   Implementar a lógica de síntese em Python usando `numpy` e `pydub` para gerar o áudio correspondente de forma limpa.

### FASE 4: Exportação de Arquivo e Ajustes Finais
*   Integrar o loop e a quantidade de repetições configuradas no painel na hora de gerar o arquivo final.
*   Retornar o arquivo `.mp3` gerado pelo Python para o frontend permitir o download direto pelo navegador.
*   Polimento visual e tratamento de pequenos bugs de sincronia.