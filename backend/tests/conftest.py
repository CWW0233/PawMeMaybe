import importlib.util
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ.update(JWT_SECRET="test-secret-test-secret-123", INTERNAL_API_KEY="test-internal-key",
                  STAFF_PASSWORD="Staff-Test-1234", SEED_DEMO_DATA="0")


def load_service(folder: str, db_file: Path):
    os.environ["DATABASE_URL"] = f"sqlite:///{db_file}"
    name = f"svc_{folder.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(name, BACKEND / folder / "main.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def pet_client(tmp_path):
    from common.security import reset_rate_limits
    reset_rate_limits()
    mod = load_service("pet-service", tmp_path / "pets.db")
    # an empty data/pets.json from a previous run must not leak into tests
    mod.LEGACY_JSON = tmp_path / "none.json"
    with TestClient(mod.app) as c:
        yield c


@pytest.fixture()
def adoption(tmp_path, monkeypatch):
    """Adoption service wired to a fake in-memory pet catalogue instead of HTTP."""
    from common.security import reset_rate_limits
    reset_rate_limits()
    mod = load_service("adoption-service", tmp_path / "adoptions.db")
    pets = {
        "PET-001": {"id": "PET-001", "name": "Mochi", "breed": "Shiba", "status": "Available"},
        "PET-002": {"id": "PET-002", "name": "Bailey", "breed": "Golden", "status": "Adopted"},
    }
    monkeypatch.setattr(mod, "fetch_pet", lambda pid: pets.get(pid))
    monkeypatch.setattr(mod, "set_pet_status", lambda pid, st: pets[pid].update(status=st))
    with TestClient(mod.app) as c:
        c.pets = pets
        yield c


def auth(token):
    return {"Authorization": f"Bearer {token}"}
