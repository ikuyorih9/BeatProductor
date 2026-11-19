# BEAT PRODUCTOR

# 1 OBJETIVO

Produzir sons em uma ordem específica, em duração específica, em tempo específico. 

Interface para 
* escolha de instrumentos (piano, bateria, ou sintetizador abafado lofi, sintetizador etc);
* seleção de tempo do metrônomo (1/2, 1/4, 1/6);
* seleção de BPM;
* botão de exportação;
* campo de montagem dos beats (filas com 3 oitavas, em que podemos selecionar as regiões de atuação dos bits (toques))

NOTE: no campo de montagem, pode-se escolher entre toques soltos e toques contínuos, principalmente para piano.

# INTERFACE

O campo de montagem de bit contará com 3 oitavas de notas. Na esquerda, há a fileira de teclas de piano, porém na vertical. Cada tecla irá gerar uma linha que se estenderá. As linhas serão separados em colunas múltiplas do TEMPO definido (exemplo: 1/4 separará blocos de 4 notas). A largura das células geradas depende do BPM selecionado.

Em cima do campo de montage de beat, há um cabeçalho em que poderá escolher o INSTRUMENTO, o TEMPO em que a música é tocada e o BPM dela. Além de ter um botão escrito "Exportar". Também haverá um checkbox escrito "Loop" para deixar o som em loop. Se o checkbox loop ficar ativado, é preciso escrever em um input a quantidade de loops para a exportação (durante a execução não precisa encerrar o loop).

Embaixo, centralizado, há um rodapé contendo botões como: INICIO, PAUSE/PLAY, FIM.

# REQUISITOS FUNCIONAIS

1. Escolher diferentes instrumentos;
2. Selecionar uma função loop para os beats;
3. Exportar áudio em MP3;
4. Escolher quantos loops sairão no áudio
5. Tocar os instrumentos a partir de um range de 3 oitavas de notas
6. Configurar Tempo e BPM;
7. Poder executar, pausar, passar para o fim, passar para o início.

# REQUISITOS NÃO FUNCIONAIS


