// Backend locations for local development: same host the page was opened from, ports 8001/8002.
// (So it works as localhost on the PC and as http://<PC-IP>:8080 from a phone on the same Wi-Fi.)
// In the Docker/GKE image this file is replaced by config.prod.js (empty strings = same origin via Ingress).
const _host = window.location.hostname || "127.0.0.1";
window.PAWME_CONFIG = {
  PET_SERVICE_URL: `http://${_host}:8001`,
  ADOPTION_SERVICE_URL: `http://${_host}:8002`
};
