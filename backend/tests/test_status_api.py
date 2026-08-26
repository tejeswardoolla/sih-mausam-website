"""Regression coverage for the starter status API used by the Mausam app."""
import os

import requests


BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def test_status_create_and_list_persisted_record():
    client = requests.Session()
    payload = {"client_name": "TEST_mausam_review"}
    created = client.post(f"{BASE_URL}/api/status", json=payload, timeout=15)
    assert created.status_code == 200
    body = created.json()
    assert body["client_name"] == payload["client_name"]
    assert isinstance(body["id"], str)
    assert "timestamp" in body

    listed = client.get(f"{BASE_URL}/api/status", timeout=15)
    assert listed.status_code == 200
    records = listed.json()
    assert any(item["id"] == body["id"] and item["client_name"] == payload["client_name"] for item in records)