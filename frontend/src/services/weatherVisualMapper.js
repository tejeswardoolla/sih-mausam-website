// Comprehensive weather-to-visual mapper.
// Determines atmosphere (condition + time-of-day), day/night, and intensity signals
// (rain, wind, lightning, fog, cloud) from the normalized Open-Meteo weather.

import { getLocalParts } from "./weatherFormatters";

const NIGHTIFY = new Set(["sunny", "partly-cloudy"]);

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function decimalHour(iso, fallback) {
  if (!iso || iso.length < 16) return fallback;
  const h = Number(iso.slice(11, 13));
  const m = Number(iso.slice(14, 16));
  if (!Number.isFinite(h)) return fallback;
  return h + (Number.isFinite(m) ? m / 60 : 0);
}

function slotFor(hour, sunrise, sunset) {
  if (hour < sunrise - 0.5 || hour >= sunset + 1) return "night";
  if (hour < sunrise + 0.5) return "dawn";
  if (hour < 11) return "morning";
  if (hour < sunset - 2) return "midday";
  if (hour < sunset - 0.5) return "afternoon";
  if (hour < sunset + 0.5) return "golden";
  return "dusk";
}

export function deriveAtmosphere(weather) {
  const current = weather?.current;
  if (!current) {
    return {
      condition: "partly-cloudy",
      atmosphere: "partly-cloudy",
      timeOfDay: "midday",
      isNight: false,
      dataAtmosphere: "partly-cloudy-midday",
      intensity: { rain: 0, wind: 0.3, lightning: 0, fog: 0, cloud: 0.5 },
      sunriseHour: 6,
      sunsetHour: 18,
      currentHour: 12,
    };
  }
  const cond = current.condition || "partly-cloudy";
  const tz = weather?.timezone || "UTC";
  const local = getLocalParts(tz);
  const currentHour = local.hour + local.minute / 60;
  const sunriseHour = decimalHour(current.sunrise, 6);
  const sunsetHour = decimalHour(current.sunset, 18);
  const providerNight = Number(current.is_day) === 0;
  const clockNight = currentHour < sunriseHour || currentHour >= sunsetHour;
  const isNight = providerNight || clockNight;
  const timeOfDay = isNight ? "night" : slotFor(currentHour, sunriseHour, sunsetHour);

  let atmosphere = cond;
  if (isNight && NIGHTIFY.has(cond)) atmosphere = "night";

  const next6 = (weather.hourly || []).slice(0, 6);
  const currentPrecip = safeNum(current.precipitation_mm);
  const maxRainMm = Math.max(currentPrecip, ...next6.map((r) => safeNum(r.precipitation_mm)));
  const maxRainProb = Math.max(0, ...next6.map((r) => safeNum(r.precipitation_probability)));
  const rainIntensity =
    cond === "storm" ? Math.max(0.55, Math.min(1, maxRainMm / 5, maxRainProb / 80))
    : cond === "rain" ? Math.max(0.35, Math.min(1, maxRainMm / 6, maxRainProb / 100))
    : maxRainProb >= 45 ? Math.min(0.28, maxRainProb / 250)
    : 0;
  const windIntensity = Math.min(1, safeNum(current.wind_kmh) / 40);
  const lightningIntensity = cond === "storm" ? 1 : 0;
  const fogIntensity = cond === "fog" ? 1 : 0;
  const cloudIntensity = cond === "storm" || cond === "rain" || cond === "fog"
    ? 1
    : cond === "cloudy" ? 0.85
    : cond === "partly-cloudy" ? 0.55
    : 0.2;

  return {
    condition: cond,
    atmosphere,
    timeOfDay,
    isNight,
    dataAtmosphere: `${atmosphere}-${timeOfDay}`,
    sunriseHour,
    sunsetHour,
    currentHour,
    intensity: {
      rain: rainIntensity,
      wind: windIntensity,
      lightning: lightningIntensity,
      fog: fogIntensity,
      cloud: cloudIntensity,
    },
  };
}
