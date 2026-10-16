import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Literal, Optional

# `common/` sits next to main.py in the Docker image and one level up in the repo
_here = Path(__file__).resolve().parent
for _p in (_here, _here.parent):
    if (_p / "common").is_dir() and str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, Column, Integer, String, Text, create_engine, func, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from common.security import configure_app, require_staff, require_staff_or_internal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("pet-service")

PetStatus = Literal["Available", "Pending Adoption", "Adopted"]
PHOTO_PATTERN = r"^(https?://|images/)[^\s\"'<>]+$"
AGE_PATTERN = r"^\d{1,2} (Year|Years|Month|Months)( Old)?$"


# ---------- Database ----------
DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{_here / 'data' / 'pets.db'}"
if DATABASE_URL.startswith("sqlite"):
    (_here / "data").mkdir(exist_ok=True)
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class PetRow(Base):
    __tablename__ = "pets"
    __table_args__ = {"sqlite_autoincrement": True}  # never reuse ids after a delete
    seq = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    species = Column(String(10), nullable=False, index=True)
    breed = Column(String(60), nullable=False)
    age = Column(String(20), nullable=False)
    gender = Column(String(10), nullable=False)
    description = Column(Text, nullable=False)
    photo = Column(String(500), nullable=False)
    status = Column(String(20), nullable=False, default="Available")
    badges = Column(JSON, nullable=False)

    @property
    def id(self) -> str:
        return f"PET-{self.seq:03d}"

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "species": self.species, "breed": self.breed,
            "age": self.age, "gender": self.gender, "desc": self.description, "photo": self.photo,
            "status": self.status, "badges": self.badges or [],
        }


def get_db():
    with SessionLocal() as session:
        yield session


def parse_pet_id(pet_id: str) -> int:
    prefix, _, num = pet_id.upper().partition("-")
    if prefix != "PET" or not num.isdigit():
        raise HTTPException(status_code=404, detail="Pet not found")
    return int(num)


def get_pet_or_404(db: Session, pet_id: str) -> PetRow:
    pet = db.get(PetRow, parse_pet_id(pet_id))
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    return pet


# ---------- Seed data (used only when the table is empty) ----------
SEED_PETS = [
    {"id": "PET-001", "name": "Mochi", "species": "dog", "breed": "Japanese Shiba Inu", "age": "2 Years Old",
     "gender": "Male", "status": "Available",
     "desc": "Classic red sesame Shiba Inu! High spirit, loyal, and fully house-trained. Vaccinated and microchipped.",
     "photo": "images/shiba.jpg", "badges": ["Vaccinated", "Microchipped", "Good with kids"]},
    {"id": "PET-002", "name": "Bailey", "species": "dog", "breed": "Golden Retriever", "age": "3 Years Old",
     "gender": "Female", "status": "Available",
     "desc": "Gentle giant with a heart of gold. Loves swimming and cuddle sessions on lazy Sundays.",
     "photo": "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80",
     "badges": ["House Trained", "Health Checked"]},
    {"id": "PET-003", "name": "Luna", "species": "cat", "breed": "British Shorthair", "age": "1 Year Old",
     "gender": "Female", "status": "Available",
     "desc": "Calm, curious, and adores purring by warm windows. Great companion for apartment living.",
     "photo": "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=600&q=80",
     "badges": ["Desexed", "Indoor Only"]},
    {"id": "PET-004", "name": "Waffles", "species": "dog", "breed": "Pembroke Corgi", "age": "8 Months",
     "gender": "Male", "status": "Available",
     "desc": "Small legs with immense charm! Loves squeaky toys, snacks, and making new dog friends.",
     "photo": "https://images.unsplash.com/photo-1612536057832-2ff7ead58194?auto=format&fit=crop&w=600&q=80",
     "badges": ["Puppy Class Grad", "Microchipped"]},
]
LEGACY_JSON = _here / "data" / "pets.json"  # written by the previous JSON-file version


def seed_if_empty():
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(PetRow)):
            return
        source = SEED_PETS
        if LEGACY_JSON.exists():
            source = json.loads(LEGACY_JSON.read_text(encoding="utf-8"))
            log.info("Importing %d pets from legacy %s", len(source), LEGACY_JSON)
        for p in sorted(source, key=lambda x: int(x["id"].split("-")[1])):
            db.add(PetRow(
                seq=int(p["id"].split("-")[1]), name=p["name"], species=p["species"], breed=p["breed"],
                age=p["age"], gender=p["gender"], description=p["desc"], photo=p["photo"],
                status=p["status"], badges=p.get("badges", [])))
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    seed_if_empty()
    yield


app = FastAPI(
    title="PawMeMaybe - Pet Service",
    description="Microservice managing pet profiles, catalog search, and CRUD inventory on GKE",
    version="2.0.0",
    lifespan=lifespan,
)
configure_app(app)


# ---------- Schemas ----------
class PetCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=50)
    species: Literal["dog", "cat"]
    breed: str = Field(min_length=1, max_length=60)
    age: str = Field(pattern=AGE_PATTERN)
    gender: Literal["Male", "Female"]
    desc: str = Field(min_length=1, max_length=500)
    photo: Optional[str] = Field("images/shiba.jpg", max_length=500, pattern=PHOTO_PATTERN)
    status: PetStatus = "Available"


class PetUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    breed: Optional[str] = Field(None, min_length=1, max_length=60)
    age: Optional[str] = Field(None, pattern=AGE_PATTERN)
    desc: Optional[str] = Field(None, min_length=1, max_length=500)
    status: Optional[PetStatus] = None


class Pet(BaseModel):
    id: str
    name: str
    species: str
    breed: str
    age: str
    gender: str
    desc: str
    photo: str
    status: str
    badges: List[str] = []


# ---------- Endpoints ----------
@app.get("/healthz")
def healthz(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "pet-service"}


@app.get("/api/pets", response_model=List[Pet])
def get_pets(
    species: Optional[str] = Query(None, description="Filter by species (dog/cat)"),
    breed: Optional[str] = Query(None, max_length=60, description="Search by breed or name"),
    db: Session = Depends(get_db),
):
    stmt = select(PetRow).order_by(PetRow.seq.desc())
    if species and species != "all":
        stmt = stmt.where(PetRow.species == species.lower())
    if breed:
        like = f"%{breed.lower()}%"
        stmt = stmt.where(func.lower(PetRow.breed).like(like) | func.lower(PetRow.name).like(like))
    return [p.to_dict() for p in db.scalars(stmt)]


@app.get("/api/pets/{pet_id}", response_model=Pet)
def get_pet(pet_id: str, db: Session = Depends(get_db)):
    return get_pet_or_404(db, pet_id).to_dict()


@app.post("/api/pets", response_model=Pet, status_code=201)
def create_pet(pet: PetCreate, db: Session = Depends(get_db), staff: dict = Depends(require_staff)):
    row = PetRow(
        name=pet.name, species=pet.species, breed=pet.breed, age=pet.age, gender=pet.gender,
        description=pet.desc, photo=pet.photo or "images/shiba.jpg", status=pet.status,
        badges=["Newly Rescued", "Health Checked"])
    db.add(row)
    db.commit()
    log.info("pet %s created by %s", row.id, staff["sub"])
    return row.to_dict()


@app.put("/api/pets/{pet_id}", response_model=Pet)
def update_pet(pet_id: str, update: PetUpdate, db: Session = Depends(get_db),
               actor: dict = Depends(require_staff_or_internal)):
    row = get_pet_or_404(db, pet_id)
    data = {k: v for k, v in update.model_dump(exclude_unset=True).items() if v is not None}
    if "desc" in data:
        data["description"] = data.pop("desc")
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    log.info("pet %s updated by %s: %s", row.id, actor["sub"], sorted(data))
    return row.to_dict()


@app.delete("/api/pets/{pet_id}")
def delete_pet(pet_id: str, db: Session = Depends(get_db), staff: dict = Depends(require_staff)):
    row = get_pet_or_404(db, pet_id)
    name = row.name
    db.delete(row)
    db.commit()
    log.info("pet %s deleted by %s", pet_id, staff["sub"])
    return {"message": f"Pet {name} removed from catalog."}
