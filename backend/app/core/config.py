"""Constantes e limites do backend."""

from pathlib import Path

#: Taxa de amostragem do áudio gerado (Hz).
SAMPLE_RATE = 44_100

#: Instrumentos aceitos (devem coincidir com frontend/js/config.js).
INSTRUMENTS = ("piano", "drums", "lofi", "lead")

#: Calibração de volume por instrumento (ganho linear), medida para que todos soem
#: com intensidade parecida no volume 100%. O volume escolhido pelo usuário
#: (campo `gain` de cada evento) é aplicado por cima disto.
INSTRUMENT_TRIM = {"piano": 1.0, "drums": 1.25, "lofi": 1.0, "lead": 1.9}

#: Calibração de cada peça da bateria (sobre INSTRUMENT_TRIM["drums"]): caixa e hi-hats
#: soavam 10–18 dB abaixo do bumbo; com isto ficam no mesmo equilíbrio do navegador
#: (caixa −1,5, hi-hat fechado −8, aberto −5 dB em relação ao bumbo).
DRUM_PIECE_TRIM = {"kick": 1.0, "snare": 2.3, "hihat_closed": 3.9, "hihat_open": 2.6}

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
