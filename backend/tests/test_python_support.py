"""A faixa de Python suportada é a mesma em todos os pontos de entrada.

O erro "could not find a version that satisfies the requirement ..." aparece quando alguém
instala com um Python fora da faixa para a qual as dependências fixadas têm pacotes prontos.
O lançador e os scripts recusam esses Pythons (e o lançador instala um compatível); este
teste garante que ninguém mude a faixa num lugar e esqueça os outros.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIN, MAX = (3, 12), (3, 14)


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8-sig")


def test_pyproject_declares_the_supported_range():
    assert re.search(r'requires-python = ">=3\.12,<3\.15"', read("backend/pyproject.toml"))


def test_launcher_uses_the_same_range_and_a_bundled_python_inside_it():
    source = read("launcher/BeatProductor.cs")
    assert "MinPython = new Version(3, 12)" in source
    assert "MaxPython = new Version(3, 14)" in source
    bundled = re.search(r'BundledPythonVersion = "(\d+)\.(\d+)\.\d+"', source)
    assert MIN <= (int(bundled[1]), int(bundled[2])) <= MAX
    url = re.search(r'BundledPythonUrl = "([^"]+)"', source)[1]
    assert url.startswith("https://www.python.org/ftp/python/")
    assert re.search(r'BundledPythonSha256 = "[0-9A-F]{64}"', source)


def test_run_scripts_use_the_same_range():
    for script in ("scripts/run.ps1", "scripts/run.sh"):
        text = read(script)
        assert re.search(r"MIN_?MINOR\s*=\s*12", text, re.I), script
        assert re.search(r"MAX_?MINOR\s*=\s*14", text, re.I), script


def test_this_interpreter_is_inside_the_range():
    assert MIN <= sys.version_info[:2] <= MAX
