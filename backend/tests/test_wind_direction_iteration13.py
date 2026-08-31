"""Iteration 13: verify wind_direction present in current + hourly for Indian cities."""
import os
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

CITIES = [
    ("Rajahmundry", 17.0005, 81.8040),
    ("Hyderabad", 17.385, 78.4867),
    ("Mumbai", 19.0760, 72.8777),
]


@pytest.mark.parametrize("name,lat,lon", CITIES)
def test_wind_direction_present(name, lat, lon):
    r = requests.get(f"{BASE_URL}/api/weather",
                     params={"lat": lat, "lon": lon, "location": name}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    wd = body["current"].get("wind_direction")
    assert wd is not None, f"{name}: current.wind_direction missing"
    assert isinstance(wd, (int, float)), f"{name}: wind_direction not numeric ({type(wd)})"
    assert 0 <= wd <= 360, f"{name}: wind_direction out of range: {wd}"

    # Hourly must have wind_direction too
    for row in body["hourly"]:
        assert "wind_direction" in row, f"{name}: hourly missing wind_direction"
        assert isinstance(row["wind_direction"], (int, float))
        assert 0 <= row["wind_direction"] <= 360
