const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export async function searchWeatherLocations(query) {
  const response = await fetch(`${API}/locations?q=${encodeURIComponent(query)}&country_code=IN`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Location search unavailable");
  return (await response.json()).results || [];
}

export async function fetchWeather(place) {
  const params = new URLSearchParams({ lat: String(place.latitude), lon: String(place.longitude), location: place.name });
  const response = await fetch(`${API}/weather?${params.toString()}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Live weather unavailable");
  return response.json();
}

export function weatherIcon(condition, isDay = true) {
  if (!isDay && ["sunny", "partly-cloudy"].includes(condition)) return "night";
  return condition || "cloudy";
}

export function formatHour(value, timezone) {
  try { return new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: true, timeZone: timezone || undefined }).format(new Date(value)); } catch { return value?.slice(11, 16) || "—"; }
}

export function formatDay(value, timezone) {
  try { return new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: timezone || undefined }).format(new Date(`${value}T12:00:00`)); } catch { return value?.slice(5) || "—"; }
}