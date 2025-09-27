"""Tests for the main FastAPI application."""

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_check():
    """Test the health check endpoint."""
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_version():
    """Test the version endpoint."""
    response = client.get("/version")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert data["version"] == "0.1.0"