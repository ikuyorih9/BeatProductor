"""Constantes e limites do backend."""

from pathlib import Path

#: Taxa de amostragem do áudio gerado (Hz).
SAMPLE_RATE = 44_100

#: Instrumentos aceitos (devem coincidir com frontend/js/config.js).
INSTRUMENTS = ("piano", "drums", "bass", "lofi", "lead")

#: Calibração de volume por instrumento (ganho linear), medida para que todos soem
#: com intensidade parecida no volume 100%. O volume escolhido pelo usuário
#: (campo `gain` de cada evento) é aplicado por cima disto.
#: A bateria usa o mesmo nível relativo do navegador (lá, o barramento dela é 1,5 com o piano em
#: 0,85; os sintetizadores daqui são ~1,25× mais baixos na bateria).
INSTRUMENT_TRIM = {"piano": 1.0, "drums": 1.9, "bass": 1.39, "lofi": 1.0, "lead": 1.9}

#: Calibração de cada peça da bateria (sobre INSTRUMENT_TRIM["drums"]) pela intensidade de curto
#: prazo (maior RMS em 50 ms) em relação ao bumbo, com o pico de cada peça limitado a 1,2× o do
#: bumbo — assim nenhuma peça domina a normalização do arquivo (ver tests/test_renderer.py).
DRUM_PIECE_TRIM = {
    "kick": 1.0, "snare": 1.47, "hihat": 1.86, "floor_tom": 0.8,
    "tom2": 0.85, "tom1": 0.9, "ride": 3.1, "crash": 1.6,
    "tambourine": 1.08, "jam_block": 0.84, "cowbell": 0.53, "rototoms": 0.87, "octobans": 0.95,
    "splash": 2.02, "china": 2.18, "stack": 1.62, "bell": 0.4,
}

#: Ganho máximo por evento. O frontend usa curva perceptiva: ganho = (volume% / 100)²,
#: então 200% = 4.0 (+12 dB).
MAX_GAIN = 4.0

#: Formatos de saída suportados.
FORMATS = ("mp3", "wav")

#: Taxa de bits do MP3 (kbps).
MP3_BITRATE = 192

# Limites de validação — protegem o servidor de pedidos enormes.
MAX_EVENTS = 5_000
MAX_LOOPS = 32
MAX_PATTERN_SECONDS = 120.0
MAX_TOTAL_SECONDS = 600.0
MAX_NOTE_SECONDS = 120.0

#: Pico máximo do arquivo final (-1 dBFS), garante ausência de clipping.
TARGET_PEAK = 0.891

#: Cauda máxima após a última repetição (para o release das últimas notas).
MAX_TAIL_SECONDS = 2.0

#: Pasta do frontend, servida como arquivos estáticos pela própria API.
FRONTEND_DIR = Path(__file__).resolve().parents[3] / "frontend"
