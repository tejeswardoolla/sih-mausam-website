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
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day",
        "hourly": "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,weather_code,is_day",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code,sunrise,sunset",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(FORECAST_URL, params=params)
        response.raise_for_status()
        raw = response.json()

    current = raw.get("current", {})
    current_is_day = bool(current.get("is_day", 1))
    current_condition, current_label = condition_for(current.get("weather_code"), current_is_day)

    hourly_raw = raw.get("hourly", {})
    hourly_times = hourly_raw.get("time", [])
    hourly: list[dict[str, Any]] = []
    for index, timestamp in enumerate(hourly_times[:24]):
        code = _pick(hourly_raw, "weather_code", index)
        is_day_hour = bool(_pick(hourly_raw, "is_day", index, default=1))
        condition, label = condition_for(code, is_day_hour)
        hourly.append({
            "time": timestamp,
            "temperature_c": _pick(hourly_raw, "temperature_2m", index),
            "humidity": _pick(hourly_raw, "relative_humidity_2m", index),
            "precipitation_probability": _pick(hourly_raw, "precipitation_probability", index, default=0),
            "precipitation_mm": _pick(hourly_raw, "precipitation", index, default=0),
            "wind_kmh": _pick(hourly_raw, "wind_speed_10m", index, default=0),
            "wind_direction": _pick(hourly_raw, "wind_direction_10m", index, default=0),
            "weather_code": code, "is_day": 1 if is_day_hour else 0,
            "condition": condition, "condition_label": label,
        })

    daily_raw = raw.get("daily", {})
    daily: list[dict[str, Any]] = []
    for index, date in enumerate(daily_raw.get("time", [])):
        code = _pick(daily_raw, "weather_code", index)
        condition, label = condition_for(code, True)
        daily.append({
            "date": date,
            "high_c": _pick(daily_raw, "temperature_2m_max", index),
            "low_c": _pick(daily_raw, "temperature_2m_min", index),
            "rain_probability": _pick(daily_raw, "precipitation_probability_max", index, default=0),
            "precipitation_sum_mm": _pick(daily_raw, "precipitation_sum", index, default=0),
            "sunrise": _pick(daily_raw, "sunrise", index),
            "sunset": _pick(daily_raw, "sunset", index),
            "weather_code": code, "condition": condition, "condition_label": label,
        })

    normalized = {
        "location": {"name": location, "latitude": latitude, "longitude": longitude},
        "timezone": raw.get("timezone", "auto"),
        "timezone_abbreviation": raw.get("timezone_abbreviation"),
        "utc_offset_seconds": raw.get("utc_offset_seconds"),
        "source": "open-meteo",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "current": {
            "temperature_c": current.get("temperature_2m"),
            "feels_like_c": current.get("apparent_temperature"),
            "humidity": current.get("relative_humidity_2m"),
            "wind_kmh": current.get("wind_speed_10m"),
            "wind_direction": current.get("wind_direction_10m", 0),
            "precipitation_mm": current.get("precipitation", 0),
            "weather_code": current.get("weather_code"),
            "is_day": 1 if current_is_day else 0,
            "condition": current_condition, "condition_label": current_label,
            "sunrise": daily[0]["sunrise"] if daily else None,
            "sunset": daily[0]["sunset"] if daily else None,
            "observed_at": current.get("time"),
        },
        "hourly": hourly, "daily": daily,
    }
    _forecast_cache[cache_key] = (time.time() + 300, normalized)
    return normalized


def _pick(source: dict[str, Any], key: str, index: int, default: Any = None) -> Any:
    series = source.get(key)
    if not isinstance(series, list) or index >= len(series):
        return default
    value = series[index]
    return default if value is None else value
