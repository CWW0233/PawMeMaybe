import json
import logging
import os
import secrets
import sys
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

_here = Path(__file__).resolve().parent
for _p in (_here, _here.parent):
    if (_p / "common").is_dir() and str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine, func, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from common.security import (
    configure_app, create_token, hash_password, rate_limit, require_staff, require_user, verify_password,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("adoption-service")

PET_SERVICE_URL = os.environ.get("PET_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/")
ACTIVE_STATUSES = ("Under Review", "Interview")
AppStatus = Literal["Under Review", "Interview", "Approved", "Not Selected"]
PHONE_PATTERN = r"^[0-9+()\- ]{6,20}$"
EMAIL_PATTERN = r"^[^@\s<>\"']+@[^@\s<>\"']+\.[^@\s<>\"']+$"


# ---------- Database ----------
DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{_here / 'data' / 'adoptions.db'}"
if DATABASE_URL.startswith("sqlite"):
    (_here / "data").mkdir(exist_ok=True)
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class UserRow(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(30), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    role = Column(String(10), nullable=False)
    display_name = Column(String(60), nullable=False)
    email = Column(String(120), nullable=False)


class ApplicationRow(Base):
    __tablename__ = "applications"
    __table_args__ = {"sqlite_autoincrement": True}  # never reuse ids after a delete
    seq = Column(Integer, primary_key=True, autoincrement=True)
    applicant = Column(String(60), nullable=False)
    email = Column(String(120), nullable=False)
    phone = Column(String(20), nullable=False, default="N/A")
    pet_id = Column(String(12), index=True)
    pet = Column(String(120), nullable=False)
    experience = Column(Text, nullable=False, default="")
    status = Column(String(20), nullable=False, default="Under Review")
    owner = Column(String(30), index=True)  # username of the adopter who submitted it
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    @property
    def id(self) -> str:
        return f"APP-2026-{self.seq:03d}"

    def to_dict(self) -> dict:
        return {
            "id": self.id, "applicant": self.applicant, "email": self.email, "phone": self.phone,
            "pet_id": self.pet_id, "pet": self.pet, "experience": self.experience, "status": self.status,
        }


def get_db():
    with SessionLocal() as session:
        yield session


def parse_app_id(app_id: str) -> int:
    parts = app_id.upper().split("-")
    if len(parts) != 3 or parts[0] != "APP" or not parts[2].isdigit():
        raise HTTPException(status_code=404, detail="Application not found")
    return int(parts[2])


# ---------- pet-service client ----------
def _pet_request(method: str, path: str, body: Optional[dict] = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{PET_SERVICE_URL}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    key = os.environ.get("INTERNAL_API_KEY")
    if key:
        req.add_header("X-Internal-Key", key)
    try:
        with urllib.request.urlopen(req, timeout=4) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        log.error("pet-service %s %s -> %s", method, path, e.code)
        raise HTTPException(status_code=502, detail="pet-service rejected the request")
    except Exception as e:  # connection refused, timeout, ...
        log.error("pet-service unreachable: %s", e)
        raise HTTPException(status_code=503, detail="pet-service is unavailable, please try again shortly")


def fetch_pet(pet_id: str) -> Optional[dict]:
    return _pet_request("GET", f"/api/pets/{pet_id}")


def set_pet_status(pet_id: str, status: str) -> None:
    _pet_request("PUT", f"/api/pets/{pet_id}", {"status": status})


# ---------- Startup / seeding ----------
def seed():
    with SessionLocal() as db:
        if not db.scalar(select(func.count()).select_from(UserRow).where(UserRow.role == "staff")):
            username = os.environ.get("STAFF_USERNAME", "staff")
            password = os.environ.get("STAFF_PASSWORD")
            if not password:
                password = secrets.token_urlsafe(12)
                log.warning("STAFF_PASSWORD not set - generated one-time staff password for '%s': %s", username, password)
            db.add(UserRow(username=username, password_hash=hash_password(password), role="staff",
                           display_name="Staff Jane", email="staff@pawmemaybe.org"))
            db.commit()
        if os.environ.get("SEED_DEMO_DATA", "1") == "1" and not db.scalar(select(func.count()).select_from(ApplicationRow)):
            db.add(ApplicationRow(
                seq=2, applicant="Sarah Miller", email="sarah@example.com", phone="0498 765 432",
                pet_id="PET-002", pet="Bailey (Golden Retriever)",
                experience="Experienced dog owner, working from home.", status="Approved", owner=None))
            db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    seed()
    yield


app = FastAPI(
    title="PawMeMaybe - Adoption Service",
    description="Microservice managing accounts, adoption applications and status tracking on GKE",
    version="2.0.0",
    lifespan=lifespan,
)
configure_app(app)


# ---------- Schemas ----------
class RegisterRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    username: str = Field(pattern=r"^[A-Za-z0-9_.\-]{3,30}$")
    password: str = Field(min_length=8, max_length=100)
    name: str = Field(min_length=1, max_length=60)
    email: str = Field(max_length=120, pattern=EMAIL_PATTERN)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=30)
    password: str = Field(min_length=1, max_length=100)


class AdoptionSubmit(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    pet_id: str = Field(pattern=r"^PET-\d{1,6}$")
    applicant: str = Field(min_length=1, max_length=60)
    email: str = Field(max_length=120, pattern=EMAIL_PATTERN)
    phone: Optional[str] = Field("N/A", pattern=r"^(N/A|[0-9+()\- ]{6,20})$")
    experience: Optional[str] = Field("", max_length=1000)


class AdoptionStatusUpdate(BaseModel):
    status: AppStatus


class AdoptionApplication(BaseModel):
    id: str
    applicant: str
    email: str
    phone: str
    pet_id: Optional[str] = None
    pet: str
    experience: str
    status: str


def token_response(user: UserRow) -> dict:
    return {
        "token": create_token(user.username, user.role, user.display_name),
        "user": {"username": user.username, "role": user.role, "name": user.display_name, "email": user.email},
    }


# ---------- Auth ----------
_DUMMY_HASH = hash_password("dummy-password-for-timing")


@app.post("/api/auth/register", status_code=201, dependencies=[Depends(rate_limit("register", 10, 3600))])
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.scalar(select(UserRow).where(func.lower(UserRow.username) == body.username.lower())):
        raise HTTPException(status_code=409, detail="That username is already taken")
    user = UserRow(username=body.username, password_hash=hash_password(body.password), role="adopter",
                   display_name=body.name, email=body.email)
    db.add(user)
    db.commit()
    log.info("adopter %s registered", user.username)
    return token_response(user)


@app.post("/api/auth/login", dependencies=[Depends(rate_limit("login", 10, 60))])
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(UserRow).where(func.lower(UserRow.username) == body.username.lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok:
        log.warning("failed login for %r", body.username[:30])
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return token_response(user)


@app.get("/api/auth/me")
def me(claims: dict = Depends(require_user), db: Session = Depends(get_db)):
    user = db.scalar(select(UserRow).where(UserRow.username == claims["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return token_response(user)["user"]


# ---------- Health ----------
@app.get("/healthz")
def healthz(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "adoption-service"}


# ---------- Applications ----------
@app.post("/api/adoptions", response_model=AdoptionApplication, status_code=201,
          dependencies=[Depends(rate_limit("submit", 20, 3600))])
def submit_application(body: AdoptionSubmit, db: Session = Depends(get_db), claims: dict = Depends(require_user)):
    if claims["role"] != "adopter":
        raise HTTPException(status_code=403, detail="Only adopter accounts can submit applications")
    pet = fetch_pet(body.pet_id)
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    if pet["status"] == "Adopted":
        raise HTTPException(status_code=409, detail=f"{pet['name']} has already been adopted")
    duplicate = db.scalar(select(ApplicationRow).where(
        ApplicationRow.owner == claims["sub"], ApplicationRow.pet_id == pet["id"],
        ApplicationRow.status.in_(ACTIVE_STATUSES + ("Approved",))))
    if duplicate:
        raise HTTPException(status_code=409, detail=f"You already have an application for {pet['name']} ({duplicate.id})")

    row = ApplicationRow(
        applicant=body.applicant, email=body.email, phone=body.phone or "N/A", pet_id=pet["id"],
        pet=f"{pet['name']} ({pet['breed']})", experience=body.experience or "",
        status="Under Review", owner=claims["sub"])
    db.add(row)
    db.commit()
    if pet["status"] == "Available":
        try:
            set_pet_status(pet["id"], "Pending Adoption")
        except HTTPException:
            log.warning("could not mark %s as Pending Adoption", pet["id"])
    log.info("application %s submitted by %s for %s", row.id, claims["sub"], pet["id"])
    return row.to_dict()


@app.get("/api/adoptions", response_model=List[AdoptionApplication])
def list_applications(db: Session = Depends(get_db), _: dict = Depends(require_staff)):
    return [a.to_dict() for a in db.scalars(select(ApplicationRow).order_by(ApplicationRow.seq.desc()))]


@app.get("/api/adoptions/mine", response_model=List[AdoptionApplication])
def my_applications(db: Session = Depends(get_db), claims: dict = Depends(require_user)):
    stmt = select(ApplicationRow).where(ApplicationRow.owner == claims["sub"]).order_by(ApplicationRow.seq.desc())
    return [a.to_dict() for a in db.scalars(stmt)]


@app.get("/api/adoptions/lookup", response_model=AdoptionApplication,
         dependencies=[Depends(rate_limit("lookup", 20, 60))])
def lookup_application(id: str = Query(max_length=20), email: str = Query(max_length=120), db: Session = Depends(get_db)):
    """Guest lookup: the reference number AND the email on the application must both match."""
    row = db.get(ApplicationRow, parse_app_id(id))
    if not row or row.email.lower() != email.strip().lower():
        raise HTTPException(status_code=404, detail="Application record not found")
    return row.to_dict()


@app.get("/api/adoptions/{app_id}", response_model=AdoptionApplication)
def get_application(app_id: str, db: Session = Depends(get_db), claims: dict = Depends(require_user)):
    row = db.get(ApplicationRow, parse_app_id(app_id))
    if not row or (claims["role"] != "staff" and row.owner != claims["sub"]):
        raise HTTPException(status_code=404, detail="Application record not found")
    return row.to_dict()


@app.put("/api/adoptions/{app_id}/status", response_model=AdoptionApplication)
def update_application_status(app_id: str, update: AdoptionStatusUpdate, db: Session = Depends(get_db),
                              staff: dict = Depends(require_staff)):
    row = db.get(ApplicationRow, parse_app_id(app_id))
    if not row:
        raise HTTPException(status_code=404, detail="Application ID not found")

    if row.status == "Approved" and update.status != "Approved":
        raise HTTPException(status_code=409, detail="An approved application is final and cannot be changed")

    if update.status == "Approved":
        # Authoritative conflict checks live here, not in the browser
        if row.pet_id:
            pet = fetch_pet(row.pet_id)
            rival = db.scalar(select(ApplicationRow).where(
                ApplicationRow.pet_id == row.pet_id, ApplicationRow.status == "Approved", ApplicationRow.seq != row.seq))
            if rival or (pet and pet["status"] == "Adopted" and row.status != "Approved"):
                raise HTTPException(status_code=409, detail="This pet has already been finalized for another adopter")
        row.status = "Approved"
        if row.pet_id:
            for other in db.scalars(select(ApplicationRow).where(
                    ApplicationRow.pet_id == row.pet_id, ApplicationRow.seq != row.seq,
                    ApplicationRow.status.in_(ACTIVE_STATUSES))):
                other.status = "Not Selected"
        db.commit()
        if row.pet_id:
            set_pet_status(row.pet_id, "Adopted")  # idempotent: re-approving re-syncs the pet
    else:
        row.status = update.status
        db.commit()
    log.info("application %s -> %s by %s", row.id, row.status, staff["sub"])
    return row.to_dict()


@app.delete("/api/adoptions/{app_id}")
def delete_application(app_id: str, db: Session = Depends(get_db), staff: dict = Depends(require_staff)):
    row = db.get(ApplicationRow, parse_app_id(app_id))
    if not row:
        raise HTTPException(status_code=404, detail="Application ID not found")
    rid, pet_id, was_active = row.id, row.pet_id, row.status in ACTIVE_STATUSES
    db.delete(row)
    db.commit()
    # If that was the last open application on a pending pet, free the pet again
    if pet_id and was_active:
        remaining = db.scalar(select(func.count()).select_from(ApplicationRow).where(
            ApplicationRow.pet_id == pet_id, ApplicationRow.status.in_(ACTIVE_STATUSES)))
        if not remaining:
            try:
                pet = fetch_pet(pet_id)
                if pet and pet["status"] == "Pending Adoption":
                    set_pet_status(pet_id, "Available")
            except HTTPException:
                log.warning("could not release %s after deleting %s", pet_id, rid)
    log.info("application %s deleted by %s", rid, staff["sub"])
    return {"message": f"Application {rid} deleted."}
