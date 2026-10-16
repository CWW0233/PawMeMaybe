# PawMeMaybe 🐾
### Cloud-Native Pet Adoption Microservice Platform
**Course**: INFS3208 Cloud Computing (University of Queensland)

## Overview
PawMeMaybe decouples pet management and adoption handling into independent microservices designed to run on **Google Kubernetes Engine (GKE)**.

## Architecture
| Component | Tech | Notes |
|---|---|---|
| `frontend/` | HTML/CSS/JS served by nginx | Same-origin API calls through the Ingress |
| `backend/pet-service` | FastAPI + SQLAlchemy | Pet catalogue (public read, staff write) |
| `backend/adoption-service` | FastAPI + SQLAlchemy | Accounts/login (JWT), applications, approval workflow; calls pet-service to keep pet status in sync |
| Database | **MySQL** on a Persistent Disk in GKE (`DATABASE_URL`), **SQLite** for local dev | Tables: `pets`, `users`, `applications` |
| `k8s/` | Deployments, Services, HPA, Ingress (HTTPS), NetworkPolicy | State lives in the DB, so pods scale horizontally |

## Security model
- Real accounts: PBKDF2-hashed passwords, HS256 JWT bearer tokens (8 h). Roles (`adopter`, `staff`) come from the server; registration can only create adopters.
- Every write endpoint requires staff; applications are visible only to their owner or staff. Guests can look an application up only with **reference + email**.
- Service-to-service calls use `INTERNAL_API_KEY`; secrets come from environment / Kubernetes Secrets, never from the repo.
- Input validated by Pydantic (lengths, enums, photo URL scheme allow-list); all output rendered in the browser is HTML-escaped.
- CORS restricted to `CORS_ORIGINS`; security headers; rate limiting on login/register/lookup/submit (per pod, in memory).
- Approval conflicts are decided server-side (a pet can be approved for only one applicant).

## Run locally
```bash
pip install -r backend/pet-service/requirements.txt -r backend/requirements-dev.txt
cp backend/.env.example backend/.env      # edit the secrets
powershell -File backend/run_dev.ps1      # starts :8001 and :8002 (SQLite files in each service's data/)
cd frontend && python -m http.server 8080 # open http://localhost:8080
```
The staff account is created on first start from `STAFF_USERNAME` / `STAFF_PASSWORD` (see `backend/.env`). If `STAFF_PASSWORD` is unset a random one is printed in the adoption-service log.

Tests: `python -m pytest backend/tests`

## Deploy to GKE
```bash
docker build -f backend/pet-service/Dockerfile -t REGISTRY/pet-service backend
docker build -f backend/adoption-service/Dockerfile -t REGISTRY/adoption-service backend
docker build -t REGISTRY/frontend frontend
# push the images, edit REGISTRY / PUBLIC_HOST in k8s/*.yaml, then
cp k8s/secrets.example.yaml k8s/secrets.yaml   # fill in real values; never commit it
kubectl apply -f k8s/mysql.yaml && kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/apps.yaml -f k8s/ingress.yaml
```

## Known limitations
- Rate limiting is per pod (use Cloud Armor or a shared store for a global limit).
- Tokens live in `sessionStorage`; the nginx CSP allows inline scripts because the UI uses inline `onclick` handlers.
- The first run imports `backend/pet-service/data/pets.json` (the old JSON-file store) into the database if it exists.
