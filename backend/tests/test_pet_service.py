from conftest import auth
from common.security import create_token

STAFF = auth(create_token("staff", "staff", "Staff"))
ADOPTER = auth(create_token("amy", "adopter", "Amy"))
NEW_PET = {"name": "Bella", "species": "dog", "breed": "Beagle", "age": "2 Years Old", "gender": "Female", "desc": "Friendly"}


def test_public_read(pet_client):
    r = pet_client.get("/api/pets")
    assert r.status_code == 200 and len(r.json()) == 4
    assert pet_client.get("/api/pets/PET-001").json()["name"] == "Mochi"
    assert pet_client.get("/api/pets/nope").status_code == 404


def test_writes_require_staff(pet_client):
    assert pet_client.post("/api/pets", json=NEW_PET).status_code == 401
    assert pet_client.post("/api/pets", json=NEW_PET, headers=ADOPTER).status_code == 403
    assert pet_client.put("/api/pets/PET-001", json={"status": "Adopted"}).status_code == 401
    assert pet_client.delete("/api/pets/PET-001", headers=ADOPTER).status_code == 403
    assert pet_client.put("/api/pets/PET-001", json={"status": "Pending Adoption"},
                          headers={"X-Internal-Key": "wrong"}).status_code == 401


def test_staff_and_internal_can_write(pet_client):
    r = pet_client.post("/api/pets", json=NEW_PET, headers=STAFF)
    assert r.status_code == 201 and r.json()["id"] == "PET-005"
    r = pet_client.put("/api/pets/PET-001", json={"status": "Pending Adoption"},
                       headers={"X-Internal-Key": "test-internal-key"})
    assert r.status_code == 200 and r.json()["status"] == "Pending Adoption"
    assert pet_client.delete("/api/pets/PET-005", headers=STAFF).status_code == 200
    # ids are never reused after a delete
    assert pet_client.post("/api/pets", json=NEW_PET, headers=STAFF).json()["id"] == "PET-006"


def test_validation(pet_client):
    bad = [{**NEW_PET, "photo": "javascript:alert(1)"}, {**NEW_PET, "species": "bird"},
           {**NEW_PET, "age": "old"}, {**NEW_PET, "name": ""}, {**NEW_PET, "status": "Gone"}]
    for body in bad:
        assert pet_client.post("/api/pets", json=body, headers=STAFF).status_code == 422
    assert pet_client.put("/api/pets/PET-001", json={"name": None}, headers=STAFF).json()["name"] == "Mochi"


def test_cors_rejects_unknown_origin(pet_client):
    r = pet_client.get("/api/pets", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers
