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
| `k8s/` | Deployments (rolling update), Services, HPA, Ingress (HTTP load balancer), NetworkPolicy | State lives in the DB, so pods scale horizontally |

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
Full step-by-step commands (every command has a comment) are in **[DEPLOY.md](DEPLOY.md)**. Summary:
1. Build the three images (`pet-service`, `adoption-service`, `frontend`, tag `v1`) and push them to Artifact Registry.
2. Create the GKE cluster (3 x e2-medium), then create the Kubernetes Secret with random passwords.
3. `kubectl apply` the files in `k8s/` (`mysql.yaml`, `apps.yaml`, `ingress.yaml`). The Ingress prints a public IP; open `http://<IP>`.
4. Demo commands for scaling, pod failure, and rollout / rollback (v1 to v2) are at the end of DEPLOY.md.

**Staff login**: username `staff`. The password is generated randomly at deployment time (DEPLOY.md step 7 prints it), so it differs for every deployment. Adopters create their own account with "Create Account".

## Known limitations
- Rate limiting is per pod (use Cloud Armor or a shared store for a global limit).
- Tokens live in `sessionStorage`; the nginx CSP allows inline scripts because the UI uses inline `onclick` handlers.
- The first run imports `backend/pet-service/data/pets.json` (the old JSON-file store) into the database if it exists.
