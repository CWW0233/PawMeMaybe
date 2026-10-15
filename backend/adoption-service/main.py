from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import uuid

app = FastAPI(
    title="PawMeMaybe - Adoption Service",
    description="Microservice managing adoption applications and real-time status tracking on GKE",
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
class AdoptionSubmit(BaseModel):
    applicant: str
    email: str
    phone: Optional[str] = "N/A"
    pet: str
    experience: Optional[str] = ""

class AdoptionStatusUpdate(BaseModel):
    status: str # 'Submitted', 'Under Review', 'Interview', 'Approved'

class AdoptionApplication(AdoptionSubmit):
    id: str
    status: str = "Under Review"

# Mock DB Seed
applications_db = [
    {
        "id": "APP-2026-001",
        "applicant": "John Citizen",
        "email": "john@example.com",
        "phone": "0412 345 678",
        "pet": "Mochi (Japanese Shiba Inu)",
        "experience": "Fenced yard with loving family.",
        "status": "Under Review"
    },
    {
        "id": "APP-2026-002",
        "applicant": "Sarah Miller",
        "email": "sarah@example.com",
        "phone": "0498 765 432",
        "pet": "Bailey (Golden Retriever)",
        "experience": "Experienced dog owner, working from home.",
        "status": "Approved"
    }
]

# Health check endpoint for Kubernetes Probes
@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "adoption-service"}

# Feature 3: Submit Online Adoption Application (Create)
@app.post("/api/adoptions", response_model=AdoptionApplication, status_code=201)
def submit_application(app_data: AdoptionSubmit):
    new_id = f"APP-2026-{len(applications_db) + 1:03d}"
    record = app_data.dict()
    record["id"] = new_id
    record["status"] = "Under Review"
    applications_db.insert(0, record)
    return record

# Feature 4: Query Application Status Tracking (Read)
@app.get("/api/adoptions/{query}", response_model=AdoptionApplication)
def get_application_status(query: str):
    q = query.lower().strip()
    for item in applications_db:
        if item["id"].lower() == q or item["email"].lower() == q or q in item["applicant"].lower():
            return item
    raise HTTPException(status_code=404, detail="Application record not found")

# Staff Feature: List All Applications (Read)
@app.get("/api/adoptions", response_model=List[AdoptionApplication])
def list_applications():
    return applications_db

# Staff Feature: Approve or Update Status (Update)
@app.put("/api/adoptions/{app_id}/status", response_model=AdoptionApplication)
def update_application_status(app_id: str, update: AdoptionStatusUpdate):
    for item in applications_db:
        if item["id"].upper() == app_id.upper():
            item["status"] = update.status
            return item
    raise HTTPException(status_code=404, detail="Application ID not found")
