import os, secrets, hashlib, hmac, smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import jwt, JWTError
from fastapi import HTTPException, Request
from .models import User

_password_hasher = PasswordHasher()
JWT_ALGORITHM = "HS256"

def hash_secret(value: str) -> str:
    return _password_hasher.hash(value)

def verify_secret(hashed: str, value: str) -> bool:
    try:
        return _password_hasher.verify(hashed, value)
    except (VerifyMismatchError, Exception):
        return False

def issue_token(user: User) -> str:
    key = os.getenv("APP_SECRET_KEY")
    if not key or len(key) < 32:
        raise RuntimeError("APP_SECRET_KEY must be set to a random value of at least 32 characters")
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user.id), "role": user.role, "iat": now, "exp": now + timedelta(hours=12)}, key, algorithm=JWT_ALGORITHM)

def token_user_id(token: str) -> int | None:
    try:
        key = os.getenv("APP_SECRET_KEY", "")
        if len(key) < 32: return None
        return int(jwt.decode(token, key, algorithms=[JWT_ALGORITHM])["sub"])
    except (JWTError, ValueError, KeyError):
        return None

def new_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"

def code_digest(email: str, code: str) -> str:
    pepper = os.getenv("APP_SECRET_KEY", "local-only-unsafe-key")
    return hmac.new(pepper.encode(), f"{email.lower()}:{code}".encode(), hashlib.sha256).hexdigest()

def send_verification_code(email: str, code: str) -> bool:
    host = os.getenv("SMTP_HOST")
    if not host:
        if os.getenv("APP_ENV", "development") == "production":
            raise RuntimeError("SMTP_HOST is required in production to send verification emails")
        print(f"[DEV ONLY] Verification code for {email}: {code}")
        return False
    msg = EmailMessage()
    msg["Subject"] = "Your EuropePath verification code"
    msg["From"] = os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "noreply@example.invalid"))
    msg["To"] = email
    msg.set_content(f"Your verification code is {code}. It expires in 10 minutes. If you did not request it, ignore this email.")
    with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=15) as server:
        server.starttls()
        user, password = os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD")
        if user and password: server.login(user, password)
        server.send_message(msg)
    return True

def current_user(request: Request, db):
    from .models import User
    token = request.cookies.get("session")
    uid = token_user_id(token) if token else None
    user = db.get(User, uid) if uid else None
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user

def require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def require_admin_totp(code: str | None):
    import pyotp
    secret = os.getenv("ADMIN_TOTP_SECRET", "")
    if not secret:
        raise HTTPException(status_code=503, detail="Admin TOTP is not configured; set ADMIN_TOTP_SECRET")
    if not code or not pyotp.TOTP(secret).verify(code, valid_window=1):
        raise HTTPException(status_code=401, detail="Valid admin authenticator code required")
