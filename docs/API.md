# API do Beat Productor

Servidor FastAPI (`backend/app`). Documentação interativa gerada automaticamente em
**http://127.0.0.1:8000/docs** quando o servidor está rodando.

## `GET /api/health`

Verifica se o servidor está no ar e informa capacidades.

```json
{
  "status": "ok",
  "version": "1.0.0",
  "sample_rate": 44100,
  "instruments": ["piano", "drums", "bass", "lofi", "lead"],
  "formats": ["mp3", "wav"],
  "limits": { "max_loops": 32, "max_total_seconds": 600.0 }
}
```

## `POST /api/export`

Renderiza a sequência e devolve o arquivo de áudio (download).

### Corpo (JSON)

| Campo | Tipo | Regra | Descrição |
|---|---|---|---|
| `events` | lista | até 5000 | Notas da sequência (ver abaixo) |
| `length` | número | 0 < x ≤ 120 | Duração de **uma** passada do padrão, em segundos |
| `loop` | booleano | padrão `false` | Se `true`, repete o padrão `loops` vezes |
| `loops` | inteiro | 1 – 32 | Repetições (ignorado quando `loop` = `false`) |
| `bpm` | inteiro | 40 – 240, opcional | Informativo |
| `format` | texto | `"mp3"` (padrão) ou `"wav"` | Formato do arquivo |

Cada evento:

| Campo | Tipo | Regra |
|---|---|---|
| `time` | número | ≥ 0 e menor que `length` (segundos) |
| `note` | texto | Nome científico: `C4`, `F#3`… (sem bemóis). Na bateria, só as 17 teclas do kit, `A3` a `C#5` (de baixo para cima: pandeirola, jam block, cowbell, rototons, octobans, bumbo, caixa, chimbal, surdo, tom 2, tom 1, ride, prato de ataque, splash, china, stack, bell); outra nota dá **422** |
| `duration` | número | 0 < x ≤ 120 (segundos) |
| `instrument` | texto | `piano`, `drums`, `bass`, `lofi` ou `lead`. O `bass` soa uma oitava abaixo da `note` (C3 → 65 Hz) |
| `gain` | número (opcional) | 0 ≤ x ≤ 4 — ganho linear do instrumento no mixer (padrão 1 = 100%; 0 = mudo; o app envia (volume%/100)², então 200% = 4). O servidor aplica por cima a calibração de cada instrumento e de cada peça da bateria. |

Campos desconhecidos são rejeitados. A duração total (`length × repetições`) não pode passar de **600 s**.

```json
{
  "bpm": 120,
  "length": 8.0,
  "loop": true,
  "loops": 4,
  "format": "mp3",
  "events": [
    { "time": 0.0, "note": "D4", "duration": 0.125, "instrument": "drums" },
    { "time": 0.5, "note": "C4", "duration": 0.5,   "instrument": "piano", "gain": 0.8 }
  ]
}
```

### Respostas

| Código | Quando | Corpo |
|---|---|---|
| **200** | Sucesso | Bytes do áudio (`audio/mpeg` ou `audio/wav`), com `Content-Disposition: attachment; filename="beat-productor-AAAAMMDD-HHMMSS.mp3"` e `X-Audio-Duration` (segundos) |
| **422** | Corpo inválido | `{"detail": [...]}` — lista de erros do Pydantic, cada um com `loc` e `msg` |
| **500** | Erro inesperado | `{"detail": "Erro interno ao gerar o áudio."}` |

### Exemplo com `curl`

```bash
curl -X POST http://127.0.0.1:8000/api/export \
  -H "Content-Type: application/json" \
  -d '{"length": 2, "events": [{"time": 0, "note": "C4", "duration": 1, "instrument": "piano"}]}' \
  -o beat.mp3
```

## Como o áudio é gerado

1. Cada nota é sintetizada com NumPy/SciPy (`backend/app/audio/instruments.py`), com os mesmos parâmetros
   dos timbres do navegador. Notas idênticas são renderizadas uma única vez (cache).
2. Uma passada do padrão é mixada **com as caudas** que passam do fim (`renderer.render_pass`).
3. A passada é somada a cada `length` segundos (*overlap-add*), com deslocamentos em amostras inteiras:
   a cauda da volta N soa por cima do início da volta N+1, sem cortes (RNF03).
4. O silêncio final é aparado (cauda de até 2 s), o pico é normalizado para **−1 dBFS** (sem clipping)
   e são aplicados fades de 2 ms (início) e 30 ms (fim).
5. Codificação: WAV 16 bits mono (biblioteca padrão) ou MP3 192 kbps mono via `lameenc` (LAME), sem ffmpeg.
