from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(
    title="PawMeMaybe - Pet Service",
    description="Microservice managing pet profiles, catalog search, and CRUD inventory on GKE",
    version="1.0.0"
)

# Enable CORS for frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data Schema
class PetCreate(BaseModel):
    name: str
    species: str
    breed: str
    age: str
    gender: str
    desc: str
    photo: Optional[str] = "images/shiba.jpg"
    status: Optional[str] = "Available"

class PetUpdate(BaseModel):
    name: Optional[str] = None
    breed: Optional[str] = None
    age: Optional[str] = None
    desc: Optional[str] = None
    status: Optional[str] = None

class Pet(PetCreate):
    id: str
    badges: List[str] = ["Health Checked"]

# Mock DB Seed (simulating MySQL on GKE with Persistent Volume)
pets_db = [
    {
        "id": "PET-001",
        "name": "Mochi",
        "species": "dog",
        "breed": "Japanese Shiba Inu",
        "age": "2 Years Old",
        "gender": "Male",
        "status": "Available",
        "desc": "Classic red sesame Shiba Inu! High spirit, loyal, and fully house-trained. Vaccinated and microchipped.",
        "photo": "images/shiba.jpg",
        "badges": ["Vaccinated", "Microchipped", "Good with kids"]
    },
    {
        "id": "PET-002",
        "name": "Bailey",
        "species": "dog",
        "breed": "Golden Retriever",
        "age": "3 Years Old",
        "gender": "Female",
        "status": "Available",
        "desc": "Gentle giant with a heart of gold. Loves swimming and cuddle sessions on lazy Sundays.",
        "photo": "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80",
        "badges": ["House Trained", "Health Checked"]
    },
    {
        "id": "PET-003",
        "name": "Luna",
        "species": "cat",
        "breed": "British Shorthair",
        "age": "1 Year Old",
        "gender": "Female",
        "status": "Available",
        "desc": "Calm, curious, and adores purring by warm windows. Great companion for apartment living.",
        "photo": "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=600&q=80",
        "badges": ["Desexed", "Indoor Only"]
    },
    {
        "id": "PET-004",
        "name": "Waffles",
        "species": "dog",
        "breed": "Pembroke Corgi",
        "age": "8 Months",
        "gender": "Male",
        "status": "Available",
        "desc": "Small legs with immense charm! Loves squeaky toys, snacks, and making new dog friends.",
        "photo": "https://images.unsplash.com/photo-1612536057832-2ff7ead58194?auto=format&fit=crop&w=600&q=80",
        "badges": ["Puppy Class Grad", "Microchipped"]
    }
]

# Health check endpoint for Kubernetes Liveness & Readiness Probes
@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "pet-service"}

# Feature 1: Pet Catalog & Filtering (Read)
@app.get("/api/pets", response_model=List[Pet])
def get_pets(
    species: Optional[str] = Query(None, description="Filter by species (dog/cat)"),
    breed: Optional[str] = Query(None, description="Search by breed or name")
):
    results = pets_db
    if species and species != "all":
        results = [p for p in results if p["species"] == species.lower()]
    if breed:
        b = breed.lower()
        results = [p for p in results if b in p["breed"].lower() or b in p["name"].lower()]
    return results

# Feature 2: Get Pet Detail (Read)
@app.get("/api/pets/{pet_id}", response_model=Pet)
def get_pet(pet_id: str):
    for p in pets_db:
        if p["id"].upper() == pet_id.upper():
            return p
    raise HTTPException(status_code=404, detail="Pet not found")

# Staff Feature: Add New Pet (Create)
@app.post("/api/pets", response_model=Pet, status_code=201)
def create_pet(pet: PetCreate):
    new_id = f"PET-{len(pets_db) + 1:03d}"
    new_pet = pet.dict()
    new_pet["id"] = new_id
    new_pet["badges"] = ["Newly Rescued", "Health Checked"]
    pets_db.insert(0, new_pet)
    return new_pet

# Staff Feature: Update Pet Profile (Update)
@app.put("/api/pets/{pet_id}", response_model=Pet)
def update_pet(pet_id: str, pet_update: PetUpdate):
    for p in pets_db:
        if p["id"].upper() == pet_id.upper():
            update_data = pet_update.dict(exclude_unset=True)
            p.update(update_data)
            return p
    raise HTTPException(status_code=404, detail="Pet not found")

# Staff Feature: Delete/Remove Pet (Delete)
@app.delete("/api/pets/{pet_id}")
def delete_pet(pet_id: str):
    global pets_db
    for i, p in enumerate(pets_db):
        if p["id"].upper() == pet_id.upper():
            deleted = pets_db.pop(i)
            return {"message": f"Pet {deleted['name']} removed from catalog."}
    raise HTTPException(status_code=404, detail="Pet not found")
