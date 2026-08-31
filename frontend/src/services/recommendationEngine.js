// Persona-aware recommendation engine.
// Consumes normalized Open-Meteo weather and returns a structured insight
// that combines current conditions with the next 6–12 hourly rows.

import { findNowIndex, formatHourLabel, formatSunTime, getLocalParts, isWeekend } from "./weatherFormatters";

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeHour(iso) {
  if (!iso || iso.length < 13) return null;
  const h = Number(iso.slice(11, 13));
  return Number.isFinite(h) ? h : null;
}

function summarise(rows) {
  if (!rows.length) return { maxRain: 0, maxWind: 0, maxTemp: 0, minTemp: 0, totalMm: 0, hasStorm: false, hasRain: false };
  const temps = rows.map((r) => safeNum(r.temperature_c));
  return {
    maxRain: Math.max(0, ...rows.map((r) => safeNum(r.precipitation_probability))),
    maxWind: Math.max(0, ...rows.map((r) => safeNum(r.wind_kmh))),
    maxTemp: Math.max(...temps),
    minTemp: Math.min(...temps),
    totalMm: rows.reduce((s, r) => s + safeNum(r.precipitation_mm), 0),
    hasStorm: rows.some((r) => r.condition === "storm"),
    hasRain: rows.some((r) => r.condition === "rain"),
  };
}

function filterByHourRange(rows, minHourInclusive, maxHourExclusive) {
  return rows.filter((r) => {
    const h = Number((r.time || "").slice(11, 13));
    return h >= minHourInclusive && h < maxHourExclusive;
  });
}

function bestOutdoorWindow(rows, { minTemp = 12, maxTemp = 32, rainCap = 30, windCap = 28, span = 3, maxEndHour = 18 } = {}) {
  if (rows.length < span) return null;
  let best = null;
  for (let i = 0; i <= rows.length - span; i += 1) {
    const slice = rows.slice(i, i + span);
    const endHour = Number((slice[slice.length - 1].time || "").slice(11, 13));
    if (!Number.isFinite(endHour) || endHour > maxEndHour) continue;
    const rain = Math.max(...slice.map((r) => safeNum(r.precipitation_probability)));
    const wind = Math.max(...slice.map((r) => safeNum(r.wind_kmh)));
    const temp = slice.reduce((s, r) => s + safeNum(r.temperature_c), 0) / slice.length;
    if (rain > rainCap || wind > windCap || temp < minTemp || temp > maxTemp) continue;
    const score = 100 - rain * 0.9 - Math.max(0, temp - 28) * 3 - Math.max(0, wind - 20) * 2;
    if (!best || score > best.score) best = { i, rain, wind, temp, score, start: slice[0].time, end: slice[slice.length - 1].time };
  }
  return best;
}

function windowLabel(win) {
  if (!win) return null;
  return `${formatHourLabel(win.start)} – ${formatHourLabel(win.end)}`;
}

function metric(icon, label, value) { return { icon, label, value }; }

export function buildRecommendation(personaId, weather, place) {
  if (!weather || !weather.current) return null;
  const tz = weather.timezone || place?.timezone || "Asia/Kolkata";
  const nowIdx = findNowIndex(weather.hourly, tz);
  const rows = (weather.hourly || []).slice(nowIdx);
  const next6 = rows.slice(0, 6);
  const next12 = rows.slice(0, 12);
  const next24 = rows.slice(0, 24);
  const s6 = summarise(next6);
  const s12 = summarise(next12);
  const s24 = summarise(next24);
  const cur = weather.current;
  const curTemp = safeNum(cur.temperature_c);
  const curWind = safeNum(cur.wind_kmh);
  const local = getLocalParts(tz);
  const isMorning = local.hour < 12;

  const commonMetrics = [
    metric("rain", "Rain (12h)", `${Math.round(s12.maxRain)}%`),
    metric("temp", "Temperature", `${Math.round(curTemp)}°C`),
    metric("wind", "Wind", `${Math.round(curWind)} km/h`),
  ];

  // Priority 1: severe / storm
  if (cur.condition === "storm" || s6.hasStorm) {
    return {
      severity: "severe",
      headline: "Thunderstorm signals detected",
      message: `Thunderstorm conditions are present in the ${cur.condition === "storm" ? "current feed" : "next 6 hours"}. Avoid open ground and delay outdoor plans until the system passes.`,
      bestWindow: null,
      whyMetrics: [
        metric("rain", "Rain (6h)", `${Math.round(s6.maxRain)}%`),
        metric("wind", "Peak wind", `${Math.round(s6.maxWind)} km/h`),
        metric("temp", "Temp now", `${Math.round(curTemp)}°C`),
      ],
    };
  }

  const bestFit = bestOutdoorWindow(next12);

  switch (personaId) {
    case "fitness": {
      const cool = bestOutdoorWindow(next12, { minTemp: 12, maxTemp: 29, rainCap: 20, windCap: 24, span: 2 });
      const chosen = cool || bestFit;
      if (chosen) {
        return {
          severity: "info",
          headline: "Best window to move",
          message: `${windowLabel(chosen)} looks comfortable for outdoor training — around ${Math.round(chosen.temp)}° with ${Math.round(chosen.rain)}% rain risk.`,
          bestWindow: windowLabel(chosen),
          whyMetrics: [
            metric("temp", "Window temp", `${Math.round(chosen.temp)}°C`),
            metric("rain", "Rain in window", `${Math.round(chosen.rain)}%`),
            metric("wind", "Wind in window", `${Math.round(chosen.wind)} km/h`),
          ],
        };
      }
      return {
        severity: s12.maxRain >= 50 ? "watch" : "info",
        headline: s12.maxRain >= 50 ? "Rain may cut activity short" : "Steady conditions for a light session",
        message: s12.maxRain >= 50
          ? `Rain probability climbs to ${Math.round(s12.maxRain)}% in the next 12 hours. Keep sessions shorter and stay near shelter.`
          : `Conditions stay near ${Math.round(curTemp)}° with modest wind. A light session is fine, hydrate well.`,
        bestWindow: null,
        whyMetrics: commonMetrics,
      };
    }
    case "health": {
      const hotSpell = next12.filter((r) => safeNum(r.temperature_c) >= 34).length;
      const humidNow = safeNum(cur.humidity);
      const humidHigh = humidNow >= 78 || Math.max(...next6.map((r) => safeNum(r.humidity))) >= 80;
      const rainSoon = s6.maxRain >= 55;
      const feels = safeNum(cur.feels_like_c, curTemp);
      let status = "Comfortable";
      if (cur.condition === "storm" || s6.hasStorm) status = "Caution";
      else if (hotSpell >= 2 || feels >= 36) status = "Heat Risk";
      else if (rainSoon) status = "Rain Risk";
      else if (humidHigh) status = "High Humidity";
      else if (curWind >= 30) status = "Caution";

      if (hotSpell >= 2 || humidHigh || rainSoon || feels >= 36) {
        return {
          severity: "watch",
          status,
          headline: rainSoon ? "Rain probability rising soon"
            : humidHigh ? "Muggy stretch ahead"
            : "Heat load rising",
          message: rainSoon
            ? `Rain probability reaches ${Math.round(s6.maxRain)}% within 6 hours. Consider indoor activity or reschedule outdoor plans.`
            : humidHigh
              ? `Humidity stays elevated (peaking near ${Math.round(Math.max(...next6.map((r) => safeNum(r.humidity))))}%). Stay hydrated during outdoor activity.`
              : `Feels-like climbs to ${Math.round(Math.max(...next12.map((r) => safeNum(r.feels_like_c, safeNum(r.temperature_c)))))}° in the next 12 hours. Limit prolonged outdoor activity during the hottest part of the day.`,
          bestWindow: bestFit ? windowLabel(bestFit) : null,
          whyMetrics: [
            metric("temp", "Feels like", `${Math.round(feels)}°C`),
            metric("humidity", "Humidity now", `${Math.round(humidNow)}%`),
            metric("rain", "Rain (6h)", `${Math.round(s6.maxRain)}%`),
          ],
        };
      }
      return {
        severity: "info",
        status,
        headline: local.hour < 12 ? "Comfortable outdoor conditions this morning" : "Environment is manageable",
        message: `Air feels around ${Math.round(feels)}° with ${Math.round(humidNow)}% humidity and ${Math.round(curWind)} km/h wind. Standard precautions are enough.`,
        bestWindow: bestFit ? windowLabel(bestFit) : null,
        whyMetrics: [
          metric("temp", "Feels like", `${Math.round(feels)}°C`),
          metric("humidity", "Humidity", `${Math.round(humidNow)}%`),
          metric("wind", "Wind", `${Math.round(curWind)} km/h`),
        ],
      };
    }
    case "travel": {
      const heavy = next24.reduce((s, r) => s + safeNum(r.precipitation_mm), 0);
      const sunriseHour = safeHour(weather?.current?.sunrise) ?? 6;
      const sunsetHour = safeHour(weather?.current?.sunset) ?? 19;
      const daylightRows = filterByHourRange(rows, sunriseHour, sunsetHour);
      const bestTravel = bestOutdoorWindow(daylightRows, { minTemp: 10, maxTemp: 36, rainCap: 35, windCap: 32, span: 3 });
      if (s12.maxRain >= 60 || heavy >= 10) {
        return {
          severity: "watch",
          headline: "Carry rain protection",
          message: `Rain probability climbs to ${Math.round(s12.maxRain)}% within the next 12 hours (~${heavy.toFixed(1)} mm expected in 24h). Keep travel documents in a waterproof pouch.`,
          bestWindow: bestTravel ? windowLabel(bestTravel) : null,
          whyMetrics: [
            metric("rain", "Peak rain (12h)", `${Math.round(s12.maxRain)}%`),
            metric("rain", "Total 24h", `${heavy.toFixed(1)} mm`),
            metric("wind", "Peak wind", `${Math.round(s24.maxWind)} km/h`),
          ],
        };
      }
      if (s12.maxWind >= 30) {
        return {
          severity: "watch",
          headline: "Stronger winds expected",
          message: `Winds pick up to ${Math.round(s12.maxWind)} km/h during your journey window. Secure loose items and expect slower travel.`,
          bestWindow: bestTravel ? windowLabel(bestTravel) : null,
          whyMetrics: [
            metric("wind", "Peak wind (12h)", `${Math.round(s12.maxWind)} km/h`),
            metric("rain", "Rain (12h)", `${Math.round(s12.maxRain)}%`),
            metric("temp", "Temperature", `${Math.round(curTemp)}°C`),
          ],
        };
      }
      return {
        severity: "info",
        headline: "Good travel conditions",
        message: bestTravel
          ? `Weather stays mostly stable — around ${Math.round(curTemp)}° with rain risk under ${Math.round(s12.maxRain)}%. Best travel stretch: ${windowLabel(bestTravel)}.`
          : `Weather stays mostly stable — around ${Math.round(curTemp)}° with rain risk under ${Math.round(s12.maxRain)}%. Travel any time in daylight; no clear travel window stood out.`,
        bestWindow: bestTravel ? windowLabel(bestTravel) : null,
        whyMetrics: commonMetrics,
      };
    }
    case "beach": {
      if (s6.maxWind >= 28 || s12.maxRain >= 50) {
        return {
          severity: "watch",
          headline: "Rough conditions likely",
          message: `Winds up to ${Math.round(s6.maxWind)} km/h and rain risk near ${Math.round(s12.maxRain)}% suggest a quieter beach visit later.`,
          bestWindow: null,
          whyMetrics: [
            metric("wind", "Peak wind (6h)", `${Math.round(s6.maxWind)} km/h`),
            metric("rain", "Rain (12h)", `${Math.round(s12.maxRain)}%`),
            metric("temp", "Air temp", `${Math.round(curTemp)}°C`),
          ],
        };
      }
      return {
        severity: "info",
        headline: "Pleasant coastal window",
        message: `Air is around ${Math.round(curTemp)}° with light wind. Water temperature, waves and tides are not sourced by this feed.`,
        bestWindow: bestFit ? windowLabel(bestFit) : null,
        whyMetrics: commonMetrics,
      };
    }
    case "family": {
      const weekend = isWeekend(tz);
      if (!weekend && isMorning && local.hour <= 9) {
        return {
          severity: s6.maxRain >= 50 ? "watch" : "info",
          headline: s6.maxRain >= 50 ? "School run may see rain" : "Comfortable school-run window",
          message: s6.maxRain >= 50
            ? `Rain probability peaks at ${Math.round(s6.maxRain)}% before 9:00. Send umbrellas or rain covers with the kids.`
            : `Rain risk stays under ${Math.round(s6.maxRain)}% for the next few hours. A regular school run should be fine.`,
          bestWindow: null,
          whyMetrics: [
            metric("rain", "Rain (next 6h)", `${Math.round(s6.maxRain)}%`),
            metric("temp", "Temp", `${Math.round(curTemp)}°C`),
            metric("wind", "Wind", `${Math.round(curWind)} km/h`),
          ],
        };
      }
      return {
        severity: s12.maxRain >= 50 ? "watch" : "info",
        headline: s12.maxRain >= 50 ? "Plan indoor backup" : "Good stretch for family time",
        message: s12.maxRain >= 50
          ? `Rain may reach ${Math.round(s12.maxRain)}% later. Keep an indoor backup plan for the afternoon.`
          : `Comfortable outdoor windows are opening for family plans. Best sustained stretch: ${bestFit ? windowLabel(bestFit) : "flexible through the day"}.`,
        bestWindow: bestFit ? windowLabel(bestFit) : null,
        whyMetrics: commonMetrics,
      };
    }
    case "agriculture": {
      // Practical field-work logic: never recommend nighttime as a default window.
      // Use actual sunrise/sunset to bound daylight, then score practical daylight rows.
      const sunriseHour = safeHour(weather?.current?.sunrise) ?? 6;
      const sunsetHour = safeHour(weather?.current?.sunset) ?? 18;
      const sunriseLabel = formatSunTime(weather?.current?.sunrise);
      const sunsetLabel = formatSunTime(weather?.current?.sunset);
      const daylightRemaining = filterByHourRange(rows, Math.max(local.hour, sunriseHour), sunsetHour);
      const daylightToday = filterByHourRange(weather.hourly || [], sunriseHour, sunsetHour);
      const mm24 = next24.reduce((s, r) => s + safeNum(r.precipitation_mm), 0);
      const peakRainDaylight = daylightToday.length ? Math.max(...daylightToday.map((r) => safeNum(r.precipitation_probability))) : s24.maxRain;

      // If daylight is already over for today, point to tomorrow morning.
      if (local.hour >= sunsetHour || daylightRemaining.length < 2) {
        return {
          severity: "info",
          headline: "Daylight has closed for today",
          message: `Field work is best resumed after sunrise (~${sunriseLabel}). Overnight rainfall total is ~${mm24.toFixed(1)} mm; plan drainage checks if needed.`,
          bestWindow: null,
          whyMetrics: [
            metric("temp", "Overnight low", `${Math.round(s24.minTemp)}°C`),
            metric("rain", "Rain total (24h)", `${mm24.toFixed(1)} mm`),
            metric("wind", "Peak wind", `${Math.round(s24.maxWind)} km/h`),
          ],
        };
      }

      // Score practical daylight segments (morning / midday / evening) using real weather.
      const segments = [
        { name: "morning", label: "Morning field work", start: Math.max(sunriseHour, 6), end: 10 },
        { name: "midday", label: "Daytime field work", start: 10, end: 16 },
        { name: "evening", label: "Evening field work", start: 16, end: Math.min(sunsetHour, 19) },
      ]
        .filter((seg) => seg.end > seg.start && seg.end > local.hour)
        .map((seg) => {
          const segStart = Math.max(seg.start, local.hour);
          const segRows = filterByHourRange(rows, segStart, seg.end);
          if (!segRows.length) return null;
          const rain = Math.max(...segRows.map((r) => safeNum(r.precipitation_probability)));
          const wind = Math.max(...segRows.map((r) => safeNum(r.wind_kmh)));
          const temps = segRows.map((r) => safeNum(r.temperature_c));
          const feels = segRows.map((r) => safeNum(r.feels_like_c, safeNum(r.temperature_c)));
          const avgTemp = temps.reduce((s, v) => s + v, 0) / temps.length;
          const peakTemp = Math.max(...temps);
          const peakFeels = Math.max(...feels);
          const hasStorm = segRows.some((r) => r.condition === "storm");
          // Penalize storms, heavy rain, extreme heat/wind; reward cool + dry + calm daylight.
          const score = 100
            - (hasStorm ? 60 : 0)
            - rain * 0.9
            - Math.max(0, peakTemp - 34) * 6
            - Math.max(0, wind - 24) * 2
            - Math.max(0, 12 - avgTemp) * 3;
          return { ...seg, segStart, rain, wind, avgTemp, peakTemp, peakFeels, hasStorm, score, start: segRows[0].time, endTime: segRows[segRows.length - 1].time };
        })
        .filter(Boolean);

      const usable = segments.filter((seg) => !seg.hasStorm && seg.rain <= 55 && seg.wind <= 34 && seg.peakTemp <= 40);
      const best = usable.reduce((b, seg) => (!b || seg.score > b.score ? seg : b), null);

      if (best) {
        const label = windowLabel({ start: best.start, end: best.endTime });
        return {
          severity: mm24 >= 12 ? "watch" : "info",
          headline: "Better field-work window",
          message: `${label} looks practical for field work — around ${Math.round(best.avgTemp)}° with ${Math.round(best.rain)}% rain risk during daylight hours.${mm24 >= 12 ? ` Around ${mm24.toFixed(1)} mm expected in 24h, prepare drainage.` : ""}`,
          bestWindow: label,
          whyMetrics: [
            metric("temp", "Window temp", `${Math.round(best.avgTemp)}°C`),
            metric("rain", "Rain in window", `${Math.round(best.rain)}%`),
            metric("wind", "Wind in window", `${Math.round(best.wind)} km/h`),
          ],
        };
      }

      // No usable segment — explain the real reason honestly.
      const reason = segments.some((seg) => seg.hasStorm)
        ? "Thunderstorm conditions are expected during daylight hours."
        : peakRainDaylight >= 55
          ? `Rain probability climbs to ${Math.round(peakRainDaylight)}% across daylight hours.`
          : segments.some((seg) => seg.wind > 34)
            ? `Winds peak above ${Math.round(Math.max(...segments.map((s) => s.wind)))} km/h during daylight.`
            : `Daylight peaks around ${Math.round(Math.max(...segments.map((s) => s.peakTemp)))}° which is intense for prolonged outdoor work.`;
      return {
        severity: "watch",
        headline: "No clear field-work window today",
        message: `${reason} Reschedule non-urgent field work; daylight ends around ${sunsetLabel}.`,
        bestWindow: null,
        whyMetrics: [
          metric("rain", "Peak rain (daylight)", `${Math.round(peakRainDaylight)}%`),
          metric("temp", "Peak temp (daylight)", `${Math.round(daylightToday.length ? Math.max(...daylightToday.map((r) => safeNum(r.temperature_c))) : s24.maxTemp)}°C`),
          metric("wind", "Peak wind (daylight)", `${Math.round(daylightToday.length ? Math.max(...daylightToday.map((r) => safeNum(r.wind_kmh))) : s24.maxWind)} km/h`),
        ],
      };
    }
    case "commute": {
      const rushRows = rows.filter((r) => {
        const h = Number((r.time || "").slice(11, 13));
        return h >= 7 && h <= 10;
      });
      const rushRain = rushRows.length ? Math.max(...rushRows.map((r) => safeNum(r.precipitation_probability))) : s6.maxRain;
      if (rushRain >= 55) {
        return {
          severity: "watch",
          headline: "Travel carefully during the morning peak",
          message: `Rain probability climbs to ${Math.round(rushRain)}% during 7–10 AM. Start earlier if possible and expect slower moves.`,
          bestWindow: null,
          whyMetrics: [
            metric("rain", "Rain in rush hours", `${Math.round(rushRain)}%`),
            metric("wind", "Wind", `${Math.round(curWind)} km/h`),
            metric("temp", "Temperature", `${Math.round(curTemp)}°C`),
          ],
        };
      }
      return {
        severity: "info",
        headline: "Commute conditions look steady",
        message: `Rain risk stays around ${Math.round(rushRain)}% for the next commute window. Visibility data is not sourced by this feed.`,
        bestWindow: null,
        whyMetrics: commonMetrics,
      };
    }
    case "events": {
      if (s12.maxRain >= 50) {
        return {
          severity: "watch",
          headline: "Rain risk before the evening",
          message: `Outdoor conditions turn less favourable later — rain probability climbs to ${Math.round(s12.maxRain)}%. Consider a covered venue or earlier start.`,
          bestWindow: bestFit ? windowLabel(bestFit) : null,
          whyMetrics: commonMetrics,
        };
      }
      return {
        severity: "info",
        headline: "Comfortable outdoor window",
        message: `Rain risk stays under ${Math.round(s12.maxRain)}% and temperature holds near ${Math.round(curTemp)}°. A good day for an outdoor programme.`,
        bestWindow: bestFit ? windowLabel(bestFit) : null,
        whyMetrics: commonMetrics,
      };
    }
    default:
      return {
        severity: "info",
        headline: "Your live weather is ready",
        message: `Conditions around ${Math.round(curTemp)}° with ${Math.round(s12.maxRain)}% rain risk over the next 12 hours.`,
        bestWindow: bestFit ? windowLabel(bestFit) : null,
        whyMetrics: commonMetrics,
      };
  }
}
