# Mausam — Personalized Weather Intelligence (SIH26076)

## Product
Personalized homepage for the India Meteorological Department (IMD, MoES). Same live weather, different actionable homepage per persona (Fitness, Health, Travel, Beach, Family, Agriculture, Commute, Events).

## Stack
- Frontend: React + Framer Motion + Lucide + custom CSS (storm-glass, IMD, midnight themes).
- Backend: FastAPI + httpx (Open-Meteo forecast + geocoding, no keys).
- DB: MongoDB (only status collection currently; weather is provider-backed).

## Architecture
- Backend `/api/weather` → `weather_service.fetch_weather` normalizes Open-Meteo into `{timezone, timezone_abbreviation, utc_offset_seconds, source, fetched_at, current{sunrise,sunset,is_day,...}, hourly[24], daily[7 with sunrise/sunset/precipitation_sum_mm]}`.
- Backend `/api/locations` → Open-Meteo geocoding, 10 results.
- Frontend service modules:
  - `services/weatherFormatters.js` — Intl-based local date/time/weekday/hour, `findNowIndex`, `formatSunTime`.
  - `services/recommendationEngine.js` — persona-aware `buildRecommendation` using next 6/12/24 hourly rows, best 2–3h outdoor window, weekend/school-run awareness.
  - `services/weatherVisualMapper.js` — atmosphere class from condition + is_day + sunrise/sunset.
- Frontend `App.js` — Hero, Fitness/Health/Travel/Beach/Generic cards, Hourly + `HourlyDetail` 24h modal (auto-scrolls to NOW), Weekly + sun-row, WeatherMap (visual prototype), Recommendation, Alerts driven by insight severity, Location/theme/persona/customize controls.

## Implemented (latest iteration)
- Single source of truth `selectedPlace` drives hero, map, saved list, greeting, date/time, recommendation and forecasts.
- Real timezone-aware local time/date; 30s live clock tick. No raw ISO strings anywhere.
- 24-hour modal with `NOW` highlight + auto-scroll into view.
- Weekday-abbreviated 7-day forecast + real sunrise/sunset.
- Persona-specific look-ahead recommendations with `bestWindow`, `whyMetrics`, severity chip.
- Truthful loading/live/unavailable status and honest N/A for AQI/UV/pollen/tide/waves.
- Backend enriched: sunrise/sunset, hourly humidity + is_day, daily precipitation_sum_mm, timezone_abbreviation, utc_offset_seconds, fetched_at.
- Logger defined before use; CORS retained.

## Known limitations (transparent in UI)
- AQI / UV / Pollen / Tide / Waves / Soil moisture / Official IMD warnings: NOT sourced yet.
- Weather map radar is a visual prototype (labelled in UI).

## Backlog
- P1: Real map layers (rain / wind / satellite) once a provider is chosen.
- P1: Integrate an official IMD warning feed when access is available.
- P1: Add AQI/UV/pollen from a dedicated environmental provider behind the same normalized contract.
- P2: Saved location management (remove/reorder/favourite).
- P2: Shareable personalized weather plan card.
