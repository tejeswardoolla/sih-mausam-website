"""Regression tests for Open-Meteo location search and normalized weather responses."""
import os
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).parents[1]))
from weather_service import condition_for


BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def test_hyderabad_geocoding_returns_indian_result():
    response = requests.get(
        f"{BASE_URL}/api/locations", params={"q": "Hyderabad", "country_code": "IN"}, timeout=20
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert results
    assert any(item["name"].lower() == "hyderabad" and item["country_code"] == "IN" for item in results)


def test_rajahmundry_weather_has_live_current_hourly_and_weekly_data():
    response = requests.get(
        f"{BASE_URL}/api/weather",
        params={"lat": 17.0005, "lon": 81.804, "location": "Rajahmundry"},
        timeout=30,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "open-meteo"
    assert body["location"]["name"] == "Rajahmundry"
    assert {"temperature_c", "feels_like_c", "humidity", "wind_kmh", "condition"}.issubset(body["current"])
    assert len(body["hourly"]) == 24
    assert len(body["daily"]) == 7


def test_clear_sky_wmo_code_maps_to_sunny():
    assert condition_for(0)[0] == "sunny"


@pytest.mark.parametrize("query", ["", "x"])
def test_location_search_rejects_too_short_queries(query):
    response = requests.get(f"{BASE_URL}/api/locations", params={"q": query}, timeout=15)
    assert response.status_code == 422