import io
import wave

import pytest

from app.core.config import SAMPLE_RATE


def payload(**overrides):
    body = {
        "bpm": 120,
        "length": 2.0,
        "loop": False,
        "loops": 1,
        "format": "mp3",
        "events": [
            {"time": 0.0, "note": "C3", "duration": 0.125, "instrument": "drums"},
            {"time": 0.5, "note": "C4", "duration": 0.5, "instrument": "piano"},
            {"time": 1.0, "note": "E4", "duration": 0.5, "instrument": "lofi"},
            {"time": 1.5, "note": "G4", "duration": 0.25, "instrument": "lead"},
        ],
    }
    body.update(overrides)
    return body


def is_mp3(data: bytes) -> bool:
    return data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0)


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["instruments"] == ["piano", "drums", "lofi", "lead"]
    assert "mp3" in body["formats"]


def test_export_mp3(client):
    response = client.post("/api/export", json=payload())
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["content-disposition"].startswith('attachment; filename="beat-productor-')
    assert response.headers["content-disposition"].endswith('.mp3"')
    assert is_mp3(response.content)
    assert len(response.content) > 10_000
    assert float(response.headers["x-audio-duration"]) >= 2.0


def test_export_wav_duration_with_loops(client):
    response = client.post("/api/export", json=payload(format="wav", loop=True, loops=3))
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(response.content)) as wav:
        assert wav.getframerate() == SAMPLE_RATE
        assert wav.getnchannels() == 1
        seconds = wav.getnframes() / SAMPLE_RATE
    assert 6.0 <= seconds <= 6.0 + 2.0  # 3 voltas de 2 s + cauda


def test_loops_ignored_when_loop_is_off(client):
    response = client.post("/api/export", json=payload(format="wav", loop=False, loops=5))
    with wave.open(io.BytesIO(response.content)) as wav:
        assert wav.getnframes() / SAMPLE_RATE < 4.0


def test_export_without_events_returns_silence(client):
    response = client.post("/api/export", json=payload(events=[], format="wav"))
    assert response.status_code == 200
    with wave.open(io.BytesIO(response.content)) as wav:
        assert wav.getnframes() == 2 * SAMPLE_RATE


@pytest.mark.parametrize(
    "overrides",
    [
        {"events": [{"time": 0, "note": "H4", "duration": 0.5, "instrument": "piano"}]},
        {"events": [{"time": 0, "note": "C4", "duration": 0.5, "instrument": "tuba"}]},
        {"events": [{"time": 0, "note": "C4", "duration": 0, "instrument": "piano"}]},
        {"events": [{"time": -1, "note": "C4", "duration": 0.5, "instrument": "piano"}]},
        {"events": [{"time": 2.0, "note": "C4", "duration": 0.5, "instrument": "piano"}]},
        {"events": [{"time": 0, "note": "C4", "duration": 0.5, "instrument": "piano", "extra": 1}]},
        {"events": [{"time": 0, "note": "C4", "duration": 0.5, "instrument": "piano", "gain": -0.1}]},
        {"events": [{"time": 0, "note": "C4", "duration": 0.5, "instrument": "piano", "gain": 4.5}]},
        {"length": 0},
        {"length": 500},
        {"loops": 0},
        {"loops": 99},
        {"format": "ogg"},
        {"bpm": 999},
        {"length": 100, "loop": True, "loops": 10},
    ],
)
def test_invalid_requests_are_rejected_with_422(client, overrides):
    response = client.post("/api/export", json=payload(**overrides))
    assert response.status_code == 422
    assert "detail" in response.json()


def test_total_duration_error_message_is_helpful(client):
    response = client.post("/api/export", json=payload(length=100, loop=True, loops=10))
    message = str(response.json()["detail"])
    assert "muito longo" in message


def test_float_rounding_from_browser_is_tolerated(client):
    # 1/6 de batida a 120 BPM gera dízimas; a última célula termina "quase" no fim.
    events = [{"time": 2.0 - 1 / 12, "note": "C4", "duration": 1 / 12, "instrument": "piano"}]
    response = client.post("/api/export", json=payload(events=events))
    assert response.status_code == 200


def test_frontend_is_served(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Beat Productor" in response.text
    js = client.get("/js/main.js")
    assert js.status_code == 200
    assert "javascript" in js.headers["content-type"]
    css = client.get("/css/styles.css")
    assert css.headers["content-type"].startswith("text/css")


def test_unknown_api_route_is_404(client):
    assert client.get("/api/nao-existe").status_code == 404


def test_mp3_decodes_with_expected_duration(client, tmp_path):
    """Decodifica o MP3 com o ffmpeg (se instalado) para garantir que o arquivo é válido."""
    import shutil
    import subprocess

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        pytest.skip("ffmpeg não instalado")
    response = client.post("/api/export", json=payload(loop=True, loops=2))
    path = tmp_path / "out.mp3"
    path.write_bytes(response.content)
    result = subprocess.run(
        [ffmpeg, "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"],
        capture_output=True, check=False, timeout=60,
    )
    assert result.returncode == 0, result.stderr.decode(errors="replace")
    assert result.stderr == b""  # nenhum erro de decodificação
    seconds = len(result.stdout) / 2 / SAMPLE_RATE
    expected = float(response.headers["x-audio-duration"])
    assert abs(seconds - expected) < 0.1  # encoder/decoder adicionam poucos ms de padding
