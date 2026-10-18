"""Security helpers shared by pet-service and adoption-service.

Stdlib only: HS256 JWT, PBKDF2 password hashing, in-memory rate limiting,
CORS / security-header middleware and FastAPI auth dependencies.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

log = logging.getLogger("pawmemaybe.security")

TOKEN_TTL_SECONDS = int(os.environ.get("TOKEN_TTL_SECONDS", 8 * 3600))


def _jwt_secret() -> bytes:
    secret = os.environ.get("JWT_SECRET", "")
    if len(secret) < 16:
        raise RuntimeError("JWT_SECRET must be set (at least 16 characters) and shared by both services.")
    return secret.encode()


# ---------- JWT (HS256) ----------
def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(username: str, role: str, name: str) -> str:
    header = _b64e(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64e(json.dumps({
        "sub": username, "role": role, "name": name,
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }).encode())
    sig = hmac.new(_jwt_secret(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64e(sig)}"


def decode_token(token: str) -> Optional[dict]:
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        header = json.loads(_b64d(header_b64))
        if header.get("alg") != "HS256":
            return None
        expected = hmac.new(_jwt_secret(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64d(sig_b64)):
            return None
        payload = json.loads(_b64d(payload_b64))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


# ---------- Passwords (PBKDF2-HMAC-SHA256) ----------
PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


# ---------- FastAPI dependencies ----------
def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return decode_token(authorization[7:].strip())


def require_user(user: Optional[dict] = Depends(get_current_user)) -> dict:
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    return user


def require_staff(user: dict = Depends(require_user)) -> dict:
    if user.get("role") != "staff":
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


def has_internal_key(x_internal_key: Optional[str]) -> bool:
    """Service-to-service calls (adoption-service -> pet-service) present a shared key."""
    expected = os.environ.get("INTERNAL_API_KEY", "")
    return bool(expected) and bool(x_internal_key) and hmac.compare_digest(x_internal_key, expected)


def require_staff_or_internal(
    authorization: Optional[str] = Header(None),
    x_internal_key: Optional[str] = Header(None),
) -> dict:
    if has_internal_key(x_internal_key):
        return {"sub": "internal", "role": "service"}
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    if user.get("role") != "staff":
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


# ---------- Rate limiting (per pod, in memory) ----------
_hits: dict = defaultdict(deque)


def rate_limit(name: str, max_calls: int, window_seconds: int):
    def dependency(request: Request):
        ip = request.client.host if request.client else "unknown"
        q = _hits[(name, ip)]
        now = time.monotonic()
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= max_calls:
            log.warning("rate limit hit: %s from %s", name, ip)
            raise HTTPException(status_code=429, detail="Too many requests, please slow down.")
        q.append(now)
    return dependency


def reset_rate_limits():
    _hits.clear()


# ---------- Middleware ----------
def configure_app(app: FastAPI) -> None:
    configured = os.environ.get("CORS_ORIGINS", "").strip()
    if configured:  # production: exact origins only
        origins, origin_regex = [o.strip() for o in configured.split(",") if o.strip()], None
    else:  # local development: localhost / private-network (phone on the same Wi-Fi) on any port, and file:// pages
        origins = ["null"]
        origin_regex = (r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+"
                        r"|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=origin_regex,
        allow_credentials=False,  # we use Bearer tokens, not cookies
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        if response.status_code in (401, 403):
            ip = request.client.host if request.client else "unknown"
            log.warning("auth failure %s %s -> %s from %s", request.method, request.url.path, response.status_code, ip)
        return response
