from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"

WMO_CONDITIONS = {
    0: ("sunny", "Clear sky"), 1: ("sunny", "Mainly clear"), 2: ("partly-cloudy", "Partly cloudy"),
    3: ("cloudy", "Overcast"), 45: ("fog", "Fog"), 48: ("fog", "Rime fog"),
    51: ("rain", "Light drizzle"), 53: ("rain", "Drizzle"), 55: ("rain", "Dense drizzle"),
    56: ("rain", "Freezing drizzle"), 57: ("rain", "Freezing drizzle"), 61: ("rain", "Light rain"),
    63: ("rain", "Rain"), 65: ("rain", "Heavy rain"), 66: ("rain", "Freezing rain"),
    67: ("rain", "Heavy freezing rain"), 71: ("cloudy", "Light snow"), 73: ("cloudy", "Snow"),
    75: ("cloudy", "Heavy snow"), 77: ("cloudy", "Snow grains"), 80: ("rain", "Rain showers"),
    81: ("rain", "Rain showers"), 82: ("rain", "Heavy rain showers"), 85: ("cloudy", "Snow showers"),
    86: ("cloudy", "Heavy snow showers"), 95: ("storm", "Thunderstorm"),
    96: ("storm", "Thunderstorm with hail"), 99: ("storm", "Thunderstorm with hail"),
}

_forecast_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def condition_for(code: int | None, is_day: bool = True) -> tuple[str, str]:
    condition, label = WMO_CONDITIONS.get(code if code is not None else 3, ("cloudy", "Cloudy"))
    if not is_day and condition in {"sunny", "partly-cloudy"}:
        return "night", "Clear night"
    return condition, label


async def geocode(query: str, country_code: str | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"name": query.strip(), "count": 10, "language": "en", "format": "json"}
    if country_code:
        params["countryCode"] = country_code.upper()
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(GEOCODING_URL, params=params)
        response.raise_for_status()
        payload = response.json()
    return [
        {
            "id": place.get("id"), "name": place.get("name"), "country": place.get("country"),
            "country_code": place.get("country_code"), "admin1": place.get("admin1"),
            "latitude": place.get("latitude"), "longitude": place.get("longitude"),
            "timezone": place.get("timezone", "auto"),
        }
        for place in payload.get("results", [])
    ]


async def fetch_weather(latitude: float, longitude: float, location: str) -> dict[str, Any]:
    cache_key = f"{latitude:.4f}:{longitude:.4f}"
    cached = _forecast_cache.get(cache_key)
    if cached and cached[0] > time.time():
        return cached[1]
    params = {
        "latitude": latitude, "longitude": longitude, "timezone": "auto", "forecast_days": 7,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
        "hourly": "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(FORECAST_URL, params=params)
        response.raise_for_status()
        raw = response.json()
    current = raw.get("current", {})
    current_condition, current_label = condition_for(current.get("weather_code"), bool(current.get("is_day", 1)))
    hourly_raw = raw.get("hourly", {})
    hourly = []
    for index, timestamp in enumerate(hourly_raw.get("time", [])[:24]):
        code = hourly_raw.get("weather_code", [None] * 24)[index]
        condition, label = condition_for(code, True)
        hourly.append({
            "time": timestamp, "temperature_c": hourly_raw.get("temperature_2m", [None] * 24)[index],
            "precipitation_probability": hourly_raw.get("precipitation_probability", [0] * 24)[index],
            "precipitation_mm": hourly_raw.get("precipitation", [0] * 24)[index],
            "wind_kmh": hourly_raw.get("wind_speed_10m", [0] * 24)[index],
            "weather_code": code, "condition": condition, "condition_label": label,
        })
    daily_raw = raw.get("daily", {})
    daily = []
    for index, date in enumerate(daily_raw.get("time", [])):
        code = daily_raw.get("weather_code", [None] * 7)[index]
        condition, label = condition_for(code, True)
        daily.append({
            "date": date, "high_c": daily_raw.get("temperature_2m_max", [None] * 7)[index],
            "low_c": daily_raw.get("temperature_2m_min", [None] * 7)[index],
            "rain_probability": daily_raw.get("precipitation_probability_max", [0] * 7)[index],
            "weather_code": code, "condition": condition, "condition_label": label,
        })
    normalized = {
        "location": {"name": location, "latitude": latitude, "longitude": longitude},
        "timezone": raw.get("timezone", "auto"), "source": "open-meteo",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "current": {
            "temperature_c": current.get("temperature_2m"), "feels_like_c": current.get("apparent_temperature"),
            "humidity": current.get("relative_humidity_2m"), "wind_kmh": current.get("wind_speed_10m"),
            "precipitation_mm": current.get("precipitation", 0), "weather_code": current.get("weather_code"),
            "is_day": current.get("is_day", 1), "condition": current_condition, "condition_label": current_label,
        },
        "hourly": hourly, "daily": daily,
    }
    _forecast_cache[cache_key] = (time.time() + 300, normalized)
    return normalized