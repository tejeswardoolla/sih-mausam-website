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
