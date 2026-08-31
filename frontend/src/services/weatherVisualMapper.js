// Maps normalized Open-Meteo weather + selected-location local time
// into the CSS atmosphere class already used by the hero (weather-<state>).

import { getLocalParts } from "./weatherFormatters";

const NIGHTIFY = new Set(["sunny", "partly-cloudy"]);

export function deriveAtmosphere(weather) {
  const current = weather?.current;
  if (!current) return { atmosphere: "partly-cloudy", isNight: false, condition: "partly-cloudy" };
  const cond = current.condition || "partly-cloudy";
  const tz = weather?.timezone || "UTC";
  const local = getLocalParts(tz);
  const sunriseHour = current.sunrise ? Number(current.sunrise.slice(11, 13)) : 6;
  const sunsetHour = current.sunset ? Number(current.sunset.slice(11, 13)) : 18;
  const providerNight = Number(current.is_day) === 0;
  const clockNight = local.hour < sunriseHour || local.hour >= sunsetHour;
  const isNight = providerNight || clockNight;
  let atmosphere = cond;
  if (isNight && NIGHTIFY.has(cond)) atmosphere = "night";
  return { atmosphere, isNight, condition: cond };
}
