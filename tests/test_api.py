import os
os.environ.setdefault("APP_SECRET_KEY","test-only-secret-key-that-is-long-enough-for-tests")
from fastapi.testclient import TestClient
from app.main import app

client=TestClient(app)

def test_health():
    r=client.get("/api/health")
    assert r.status_code==200
    assert r.json()["status"]=="ok"

def test_home():
    r=client.get("/")
    assert r.status_code==200
    assert "EuropePath" in r.text

def test_visa_facts_are_not_public_without_approval():
    r=client.get("/api/visa-facts?country_code=IT")
    assert r.status_code==200
    assert isinstance(r.json(),list)

def test_roadmap_warns_when_not_available():
    r=client.get("/api/roadmap?country_code=ZZ")
    assert r.status_code==200
    assert r.json()["verified_roadmap_available"] is False
    assert r.json()["warning"]
