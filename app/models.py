from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

def now_utc():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(180), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")

class EmailCode(Base):
    __tablename__ = "email_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    nationality: Mapped[str] = mapped_column(String(80), default="")
    residence_country: Mapped[str] = mapped_column(String(80), default="")
    education: Mapped[str] = mapped_column(Text, default="")
    experience_years: Mapped[int] = mapped_column(Integer, default=0)
    skills: Mapped[str] = mapped_column(Text, default="")
    languages: Mapped[str] = mapped_column(Text, default="")
    target_countries: Mapped[str] = mapped_column(Text, default="")
    job_types: Mapped[str] = mapped_column(Text, default="")
    user: Mapped[User] = relationship(back_populates="profile")

class Country(Base):
    __tablename__ = "countries"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(3), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    overview: Mapped[str] = mapped_column(Text, default="")

class Source(Base):
    __tablename__ = "sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180))
    url: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(20), default="official")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class VisaFact(Base):
    __tablename__ = "visa_facts"
    id: Mapped[int] = mapped_column(primary_key=True)
    country_code: Mapped[str] = mapped_column(String(3), index=True)
    nationality: Mapped[str] = mapped_column(String(80), default="ALL")
    residence_country: Mapped[str] = mapped_column(String(80), default="ALL")
    category: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(240))
    body: Mapped[str] = mapped_column(Text)
    source_name: Mapped[str] = mapped_column(String(180))
    source_url: Mapped[str] = mapped_column(Text)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(240), index=True)
    occupation: Mapped[str] = mapped_column(String(120), default="Other")
    country_code: Mapped[str] = mapped_column(String(3), index=True)
    city: Mapped[str] = mapped_column(String(120), default="")
    employer: Mapped[str] = mapped_column(String(240), default="")
    salary_text: Mapped[str] = mapped_column(String(180), default="")
    language_requirements: Mapped[str] = mapped_column(Text, default="")
    qualifications: Mapped[str] = mapped_column(Text, default="")
    experience_years: Mapped[int] = mapped_column(Integer, default=0)
    deadline: Mapped[str] = mapped_column(String(30), default="")
    employment_type: Mapped[str] = mapped_column(String(80), default="Full-time")
    original_url: Mapped[str] = mapped_column(Text)
    source_name: Mapped[str] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)

class RoadmapStep(Base):
    __tablename__ = "roadmap_steps"
    id: Mapped[int] = mapped_column(primary_key=True)
    country_code: Mapped[str] = mapped_column(String(3), index=True)
    nationality: Mapped[str] = mapped_column(String(80), default="ALL")
    residence_country: Mapped[str] = mapped_column(String(80), default="ALL")
    visa_type: Mapped[str] = mapped_column(String(120), default="Work permit")
    step_number: Mapped[int] = mapped_column(Integer)
    title_en: Mapped[str] = mapped_column(String(240))
    title_bn: Mapped[str] = mapped_column(String(240), default="")
    description_en: Mapped[str] = mapped_column(Text, default="")
    description_bn: Mapped[str] = mapped_column(Text, default="")
    documents_json: Mapped[str] = mapped_column(Text, default="[]")
    fee_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    fee_currency: Mapped[str] = mapped_column(String(8), default="")
    source_url: Mapped[str] = mapped_column(Text)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

class AdUnit(Base):
    __tablename__ = "ad_units"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    network: Mapped[str] = mapped_column(String(80))
    ad_type: Mapped[str] = mapped_column(String(30), default="banner")
    placement: Mapped[str] = mapped_column(String(30), default="bottom")
    interval_minutes: Mapped[int] = mapped_column(Integer, default=10)
    code: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(120))
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str] = mapped_column(String(80), default="")
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
