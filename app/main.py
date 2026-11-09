import os, json, gzip, io, hashlib, logging, secrets
from pathlib import Path
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from .database import Base, engine, get_db, SessionLocal
from .models import User, EmailCode, Profile, Country, Source, VisaFact, Job, RoadmapStep, AdUnit, AuditLog
from .security import hash_secret, verify_secret, issue_token, token_user_id, new_email_code, code_digest, send_verification_code, current_user, require_admin, require_admin_totp

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("europepath")
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Europe Job & Visa Information Platform", version="0.2.0", description="Official-source-first job and visa guidance. Not legal advice.")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=2, max_length=180)
class VerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")
class LoginIn(BaseModel):
    email: EmailStr
    password: str
class ProfileIn(BaseModel):
    phone: str = ""
    nationality: str = ""
    residence_country: str = ""
    education: str = ""
    experience_years: int = Field(default=0, ge=0, le=70)
    skills: list[str] = []
    languages: list[str] = []
    target_countries: list[str] = []
    job_types: list[str] = []
class VisaFactIn(BaseModel):
    country_code: str
    nationality: str = "ALL"
    residence_country: str = "ALL"
    category: str
    title: str
    body: str
    source_name: str
    source_url: str
class JobIn(BaseModel):
    title: str
    occupation: str = "Other"
    country_code: str
    city: str = ""
    employer: str = ""
    salary_text: str = ""
    language_requirements: str = ""
    qualifications: str = ""
    experience_years: int = 0
    deadline: str = ""
    employment_type: str = "Full-time"
    original_url: str
    source_name: str
class ReviewIn(BaseModel):
    status: str
class RoadmapIn(BaseModel):
    country_code: str
    nationality: str = "ALL"
    residence_country: str = "ALL"
    visa_type: str = "Work permit"
    step_number: int = Field(ge=1)
    title_en: str
    title_bn: str = ""
    description_en: str = ""
    description_bn: str = ""
    documents: list[str] = []
    fee_amount: float | None = None
    fee_currency: str = ""
    source_url: str
    verified: bool = False

def audit(db: Session, actor, action: str, entity: str, entity_id="", details=None):
    db.add(AuditLog(actor_id=actor.id if actor else None, action=action, entity_type=entity, entity_id=str(entity_id), details_json=json.dumps(details or {}, ensure_ascii=False)))

def require_admin_request(request: Request, db: Session):
    user = current_user(request, db)
    require_admin(user)
    return user

@app.on_event("startup")
def startup():
    with SessionLocal() as db:
        if db.scalar(select(func.count(Country.id))) == 0:
            for code, name in [("DE","Germany"),("IT","Italy"),("FR","France"),("PT","Portugal"),("ES","Spain"),("PL","Poland"),("NL","Netherlands")]:
                db.add(Country(code=code, name=name, overview="Country profile awaiting official-source review."))
            db.commit()

@app.get("/api/health")
def health():
    return {"status":"ok","service":"europe-job-visa-platform","version":"0.2.0"}

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def home():
    path = STATIC_DIR / "index.html"
    if not path.exists():
        return HTMLResponse("<h1>EuropePath</h1><p>Frontend files are not installed yet.</p>")
    return path.read_text(encoding="utf-8")

@app.post("/api/auth/register", status_code=202)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        # Same response avoids exposing whether an email already exists.
        return {"message":"If registration is available, a verification code has been sent."}
    user = User(email=email, full_name=data.full_name.strip(), password_hash=hash_secret(data.password))
    db.add(user); db.flush()
    db.add(Profile(user_id=user.id))
    code = new_email_code()
    db.add(EmailCode(email=email, code_hash=code_digest(email, code), expires_at=datetime.now(timezone.utc)+timedelta(minutes=10)))
    try:
        send_verification_code(email, code)
    except Exception:
        db.rollback()
        log.exception("Verification email failed")
        raise HTTPException(status_code=503, detail="Email delivery is not configured. Please try again later.")
    db.commit()
    return {"message":"Verification requested. In development, check the server log for the code."}

@app.post("/api/auth/verify")
def verify_email(data: VerifyIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    entry = db.scalar(select(EmailCode).where(EmailCode.email == email).order_by(EmailCode.created_at.desc()))
    user = db.scalar(select(User).where(User.email == email))
    if not entry or not user or entry.attempts >= 5:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    if entry.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc) or not secrets.compare_digest(entry.code_hash, code_digest(email, data.code)):
        entry.attempts += 1; db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    user.is_verified = True
    db.query(EmailCode).filter(EmailCode.email == email).delete()
    db.commit()
    return {"message":"Email verified. You can now sign in."}

@app.post("/api/auth/login")
def login(data: LoginIn, response: Response, request: Request, db: Session = Depends(get_db)):
    email = data.email.lower()
    # Basic per-IP/email cooldown using persisted failed-login counters is planned; deployment should additionally apply edge rate limiting.
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_secret(user.password_hash, data.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active: raise HTTPException(status_code=403, detail="Account disabled")
    if not user.is_verified: raise HTTPException(status_code=403, detail="Verify your email before signing in")
    response.set_cookie("session", issue_token(user), httponly=True, secure=os.getenv("APP_ENV")=="production", samesite="lax", max_age=43200, path="/")
    return {"id":user.id,"email":user.email,"full_name":user.full_name,"role":user.role}

@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("session", path="/")
    return {"message":"Signed out"}

@app.get("/api/me")
def me(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    p = db.scalar(select(Profile).where(Profile.user_id == user.id))
    return {"id":user.id,"email":user.email,"full_name":user.full_name,"role":user.role,"is_verified":user.is_verified,"profile":profile_json(p) if p else None}

def profile_json(p):
    return {"phone":p.phone,"nationality":p.nationality,"residence_country":p.residence_country,"education":p.education,"experience_years":p.experience_years,"skills":json.loads(p.skills or "[]"),"languages":json.loads(p.languages or "[]"),"target_countries":json.loads(p.target_countries or "[]"),"job_types":json.loads(p.job_types or "[]")}

@app.put("/api/profile")
def update_profile(data: ProfileIn, request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    p = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if not p: p = Profile(user_id=user.id); db.add(p)
    for field in ["phone","nationality","residence_country","education","experience_years"]:
        setattr(p, field, getattr(data, field))
    for field in ["skills","languages","target_countries","job_types"]:
        setattr(p, field, json.dumps(getattr(data, field), ensure_ascii=False))
    db.commit()
    return {"profile":profile_json(p),"completeness":profile_completeness(p)}

def profile_completeness(p):
    fields=[p.phone,p.nationality,p.residence_country,p.education,p.skills,p.languages,p.target_countries,p.job_types]
    return round(100*sum(bool(x and x not in ("[]","")) for x in fields)/len(fields))

@app.get("/api/profile/export")
def export_profile(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db); p=db.scalar(select(Profile).where(Profile.user_id==user.id))
    return {"email":user.email,"full_name":user.full_name,"profile":profile_json(p) if p else None}

@app.delete("/api/profile")
def delete_account(request: Request, response: Response, db: Session = Depends(get_db)):
    user=current_user(request,db); db.delete(user); db.commit(); response.delete_cookie("session",path="/")
    return {"message":"Account and linked profile deleted"}

@app.get("/api/countries")
def countries(db: Session = Depends(get_db)):
    return [{"code":c.code,"name":c.name,"overview":c.overview} for c in db.scalars(select(Country).where(Country.enabled==True).order_by(Country.name)).all()]

@app.get("/api/visa-facts")
def visa_facts(country_code: str, nationality: str="ALL", residence_country: str="ALL", db: Session=Depends(get_db)):
    # Public users only see explicitly approved information.
    rows=db.scalars(select(VisaFact).where(VisaFact.country_code==country_code.upper(),VisaFact.status=="approved").order_by(VisaFact.category)).all()
    rows=[x for x in rows if x.nationality in ("ALL",nationality) and x.residence_country in ("ALL",residence_country)]
    return [{"id":x.id,"category":x.category,"title":x.title,"body":x.body,"source_name":x.source_name,"source_url":x.source_url,"collected_at":x.collected_at,"verified_at":x.verified_at,"status":x.status} for x in rows]

@app.get("/api/jobs")
def jobs(country_code: str|None=None, q: str|None=None, request: Request=None, db: Session=Depends(get_db)):
    stmt=select(Job).where(Job.status=="active")
    if country_code: stmt=stmt.where(Job.country_code==country_code.upper())
    if q: stmt=stmt.where(Job.title.ilike(f"%{q[:100]}%") | Job.occupation.ilike(f"%{q[:100]}%") | Job.city.ilike(f"%{q[:100]}%"))
    rows=db.scalars(stmt.order_by(Job.collected_at.desc()).limit(100)).all()
    return [{"id":j.id,"title":j.title,"occupation":j.occupation,"country_code":j.country_code,"city":j.city,"employer":j.employer,"salary_text":j.salary_text,"language_requirements":j.language_requirements,"qualifications":j.qualifications,"experience_years":j.experience_years,"deadline":j.deadline,"employment_type":j.employment_type,"original_url":j.original_url,"source_name":j.source_name,"collected_at":j.collected_at} for j in rows]

@app.get("/api/jobs/matches")
def job_matches(request: Request, db: Session=Depends(get_db)):
    user=current_user(request,db); p=db.scalar(select(Profile).where(Profile.user_id==user.id))
    if not p: return []
    skills=set(x.lower() for x in json.loads(p.skills or "[]")); languages=set(x.lower() for x in json.loads(p.languages or "[]")); targets=set(x.upper() for x in json.loads(p.target_countries or "[]")); types=set(x.lower() for x in json.loads(p.job_types or "[]"))
    result=[]
    for j in db.scalars(select(Job).where(Job.status=="active").limit(200)).all():
        score=0; reasons=[]
        if not targets or j.country_code in targets: score+=25; reasons.append("target country")
        if j.occupation.lower() in types or j.title.lower() in types: score+=25; reasons.append("job interest")
        matched=[s for s in skills if s in (j.title+" "+j.occupation+" "+j.qualifications).lower()]
        score+=min(30,10*len(matched))
        if matched: reasons.append("skills: "+", ".join(sorted(matched)))
        if p.experience_years>=j.experience_years: score+=20; reasons.append("experience fits")
        result.append({"job_id":j.id,"title":j.title,"country_code":j.country_code,"score":min(score,100),"explanation":"Matches: "+(", ".join(reasons) if reasons else "limited profile overlap"),"original_url":j.original_url})
    return sorted(result,key=lambda x:x["score"],reverse=True)[:50]

@app.get("/api/roadmap")
def roadmap(country_code: str, nationality: str="ALL", residence_country: str="ALL", visa_type: str="Work permit", db: Session=Depends(get_db)):
    rows=db.scalars(select(RoadmapStep).where(RoadmapStep.country_code==country_code.upper(),RoadmapStep.visa_type==visa_type, RoadmapStep.verified==True).order_by(RoadmapStep.step_number)).all()
    rows=[r for r in rows if r.nationality in ("ALL",nationality) and r.residence_country in ("ALL",residence_country)]
    return {"verified_roadmap_available":bool(rows),"warning":None if rows else "No verified roadmap is available for this combination. Check the official immigration authority before acting.","steps":[{"step_number":r.step_number,"title_en":r.title_en,"title_bn":r.title_bn,"description_en":r.description_en,"description_bn":r.description_bn,"documents":json.loads(r.documents_json),"fee_amount":r.fee_amount,"fee_currency":r.fee_currency,"source_url":r.source_url} for r in rows]}

@app.post("/api/cv/pdf")
def cv_pdf(request: Request, db: Session=Depends(get_db)):
    user=current_user(request,db); p=db.scalar(select(Profile).where(Profile.user_id==user.id))
    if not p: raise HTTPException(400,"Complete your profile first")
    buffer=io.BytesIO(); pdf=canvas.Canvas(buffer,pagesize=A4); width,height=A4; y=height-60
    pdf.setTitle("CV - "+user.full_name)
    pdf.setFont("Helvetica-Bold",20); pdf.drawString(48,y,user.full_name[:80]); y-=28
    pdf.setFont("Helvetica",10)
    for label,value in [("Email",user.email),("Phone",p.phone),("Nationality",p.nationality),("Residence",p.residence_country),("Education",p.education),("Experience (years)",str(p.experience_years)),("Skills",", ".join(json.loads(p.skills or "[]"))),("Languages",", ".join(json.loads(p.languages or "[]")))]:
        if value:
            if y<70: pdf.showPage(); y=height-60; pdf.setFont("Helvetica",10)
            pdf.setFont("Helvetica-Bold",10); pdf.drawString(48,y,(label+":")[:100])
            pdf.setFont("Helvetica",10); pdf.drawString(150,y,str(value).encode("latin-1","replace").decode("latin-1")[:100]); y-=20
    pdf.setFont("Helvetica-Oblique",8); pdf.drawString(48,35,"Generated by EuropePath. Review and edit details before applying.")
    pdf.save(); buffer.seek(0)
    return StreamingResponse(buffer,media_type="application/pdf",headers={"Content-Disposition":'attachment; filename="europath-cv.pdf"'})

@app.post("/api/admin/visa-facts")
def create_visa_fact(data: VisaFactIn, request: Request, totp: str|None=None, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db); require_admin_totp(totp)
    if not data.source_url.startswith("https://"): raise HTTPException(400,"Official source URL must use HTTPS")
    fact=VisaFact(**data.model_dump(),status="pending")
    db.add(fact); db.flush(); audit(db,admin,"create","visa_fact",fact.id,{"status":"pending"}); db.commit()
    return {"id":fact.id,"status":fact.status,"message":"Saved to review queue; not public until approved."}

@app.get("/api/admin/review-queue")
def review_queue(request: Request, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db)
    rows=db.scalars(select(VisaFact).where(VisaFact.status=="pending").order_by(VisaFact.collected_at)).all()
    return [{"id":x.id,"country_code":x.country_code,"nationality":x.nationality,"residence_country":x.residence_country,"category":x.category,"title":x.title,"body":x.body,"source_name":x.source_name,"source_url":x.source_url,"collected_at":x.collected_at} for x in rows]

@app.post("/api/admin/visa-facts/{fact_id}/review")
def review_fact(fact_id: int, data: ReviewIn, request: Request, totp: str|None=None, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db); require_admin_totp(totp)
    if data.status not in ("approved","rejected"): raise HTTPException(400,"Status must be approved or rejected")
    fact=db.get(VisaFact,fact_id)
    if not fact: raise HTTPException(404,"Fact not found")
    fact.status=data.status; fact.reviewer_id=admin.id
    if data.status=="approved": fact.verified_at=datetime.now(timezone.utc)
    audit(db,admin,"review","visa_fact",fact.id,{"status":data.status}); db.commit()
    return {"id":fact.id,"status":fact.status}

@app.post("/api/admin/jobs")
def create_job(data: JobIn, request: Request, totp: str|None=None, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db); require_admin_totp(totp)
    if not data.original_url.startswith("https://"): raise HTTPException(400,"Job URL must use HTTPS")
    fingerprint=hashlib.sha256("|".join([data.employer.lower(),data.title.lower(),data.city.lower(),data.deadline]).encode()).hexdigest()
    job=db.scalar(select(Job).where(Job.fingerprint==fingerprint))
    if job: raise HTTPException(409,"Duplicate job already exists")
    job=Job(**data.model_dump(),fingerprint=fingerprint)
    db.add(job); db.flush(); audit(db,admin,"create","job",job.id); db.commit()
    return {"id":job.id,"status":job.status}

@app.post("/api/admin/roadmap")
def create_roadmap(data: RoadmapIn, request: Request, totp: str|None=None, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db); require_admin_totp(totp)
    if not data.source_url.startswith("https://"): raise HTTPException(400,"Source URL must use HTTPS")
    item=RoadmapStep(country_code=data.country_code.upper(),nationality=data.nationality,residence_country=data.residence_country,visa_type=data.visa_type,step_number=data.step_number,title_en=data.title_en,title_bn=data.title_bn,description_en=data.description_en,description_bn=data.description_bn,documents_json=json.dumps(data.documents,ensure_ascii=False),fee_amount=data.fee_amount,fee_currency=data.fee_currency,source_url=data.source_url,verified=data.verified)
    db.add(item); db.flush(); audit(db,admin,"create","roadmap_step",item.id,{"verified":item.verified}); db.commit()
    return {"id":item.id,"verified":item.verified}

@app.get("/api/admin/dashboard")
def admin_dashboard(request: Request, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db)
    return {"users":db.scalar(select(func.count(User.id))),"active_jobs":db.scalar(select(func.count(Job.id)).where(Job.status=="active")),"pending_visa_facts":db.scalar(select(func.count(VisaFact.id)).where(VisaFact.status=="pending")),"approved_visa_facts":db.scalar(select(func.count(VisaFact.id)).where(VisaFact.status=="approved")),"roadmap_steps":db.scalar(select(func.count(RoadmapStep.id))),"recent_audit":[{"action":x.action,"entity_type":x.entity_type,"entity_id":x.entity_id,"created_at":x.created_at} for x in db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(20)).all()]}

@app.get("/api/admin/users")
def admin_users(request: Request, q: str="", db: Session=Depends(get_db)):
    admin=require_admin_request(request,db)
    stmt=select(User)
    if q: stmt=stmt.where(User.email.ilike(f"%{q[:100]}%") | User.full_name.ilike(f"%{q[:100]}%"))
    return [{"id":u.id,"email":u.email,"full_name":u.full_name,"role":u.role,"is_verified":u.is_verified,"is_active":u.is_active,"created_at":u.created_at} for u in db.scalars(stmt.order_by(User.created_at.desc()).limit(100)).all()]

@app.get("/api/admin/ads")
def list_ads(request: Request, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db)
    return [{"id":a.id,"name":a.name,"network":a.network,"ad_type":a.ad_type,"placement":a.placement,"interval_minutes":a.interval_minutes,"enabled":a.enabled} for a in db.scalars(select(AdUnit)).all()]

@app.post("/api/admin/ads")
def create_ad(data: dict, request: Request, totp: str|None=None, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db); require_admin_totp(totp)
    allowed={"name","network","ad_type","placement","interval_minutes","code","enabled"}
    payload={k:v for k,v in data.items() if k in allowed}
    if payload.get("ad_type")=="popunder": log.warning("Pop-under ad enabled/configured; check ad network policies and user trust.")
    ad=AdUnit(**payload); db.add(ad); db.flush(); audit(db,admin,"create","ad_unit",ad.id); db.commit()
    return {"id":ad.id}

@app.get("/api/admin/backup")
def backup(request: Request, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db)
    tables={}
    for model in [User,Profile,Country,Source,VisaFact,Job,RoadmapStep,AdUnit,AuditLog]:
        rows=db.scalars(select(model)).all()
        tables[model.__tablename__]=[{col.name:(getattr(row,col.name).isoformat() if isinstance(getattr(row,col.name),datetime) else getattr(row,col.name)) for col in model.__table__.columns} for row in rows]
    raw=json.dumps({"schema_version":1,"created_at":datetime.now(timezone.utc).isoformat(),"tables":tables},ensure_ascii=False).encode()
    compressed=gzip.compress(raw)
    key=os.getenv("BACKUP_ENCRYPTION_KEY","")
    if key:
        from cryptography.fernet import Fernet
        compressed=Fernet(key.encode()).encrypt(compressed)
        name="europath-backup.json.gz.fernet"
    else:
        name="europath-backup.json.gz"
        log.warning("Backup exported without encryption because BACKUP_ENCRYPTION_KEY is not configured.")
    return StreamingResponse(io.BytesIO(compressed),media_type="application/octet-stream",headers={"Content-Disposition":f'attachment; filename="{name}"'})

@app.get("/api/admin/sources")
def list_sources(request: Request, db: Session=Depends(get_db)):
    admin=require_admin_request(request,db)
    return [{"id":s.id,"name":s.name,"url":s.url,"source_type":s.source_type,"enabled":s.enabled,"last_checked_at":s.last_checked_at} for s in db.scalars(select(Source)).all()]
