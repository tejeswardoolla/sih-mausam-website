"""Iteration 8 regression: verify normalized payload keys, timezone correctness across cities."""
import os
import re
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

CITIES = [
    ("Rajahmundry", 17.0005, 81.8040, "Asia/Kolkata"),
    ("Hyderabad", 17.385, 78.4867, "Asia/Kolkata"),
    ("Mumbai", 19.0760, 72.8777, "Asia/Kolkata"),
    ("London", 51.5074, -0.1278, "Europe/London"),
]

REQUIRED_TOP = {"location", "timezone", "timezone_abbreviation", "utc_offset_seconds",
                "source", "fetched_at", "current", "hourly", "daily"}
REQUIRED_CURRENT = {"temperature_c", "humidity", "wind_kmh", "condition", "condition_label",
                    "is_day", "sunrise", "sunset"}
REQUIRED_HOURLY = {"time", "temperature_c", "humidity", "precipitation_probability",
                   "precipitation_mm", "wind_kmh", "weather_code", "is_day",
                   "condition", "condition_label"}
REQUIRED_DAILY = {"date", "high_c", "low_c", "rain_probability", "precipitation_sum_mm",
                  "sunrise", "sunset", "condition"}


@pytest.mark.parametrize("name,lat,lon,tz", CITIES)
def test_city_weather_shape_and_timezone(name, lat, lon, tz):
    r = requests.get(f"{BASE_URL}/api/weather",
                     params={"lat": lat, "lon": lon, "location": name}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert REQUIRED_TOP.issubset(body.keys()), f"missing top keys: {REQUIRED_TOP - body.keys()}"
    assert body["source"] == "open-meteo"
    assert body["timezone"] == tz, f"expected {tz} got {body['timezone']}"
    assert body["utc_offset_seconds"] is not None
    assert body["timezone_abbreviation"]

    assert REQUIRED_CURRENT.issubset(body["current"].keys())
    assert body["current"]["temperature_c"] is not None
    assert -50 < body["current"]["temperature_c"] < 60
    # sunrise/sunset ISO strings
    assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", body["current"]["sunrise"])

    assert len(body["hourly"]) == 24
    for row in body["hourly"]:
        assert REQUIRED_HOURLY.issubset(row.keys())
        assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", row["time"])
        assert row["is_day"] in (0, 1)

    assert len(body["daily"]) == 7
    for row in body["daily"]:
        assert REQUIRED_DAILY.issubset(row.keys())
        assert row["high_c"] is not None and row["low_c"] is not None


def test_locations_search_returns_indian_cities():
    for q in ["Rajahmundry", "Hyderabad", "Mumbai"]:
        r = requests.get(f"{BASE_URL}/api/locations",
                         params={"q": q, "country_code": "IN"}, timeout=20)
        assert r.status_code == 200, f"{q}: {r.text}"
        results = r.json()["results"]
        assert results, f"No results for {q}"
        top = results[0]
        assert "latitude" in top and "longitude" in top and "timezone" in top
        assert any(item["name"].lower() == q.lower() for item in results)


def test_weather_validation_errors():
    # missing lat
    r = requests.get(f"{BASE_URL}/api/weather", params={"lon": 78, "location": "X"}, timeout=10)
    assert r.status_code == 422
    # out-of-range lat
    r = requests.get(f"{BASE_URL}/api/weather",
                     params={"lat": 999, "lon": 78, "location": "X"}, timeout=10)
    assert r.status_code == 422
