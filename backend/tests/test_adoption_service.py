from conftest import auth


def register(c, user="amy", email="amy@example.com"):
    r = c.post("/api/auth/register", json={"username": user, "password": "password123", "name": user.title(), "email": email})
    assert r.status_code == 201, r.text
    return auth(r.json()["token"])


def staff(c):
    r = c.post("/api/auth/login", json={"username": "staff", "password": "Staff-Test-1234"})
    assert r.status_code == 200
    return auth(r.json()["token"])


def apply(c, headers, pet="PET-001", name="Amy", email="amy@example.com"):
    return c.post("/api/adoptions", headers=headers,
                  json={"pet_id": pet, "applicant": name, "email": email, "phone": "0400 000 000", "experience": "yard"})


def test_login(adoption):
    assert adoption.post("/api/auth/login", json={"username": "staff", "password": "bad"}).status_code == 401
    assert adoption.post("/api/auth/login", json={"username": "nobody", "password": "x"}).status_code == 401
    assert staff(adoption)


def test_login_rate_limited(adoption):
    codes = [adoption.post("/api/auth/login", json={"username": "staff", "password": "bad"}).status_code for _ in range(12)]
    assert codes[-1] == 429


def test_register_cannot_become_staff(adoption):
    h = register(adoption)
    assert adoption.get("/api/adoptions", headers=h).status_code == 403
    r = adoption.post("/api/auth/register", json={"username": "STAFF", "password": "password123", "name": "x", "email": "a@b.co"})
    assert r.status_code == 409


def test_apply_requires_login_and_valid_pet(adoption):
    assert adoption.post("/api/adoptions", json={}).status_code == 401
    h = register(adoption)
    assert apply(adoption, h, pet="PET-999").status_code == 404
    assert apply(adoption, h, pet="PET-002").status_code == 409  # already adopted
    assert apply(adoption, h, email="not-an-email").status_code == 422


def test_apply_marks_pet_pending_and_blocks_duplicates(adoption):
    h = register(adoption)
    r = apply(adoption, h)
    assert r.status_code == 201 and r.json()["pet"] == "Mochi (Shiba)"
    assert adoption.pets["PET-001"]["status"] == "Pending Adoption"
    assert apply(adoption, h).status_code == 409


def test_privacy(adoption):
    amy, bob = register(adoption), register(adoption, "bob", "bob@example.com")
    app_id = apply(adoption, amy).json()["id"]
    assert [a["id"] for a in adoption.get("/api/adoptions/mine", headers=amy).json()] == [app_id]
    assert adoption.get("/api/adoptions/mine", headers=bob).json() == []
    assert adoption.get(f"/api/adoptions/{app_id}", headers=bob).status_code == 404
    assert adoption.get(f"/api/adoptions/{app_id}", headers=amy).status_code == 200
    assert adoption.get("/api/adoptions").status_code == 401
    assert adoption.get("/api/adoptions", headers=bob).status_code == 403
    # guest lookup needs id AND email
    assert adoption.get("/api/adoptions/lookup", params={"id": app_id, "email": "amy@example.com"}).status_code == 200
    assert adoption.get("/api/adoptions/lookup", params={"id": app_id, "email": "bob@example.com"}).status_code == 404
    assert adoption.get("/api/adoptions/lookup", params={"id": "a", "email": "a"}).status_code == 404


def test_approval_flow(adoption):
    amy, bob = register(adoption), register(adoption, "bob", "bob@example.com")
    s = staff(adoption)
    a1 = apply(adoption, amy).json()["id"]
    a2 = apply(adoption, bob, name="Bob", email="bob@example.com").json()["id"]
    assert adoption.put(f"/api/adoptions/{a1}/status", json={"status": "Approved"}, headers=amy).status_code == 403
    assert adoption.put(f"/api/adoptions/{a1}/status", json={"status": "Bogus"}, headers=s).status_code == 422
    assert adoption.put(f"/api/adoptions/{a1}/status", json={"status": "Approved"}, headers=s).json()["status"] == "Approved"
    assert adoption.pets["PET-001"]["status"] == "Adopted"
    statuses = {a["id"]: a["status"] for a in adoption.get("/api/adoptions", headers=s).json()}
    assert statuses[a2] == "Not Selected"
    # second approval for the same pet is refused, approved ones are final
    assert adoption.put(f"/api/adoptions/{a2}/status", json={"status": "Approved"}, headers=s).status_code == 409
    assert adoption.put(f"/api/adoptions/{a1}/status", json={"status": "Under Review"}, headers=s).status_code == 409


def test_delete_releases_pet_and_ids_not_reused(adoption):
    amy = register(adoption)
    s = staff(adoption)
    app_id = apply(adoption, amy).json()["id"]
    assert adoption.delete(f"/api/adoptions/{app_id}", headers=amy).status_code == 403
    assert adoption.delete(f"/api/adoptions/{app_id}", headers=s).status_code == 200
    assert adoption.pets["PET-001"]["status"] == "Available"
    assert apply(adoption, amy).json()["id"] != app_id
