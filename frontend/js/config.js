// Backend locations. Local dev talks to the two FastAPI services directly.
// In the Docker/GKE image this file is replaced by config.prod.js (empty strings = same origin via Ingress).
window.PAWME_CONFIG = {
  PET_SERVICE_URL: "http://127.0.0.1:8001",
  ADOPTION_SERVICE_URL: "http://127.0.0.1:8002"
};
