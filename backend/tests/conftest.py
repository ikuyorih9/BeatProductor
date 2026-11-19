import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Permite `import app` rodando o pytest a partir de qualquer pasta.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(create_app())
