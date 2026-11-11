import pytest
import httpx

BASE_URL = "http://127.0.0.1:8000"

def test_health():
    res = httpx.get(f"{BASE_URL}/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["database"] == "postgresql"
    assert data["vector_db"] == "qdrant"

def test_models():
    res = httpx.get(f"{BASE_URL}/api/models")
    assert res.status_code == 200
    data = res.json()
    assert "models" in data
    assert len(data["models"]) > 0

def test_hardware():
    res = httpx.get(f"{BASE_URL}/api/hardware")
    assert res.status_code == 200
    data = res.json()
    assert "gpu" in data
    assert "ram" in data

def test_conversation_lifecycle():
    # 1. Create
    res = httpx.post(f"{BASE_URL}/api/conversations", json={"title": "PyTest Automated Conversation", "model": "gemma3:latest"})
    assert res.status_code == 200
    conv = res.json()
    conv_id = conv["id"]

    # 2. Get
    res = httpx.get(f"{BASE_URL}/api/conversations/{conv_id}")
    assert res.status_code == 200
    assert res.json()["title"] == "PyTest Automated Conversation"

    # 3. Patch
    res = httpx.patch(f"{BASE_URL}/api/conversations/{conv_id}", json={"title": "Updated Title"})
    assert res.status_code == 200

    # 4. Delete
    res = httpx.delete(f"{BASE_URL}/api/conversations/{conv_id}")
    assert res.status_code == 200

