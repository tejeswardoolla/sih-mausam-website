import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, AirVent, Bell, ChevronDown, CloudRain, Droplets, Eye, Globe2, HeartPulse, Leaf,
  MapPin, Menu, Moon, MoreHorizontal, Navigation, Palette, Plus, Search, Settings2, ShieldAlert,
  Sun, Sunrise, Sunset, Thermometer, UserRound, Waves, Wind, X, Zap,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchWeather, searchWeatherLocations, weatherIcon } from "@/weatherService";
import {
  findNowIndex, formatHourLabel, formatLocationDate, formatLocationTime, formatSunTime, formatWeekday, getLocalParts,
} from "@/services/weatherFormatters";
import { buildRecommendation } from "@/services/recommendationEngine";
import { deriveAtmosphere } from "@/services/weatherVisualMapper";
import "@/App.css";

const personas = [
  { id: "fitness", label: "Outdoor fitness", short: "Fitness", icon: Activity, color: "orange", note: "Your best window for movement" },
  { id: "health", label: "Health & wellness", short: "Health", icon: HeartPulse, color: "rose", note: "Breathe easier, plan smarter" },
  { id: "travel", label: "Travel", short: "Travel", icon: Globe2, color: "blue", note: "Know before you go" },
  { id: "beach", label: "Beach & surf", short: "Beach", icon: Waves, color: "cyan", note: "Read the rhythm of the coast" },
  { id: "family", label: "Family", short: "Family", icon: UserRound, color: "violet", note: "Good days start outdoors" },
  { id: "agriculture", label: "Agriculture", short: "Farm", icon: Leaf, color: "green", note: "Signals for every growing day" },
  { id: "commute", label: "Daily commute", short: "Commute", icon: Navigation, color: "amber", note: "Leave with confidence" },
  { id: "events", label: "Events", short: "Events", icon: Zap, color: "pink", note: "Make plans that hold" },
];

const locationCatalog = [["Vijayawada","Andhra Pradesh, India"],["Hyderabad","Telangana, India"],["New Delhi","Delhi, India"],["Mumbai","Maharashtra, India"],["Bengaluru","Karnataka, India"],["Chennai","Tamil Nadu, India"],["Kolkata","West Bengal, India"],["Pune","Maharashtra, India"],["Visakhapatnam","Andhra Pradesh, India"],["Rajahmundry","East Godavari, Andhra Pradesh, India"],["Rajamahendravaram","East Godavari, Andhra Pradesh, India"],["Kakinada","Kakinada district, Andhra Pradesh, India"]];
const glassGlobeUrl = "https://static.prod-images.emergentagent.com/jobs/242c255e-7b43-47bc-afec-4341caa17fe3/images/844aec80732e2009971269792101b9f4cc7840b02f2f594e23e10d8c446ed047.jpeg";
const defaultPlace = { id: 1264527, name: "Rajahmundry", admin1: "Andhra Pradesh", country: "India", latitude: 17.0005, longitude: 81.8040, timezone: "Asia/Kolkata" };

const RECOMMENDATION_ICONS = { rain: CloudRain, temp: Thermometer, wind: Wind, humidity: Droplets };

function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function IconButton({ children, label, onClick, testid }) {
  return <button className="icon-button" aria-label={label} title={label} data-testid={testid} onClick={onClick}>{children}</button>;
}

function WeatherGlyph({ condition, size = 22 }) {
  const Icon = condition === "sunny" ? Sun : condition === "night" ? Moon : condition === "fog" ? Eye : condition === "storm" ? Zap : condition === "rain" ? CloudRain : AirVent;
  return <Icon size={size} />;
}

function LocationSearch({ query, setQuery, results, onSelect, onClose, searching }) {
  return (
    <div className="location-modal-backdrop">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="location-modal" data-testid="location-search-modal">
        <div className="location-modal-head">
          <div><span className="eyebrow">LIVE LOCATION SEARCH</span><h2>Where next?</h2></div>
          <IconButton label="Close location search" onClick={onClose} testid="close-location-search-button"><X size={20} /></IconButton>
        </div>
        <div className="location-search-field">
          <Search size={18} />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any Indian city or place" data-testid="location-search-input" />
          <kbd>⌘ K</kbd>
        </div>
        <p className="location-search-note">Search powered by Open-Meteo geocoding. Select a result to load live weather.</p>
        <div className="location-results" data-testid="location-search-results">
          {searching ? (
            <div className="no-location-results" data-testid="location-search-loading"><span className="search-spinner" /> Finding places…</div>
          ) : results.length ? results.map((place) => (
            <button key={`${place.name}-${place.latitude}`} onClick={() => onSelect(place)} data-testid={`location-result-${place.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
              <span className="result-pin"><MapPin size={16} /></span>
              <span><b>{place.name}</b><small>{[place.admin1, place.country].filter(Boolean).join(", ")}</small></span>
              <ChevronDown size={16} />
            </button>
          )) : (
            <div className="no-location-results" data-testid="no-location-results">
              <Search size={18} />
              <span>{query.length > 1 ? "No places found. Try another city or spelling." : "Start typing a city or region."}</span>
            </div>
          )}
        </div>
        <div className="location-modal-foot"><Globe2 size={14} /> Live weather by Open-Meteo · Geocoding data by GeoNames</div>
      </motion.div>
    </div>
  );
}

function NamePrompt({ onSubmit }) {
  const [value, setValue] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };
  return (
    <div className="onboarding-backdrop" data-testid="name-onboarding-backdrop">
      <motion.form
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="onboarding name-onboarding"
        data-testid="name-onboarding"
        onSubmit={submit}
      >
        <div className="onboarding-mark"><Sun size={22} /></div>
        <span className="eyebrow">MAUSAM · SKY SYNC</span>
        <h1>Welcome to<br /><em>Sky Sync</em></h1>
        <p className="onboarding-copy">What should we call you?</p>
        <input
          autoFocus
          className="name-onboarding-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Your preferred name"
          maxLength={40}
          data-testid="name-onboarding-input"
        />
        <div className="onboarding-actions single">
          <button
            type="submit"
            className="primary-button"
            disabled={!value.trim()}
            data-testid="name-onboarding-continue"
          >
            Continue <span>→</span>
          </button>
        </div>
      </motion.form>
    </div>
  );
}

function Onboarding({ onChoose, onSkip }) {
  const [selected, setSelected] = useState(["fitness"]);
  const toggle = (id) => setSelected((items) => items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);
  return (
    <div className="onboarding-backdrop">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="onboarding">
        <div className="onboarding-mark"><Sun size={22} /></div>
        <span className="eyebrow">MAUSAM / YOUR WEATHER INTELLIGENCE</span>
        <h1>How do you use<br /><em>weather?</em></h1>
        <p className="onboarding-copy">Tell us what matters to you. We&apos;ll make your forecast feel personal.</p>
        <div className="persona-grid">
          {personas.map(({ id, label, icon: I }) => (
            <button key={id} className={`persona-option ${selected.includes(id) ? "selected" : ""}`} data-testid={`onboarding-persona-${id}`} onClick={() => toggle(id)}>
              <I size={18} /><span>{label}</span>{selected.includes(id) && <span className="check">✓</span>}
            </button>
          ))}
        </div>
        <div className="onboarding-actions">
          <button className="text-button" data-testid="onboarding-skip-button" onClick={onSkip}>Skip for now</button>
          <button className="primary-button" data-testid="onboarding-continue-button" onClick={() => onChoose(selected[0] || "fitness")}>Build my dashboard <span>→</span></button>
        </div>
      </motion.div>
    </div>
  );
}

function Hero({ location, weather, loading, localTime, greeting, userName }) {
  const current = weather?.current;
  const visual = deriveAtmosphere(weather);
  const state = visual.atmosphere;
  const temp = current?.temperature_c;
  const feels = current?.feels_like_c;
  const status = loading ? "UPDATING WEATHER…" : current ? `LIVE CONDITIONS · ${weather?.timezone_abbreviation || weather?.timezone || "LOCAL"}` : "WEATHER UNAVAILABLE";
  const rainCount = Math.round(6 + visual.intensity.rain * 22);
  const showRain = visual.intensity.rain > 0;
  const showLightning = visual.intensity.lightning > 0;
  const showFog = visual.intensity.fog > 0;
  const showStars = visual.isNight;
  return (
    <motion.section
      layout
      className={`hero panel weather-${visual.condition} time-${visual.timeOfDay}`}
      data-testid="hero-weather-card"
      data-weather-condition={visual.condition}
      data-time-of-day={visual.timeOfDay}
      data-atmosphere={visual.dataAtmosphere}
      style={{
        "--rain-i": visual.intensity.rain,
        "--wind-i": visual.intensity.wind,
        "--fog-i": visual.intensity.fog,
        "--cloud-i": visual.intensity.cloud,
      }}
    >
      <div className="globe-stage" aria-hidden="true"><div className="globe-halo" /><img src={glassGlobeUrl} alt="" /></div>
      <div className="hero-sky">
        <div className="sun-disc" />
        {visual.isNight && <div className="moon-disc" aria-hidden="true" />}
        <div className="cloud cloud-one" />
        <div className="cloud cloud-two" />
        <div className="hero-lines" />
        {showStars && (
          <div className="stars-layer" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 13) % 96}%`, top: `${(i * 19) % 55}%`, animationDelay: `-${(i % 6) * 0.6}s` }} />
            ))}
          </div>
        )}
        {showFog && (
          <div className="fog-layer" aria-hidden="true"><i /><i /><i /></div>
        )}
        <div className="weather-motion" data-testid="weather-motion" data-weather-state={state}>
          {showRain && (
            <div className="rain-layer" data-testid="rain-layer" data-rain-count={rainCount}>
              {Array.from({ length: rainCount }, (_, i) => (
                <i key={i} style={{ left: `${5 + (i * 7) % 92}%`, animationDelay: `-${(i % 6) * 0.55}s`, animationDuration: `${Math.max(0.9, 1.7 - visual.intensity.rain * 0.6 + (i % 4) * 0.15)}s` }} />
              ))}
            </div>
          )}
          {showLightning && <div className="lightning-flash" data-testid="lightning-flash" />}
        </div>
      </div>
      <div className="hero-top">
        <div>
          <span className="eyebrow light" data-testid="hero-status">{status}</span>
          <h1 data-testid="hero-location">{location}</h1>
          <p className="hero-condition" data-testid="hero-condition">
            <WeatherGlyph condition={state} size={16} />{" "}
            {current?.condition_label || (loading ? "Updating conditions…" : "Weather unavailable")}
            {current && feels != null && (<><span>•</span> Feels like {Math.round(feels)}°</>)}
          </p>
        </div>
        <div className="hero-temp" data-testid="hero-temperature">
          {temp != null ? Math.round(temp) : "—"}<small>°C</small>
        </div>
      </div>
      <div className="hero-bottom">
        <div className="hero-summary">
          <span className="weather-icon"><WeatherGlyph condition={state} size={30} /></span>
          <span>{greeting}, {userName} <b>👋</b><br /><small data-testid="hero-local-time">{localTime}</small></span>
        </div>
        <div className="hero-metrics">
          {[
            [Droplets, "Humidity", current?.humidity != null ? `${Math.round(current.humidity)}%` : "—"],
            [Wind, "Wind", current?.wind_kmh != null ? `${Math.round(current.wind_kmh)} km/h` : "—"],
            [CloudRain, "Rain", current?.precipitation_mm != null ? `${current.precipitation_mm} mm` : "—"],
            [WeatherGlyph, "Condition", current?.condition_label || "—"],
          ].map(([I, k, v]) => (
            <div className="hero-metric" key={k} data-testid={`hero-metric-${k.toLowerCase().replace(" ", "-")}`}>
              {typeof I === "function" && I === WeatherGlyph ? <WeatherGlyph condition={state} size={16} /> : <I size={16} />}
              <span>{k}</span><strong>{v}</strong>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function FitnessCard({ weather, insight }) {
  const c = weather?.current;
  const score = c ? Math.max(0, Math.min(100, Math.round(100 - Math.max(0, (c.temperature_c || 25) - 23) * 4 - (c.wind_kmh || 0) * 0.4))) : null;
  const bestWindow = insight?.bestWindow || (insight?.severity === "watch" ? "Later today" : "Now");
  return (
    <motion.section layout className="panel lifestyle fitness-card" data-testid="fitness-module">
      <div className="module-heading">
        <div><span className="eyebrow orange">OUTDOOR FITNESS</span><h2>Best time to move</h2></div>
        <span className="score orange-score" data-testid="workout-score">{score ?? "—"}<span>/100</span></span>
      </div>
      <div className="run-window">
        <div>
          <strong data-testid="fitness-window">{bestWindow}</strong>
          <p><span className="status-dot" /> Derived from live temperature, wind and rain risk</p>
        </div>
        <div className="runner-visual"><Activity size={42} /><div className="track"><i /><i /><i /></div></div>
      </div>
      <div className="mini-stats">
        {[
          [Thermometer, "Temp", c?.temperature_c != null ? `${Math.round(c.temperature_c)}°` : "—"],
          [Droplets, "Humidity", c?.humidity != null ? `${Math.round(c.humidity)}%` : "—"],
          [Sun, "UV index", "N/A"],
          [Wind, "Wind", c?.wind_kmh != null ? `${Math.round(c.wind_kmh)} km/h` : "—"],
        ].map(([I, k, v]) => (
          <div key={k} data-testid={`fitness-${k.toLowerCase().replace(" ", "-")}`}><I size={16} /><small>{k}</small><b>{v}</b></div>
        ))}
      </div>
      <p className="insight"><Zap size={15} /> This recommendation uses live temperature, wind and rain probability. UV is not supplied by the current weather feed.</p>
    </motion.section>
  );
}

function HealthCard({ weather, insight }) {
  const c = weather?.current;
  const feels = c?.feels_like_c != null ? Math.round(c.feels_like_c) : (c?.temperature_c != null ? Math.round(c.temperature_c) : "—");
  const humidity = c?.humidity != null ? Math.round(c.humidity) : "—";
  const wind = c?.wind_kmh != null ? Math.round(c.wind_kmh) : "—";
  const rainNext = (weather?.hourly || []).slice(0, 12).reduce((max, h) => Math.max(max, Number(h.precipitation_probability || 0)), 0);
  const status = insight?.status || "Live";
  const statusKey = status.toLowerCase().replace(/[^a-z]+/g, "-");
  const headline = insight?.headline || (weather ? "Checking today's health insight" : "Waiting for live weather");
  const message = insight?.message || "Recommendation will appear when live weather is ready.";
  return (
    <motion.section layout className="panel lifestyle health-card health-card-v2" data-testid="health-module">
      <div className="module-heading">
        <div><span className="eyebrow rose">TODAY&apos;S HEALTH INSIGHT</span><h2 data-testid="health-headline">{headline}</h2></div>
        <span className={`health-status status-${statusKey}`} data-testid="health-status">{status}</span>
      </div>
      <p className="health-insight-message" data-testid="health-insight-message">{message}</p>
      <div className="health-metric-grid" data-testid="health-metric-grid">
        {[
          [Thermometer, "Feels like", "feels-like", feels === "—" ? "—" : `${feels}°`],
          [Droplets, "Humidity", "humidity", humidity === "—" ? "—" : `${humidity}%`],
          [Wind, "Wind", "wind", wind === "—" ? "—" : `${wind} km/h`],
          [CloudRain, "Rain (12h)", "rain-12h", `${Math.round(rainNext)}%`],
        ].map(([I, k, key, v]) => (
          <div className="health-metric" key={k} data-testid={`health-metric-${key}`}>
            <I size={16} /><small>{k}</small><b>{v}</b>
          </div>
        ))}
      </div>
      <div className="health-env-secondary" data-testid="health-env-secondary">
        <span className="eyebrow">ENVIRONMENTAL DATA</span>
        <div className="health-env-row">
          <span>AQI <b>Unavailable</b></span>
          <span>UV <b>Unavailable</b></span>
          <span>Pollen <b>Unavailable</b></span>
        </div>
        <p className="alert-note-small">Enabled when an official environmental source is connected.</p>
      </div>
    </motion.section>
  );
}

function TravelCard({ weather, insight, location }) {
  const c = weather?.current;
  const rain = (weather?.hourly || []).slice(0, 12).reduce((max, h) => Math.max(max, Number(h.precipitation_probability || 0)), 0);
  const headline = insight?.headline || "Travel outlook";
  const message = insight?.message || (rain >= 50 ? "Rain probability increases in the next 12 hours." : "Weather stays mostly stable through the day.");
  return (
    <motion.section layout className="panel lifestyle travel-card" data-testid="travel-module">
      <div className="module-heading">
        <div><span className="eyebrow blue">TRAVEL WEATHER</span><h2 data-testid="travel-location">{location}</h2></div>
        <IconButton label="More travel options" testid="travel-more-button"><MoreHorizontal size={20} /></IconButton>
      </div>
      <div className="travel-main">
        <div>
          <strong>{c?.temperature_c != null ? Math.round(c.temperature_c) : "—"}°</strong>
          <span>{c?.condition_label || "—"}</span>
        </div>
        <div className="travel-facts">
          <span><CloudRain size={15} /> {Math.round(rain)}% rain</span>
          <span><Wind size={15} /> {c?.wind_kmh != null ? Math.round(c.wind_kmh) : "—"} km/h</span>
        </div>
      </div>
      <div className="packing" data-testid="travel-recommendation">
        <span>🧳</span>
        <div>
          <b data-testid="travel-headline">{headline}</b>
          <small data-testid="travel-message">{message}</small>
        </div>
        <ChevronDown size={17} />
      </div>
      {insight?.bestWindow ? (
        <span className="best-window-chip" data-testid="travel-best-window"><Sunrise size={12} /> Best travel window · {insight.bestWindow}</span>
      ) : (
        <span className="best-window-chip muted" data-testid="travel-best-window">No clear travel window</span>
      )}
    </motion.section>
  );
}

function BeachCard({ weather }) {
  const c = weather?.current;
  return (
    <motion.section layout className="panel lifestyle beach-card" data-testid="beach-module">
      <div className="wave-art"><Waves size={82} /></div>
      <div className="module-heading">
        <div><span className="eyebrow cyan">OUTDOOR CONDITIONS</span><h2>Read the weather</h2></div>
        <span className="score cyan-score">LIVE</span>
      </div>
      <div className="beach-stats">
        <span><b>{c?.temperature_c != null ? Math.round(c.temperature_c) : "—"}°</b>Air temp</span>
        <span><b>N/A</b>Wave height</span>
        <span><b>{c?.wind_kmh != null ? Math.round(c.wind_kmh) : "—"} km/h</b>Wind</span>
      </div>
      <p className="tide-line">
        <span>Water temp <b>Not supplied</b></span>
        <span>Wave data <b>IMD layer ready</b></span>
      </p>
    </motion.section>
  );
}

function GenericCard({ persona, weather }) {
  const c = weather?.current;
  const rain = (weather?.hourly || []).slice(0, 12).reduce((max, h) => Math.max(max, Number(h.precipitation_probability || 0)), 0);
  const temp = c?.temperature_c != null ? `${Math.round(c.temperature_c)}°` : "—";
  const rainPercent = `${Math.round(rain)}%`;
  let config = ["YOUR OUTLOOK", persona.note, "Live weather signals are ready for your plans.", temp, "Live temperature"];
  if (persona.id === "family") config = ["FAMILY WEATHER", "Plan the family day", rain >= 50 ? "Rain may affect outdoor plans in the next 12 hours." : "The next few hours look comfortable for family plans.", temp, "Live temperature"];
  if (persona.id === "agriculture") config = ["FARM WEATHER", rain >= 50 ? "Rain is on the way" : "A calmer field window", rain >= 50 ? "Check soil moisture before scheduling irrigation." : "Rain risk is modest. Use the live outlook to plan field work.", rainPercent, "Rain probability"];
  if (persona.id === "commute") config = ["MORNING COMMUTE", rain >= 50 ? "Travel carefully" : "Steady conditions", `${rainPercent} rain probability in the next 12 hours. Visibility is not sourced by this feed.`, rainPercent, "Rain probability"];
  if (persona.id === "events") config = ["OUTDOOR EVENT", rain >= 50 ? "Plan before the rain" : "Conditions look promising", `${rainPercent} rain probability across the next 12 hours.`, rainPercent, "Rain probability"];
  return (
    <motion.section layout className={`panel lifestyle generic-card ${persona.color}`} data-testid={`${persona.id}-module`}>
      <span className="eyebrow">{config[0]}</span>
      <h2>{config[1]}</h2>
      <p>{config[2]}</p>
      <div className="generic-bottom">
        <div><b>{config[3]}</b><small>{config[4]}</small></div>
        <div className="spark-bars">{[20, 42, 31, 62, 48, 78, 58].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
      </div>
    </motion.section>
  );
}

function Hourly({ weather, timezone, onViewAll }) {
  const all = weather?.hourly || [];
  const nowIdx = findNowIndex(all, timezone);
  const rows = all.slice(nowIdx, nowIdx + 8);
  return (
    <section className="section-block" data-testid="hourly-forecast">
      <div className="section-title">
        <div><span className="eyebrow">THE DAY AHEAD · LIVE</span><h2>Hourly forecast</h2></div>
        <button className="link-button" data-testid="hourly-view-all-button" onClick={onViewAll} disabled={!all.length}>View 24 hours <span>→</span></button>
      </div>
      <div className="hourly-strip">
        {rows.length ? rows.map((row, i) => (
          <div className={`hour ${i === 0 ? "active now-hour" : ""}`} key={row.time || i} data-testid={`hour-${i}`}>
            <small>{formatHourLabel(row.time, { isNow: i === 0 })}</small>
            <WeatherGlyph condition={weatherIcon(row.condition, Number(row.is_day) === 1)} size={22} />
            <b>{row.temperature_c != null ? Math.round(row.temperature_c) : "—"}°</b>
            <span>{Number(row.precipitation_probability) > 0 ? `${Math.round(row.precipitation_probability)}%` : "—"}</span>
          </div>
        )) : (
          <div className="hourly-empty" data-testid="hourly-empty">Live hourly forecast is unavailable for this location.</div>
        )}
      </div>
    </section>
  );
}

function HourlyDetail({ weather, timezone, onClose }) {
  const rows = weather?.hourly || [];
  const nowIdx = findNowIndex(rows, timezone);
  useEffect(() => {
    const el = document.querySelector(`[data-testid="hourly-detail-row-${nowIdx}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [nowIdx]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="hourly-detail" onClick={(e) => e.stopPropagation()} data-testid="hourly-detail-modal">
        <div className="modal-head">
          <div><span className="eyebrow">NEXT 24 HOURS · LIVE</span><h2>Hourly outlook</h2></div>
          <IconButton label="Close hourly detail" onClick={onClose} testid="close-hourly-detail-button"><X size={20} /></IconButton>
        </div>
        <p className="hourly-detail-note">All times shown in the selected location&apos;s local time ({timezone || "UTC"}).</p>
        <div className="hourly-detail-list" data-testid="hourly-detail-list">
          {rows.map((row, i) => (
            <div className={`hourly-detail-row ${i === nowIdx ? "now" : ""}`} key={row.time || i} data-testid={`hourly-detail-row-${i}`}>
              <b>{formatHourLabel(row.time, { isNow: i === nowIdx })}</b>
              <WeatherGlyph condition={weatherIcon(row.condition, Number(row.is_day) === 1)} size={18} />
              <span className="cond-label">{row.condition_label}</span>
              <strong>{row.temperature_c != null ? Math.round(row.temperature_c) : "—"}°</strong>
              <span className="rain-chance"><CloudRain size={13} /> {Math.round(row.precipitation_probability || 0)}%</span>
              <span className="wind-chip"><Wind size={13} /> {Math.round(row.wind_kmh || 0)} km/h</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function Weekly({ weather }) {
  const rows = weather?.daily || [];
  return (
    <section className="panel weekly" data-testid="weekly-forecast">
      <div className="section-title">
        <div><span className="eyebrow">EXTENDED OUTLOOK · LIVE</span><h2>Next 7 days</h2></div>
        <IconButton label="More forecast options" testid="weekly-more-button"><MoreHorizontal size={20} /></IconButton>
      </div>
      {rows.length ? rows.map((row, index) => (
        <div className="day-row" key={row.date || index} data-testid={`forecast-${index}`}>
          <b>{index === 0 ? "Today" : formatWeekday(row.date)}</b>
          <WeatherGlyph condition={weatherIcon(row.condition, true)} size={19} />
          <span className="rain-chance">{Math.round(row.rain_probability || 0)}% rain</span>
          <div className="temp-bar"><i style={{ width: `${Math.min(100, Number(row.high_c || 28) + 5)}%` }} /></div>
          <strong>{row.high_c != null ? Math.round(row.high_c) : "—"}°</strong>
          <span className="low">{row.low_c != null ? Math.round(row.low_c) : "—"}°</span>
        </div>
      )) : (
        <div className="weekly-empty" data-testid="weekly-empty">Live daily forecast is unavailable for this location.</div>
      )}
      {rows[0]?.sunrise && rows[0]?.sunset && (
        <div className="sun-row" data-testid="sun-row">
          <span><Sunrise size={14} /> Sunrise <b>{formatSunTime(rows[0].sunrise)}</b></span>
          <span><Sunset size={14} /> Sunset <b>{formatSunTime(rows[0].sunset)}</b></span>
        </div>
      )}
    </section>
  );
}

function tempToColor(t) {
  if (t == null) return "#4a90e2";
  const clamped = Math.max(-10, Math.min(45, t));
  // -10 -> hue 240 (deep blue) ... 45 -> hue 0 (red)
  const hue = Math.round(240 - ((clamped + 10) / 55) * 240);
  return `hsl(${hue}, 78%, 55%)`;
}

function MapController({ center, place }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.flyTo(center, map.getZoom() >= 6 ? map.getZoom() : 8, { duration: 0.9 });
    // Invalidate size on next tick in case the panel resized (mobile / customize).
    setTimeout(() => map.invalidateSize(), 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.[0], center?.[1], place?.name]);
  return null;
}

function WeatherMap({ location, weather, place }) {
  const [layer, setLayer] = useState("temperature");
  const c = weather?.current;
  const temp = c?.temperature_c;
  const wind = c?.wind_kmh || 0;
  const windDir = c?.wind_direction ?? 0;
  const rainMax = (weather?.hourly || []).slice(0, 12).reduce((m, h) => Math.max(m, Number(h.precipitation_probability || 0)), 0);
  const rainMm24 = (weather?.hourly || []).slice(0, 24).reduce((s, h) => s + Number(h.precipitation_mm || 0), 0);
  const center = useMemo(() => [
    Number(place?.latitude) || 20.5937,
    Number(place?.longitude) || 78.9629,
  ], [place?.latitude, place?.longitude]);
  const layers = [
    { id: "temperature", label: "Temperature" },
    { id: "rainfall", label: "Rainfall" },
    { id: "wind", label: "Wind" },
  ];

  const pinIcon = useMemo(() => L.divIcon({
    className: "mausam-map-pin",
    html: `<div class="mausam-map-pin-inner"><span></span><b></b></div>`,
    iconSize: [26, 34], iconAnchor: [13, 30], popupAnchor: [0, -28],
  }), []);

  const windArrowIcon = useMemo(() => L.divIcon({
    className: "mausam-wind-arrow",
    html: `<div class="wind-arrow-wrap" style="transform: rotate(${windDir}deg)">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r="22" fill="rgba(15,25,45,0.55)" stroke="rgba(220,240,255,0.85)" stroke-width="1.5"/>
        <path d="M26 8 L34 32 L26 26 L18 32 Z" fill="#ffd7a8" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>
      </svg>
    </div>`,
    iconSize: [52, 52], iconAnchor: [26, 26], popupAnchor: [0, -22],
  }), [windDir]);

  return (
    <section className="panel map-panel" data-testid="weather-map">
      <div className="section-title">
        <div><span className="eyebrow">WEATHER LAYERS · SELECTED LOCATION</span><h2>Weather map</h2></div>
        <button className="map-location" data-testid="map-location-button"><MapPin size={15} /> {location}</button>
      </div>
      <div className="map-canvas real-map-canvas" data-testid={`map-canvas-${layer}`} data-active-layer={layer}>
        <MapContainer
          center={center}
          zoom={9}
          scrollWheelZoom={false}
          className="leaflet-map"
          attributionControl={false}
          whenReady={(e) => { try { e.target?.getContainer?.().setAttribute("data-testid", "leaflet-map"); } catch (_) {} }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            subdomains={["a", "b", "c"]}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={18}
          />
          <MapController center={center} place={place} />

          <Marker position={center} icon={pinIcon}>
            <Popup>
              <b>{location}</b>
              <br />
              {c?.condition_label || "—"} · {temp != null ? `${Math.round(temp)}°C` : "—"}
            </Popup>
          </Marker>

          {layer === "temperature" && temp != null && (
            <CircleMarker
              center={center}
              radius={34}
              pathOptions={{ color: tempToColor(temp), fillColor: tempToColor(temp), fillOpacity: 0.4, weight: 2 }}
            >
              <Popup>Temperature: {Math.round(temp)}°C{c?.feels_like_c != null ? ` · Feels like ${Math.round(c.feels_like_c)}°` : ""}</Popup>
            </CircleMarker>
          )}

          {layer === "rainfall" && (
            <>
              <CircleMarker
                center={center}
                radius={Math.max(20, Math.min(70, 20 + rainMax * 0.5))}
                pathOptions={{ color: "#5eb8ff", fillColor: "#3a97ff", fillOpacity: Math.max(0.18, Math.min(0.55, rainMax / 100)), weight: 2 }}
              >
                <Popup>Rain probability (12h): {Math.round(rainMax)}%<br />Total 24h: {rainMm24.toFixed(1)} mm</Popup>
              </CircleMarker>
              {rainMax >= 25 && (
                <CircleMarker
                  center={center}
                  radius={Math.max(10, Math.min(38, rainMax * 0.25))}
                  pathOptions={{ color: "#8ed3ff", fillColor: "#8ed3ff", fillOpacity: 0.5, weight: 0 }}
                />
              )}
            </>
          )}

          {layer === "wind" && (
            <Marker position={center} icon={windArrowIcon}>
              <Popup>Wind {Math.round(wind)} km/h · from {Math.round(windDir)}°</Popup>
            </Marker>
          )}
        </MapContainer>

        <div className="map-location-badge" data-testid="map-pin-label">
          <MapPin size={13} /> {location}
        </div>
        <div className="map-value-chip" data-testid="map-value-chip">
          {layer === "temperature" && (<><Thermometer size={14} /> {temp != null ? `${Math.round(temp)}°C` : "—"}</>)}
          {layer === "rainfall" && (<><CloudRain size={14} /> {Math.round(rainMax)}% · {rainMm24.toFixed(1)} mm/24h</>)}
          {layer === "wind" && (<><Wind size={14} /> {Math.round(wind)} km/h · {Math.round(windDir)}°</>)}
        </div>
      </div>
      <div className="layer-tabs" role="tablist" data-testid="map-layer-tabs">
        {layers.map((l) => (
          <button
            className={layer === l.id ? "active" : ""}
            key={l.id}
            onClick={() => setLayer(l.id)}
            role="tab"
            aria-selected={layer === l.id}
            data-testid={`map-layer-${l.id}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="map-note" data-testid="map-note">Interactive geographical map by Leaflet with OpenStreetMap tiles. Layer overlays are derived from the live Open-Meteo forecast at the selected location.</p>
    </section>
  );
}

function Alerts({ weather, insight }) {
  const c = weather?.current;
  const severe = insight?.severity === "severe";
  const watch = insight?.severity === "watch";
  const tone = severe ? "warning alert-feature" : watch ? "warning" : "info";
  return (
    <section className="panel alerts" data-testid="alerts-section">
      <div className="section-title">
        <div><span className="eyebrow orange">WEATHER ALERT CENTER</span><h2>Stay weather-aware</h2></div>
        <span className="alert-count" data-testid="alert-count">{severe ? "SEVERE" : watch ? "WATCH" : "STEADY"}</span>
      </div>
      <div className={`alert-item ${tone}`} data-testid="severe-weather-alert">
        <div className="alert-icon"><WeatherGlyph condition={c?.condition || "cloudy"} size={18} /></div>
        <div>
          <b data-testid="alert-headline">{insight?.headline || "Live conditions active"}</b>
          <p data-testid="alert-message">{insight?.message || "Open-Meteo reports current conditions only; official IMD warnings can be connected here later."}</p>
        </div>
        <ChevronDown size={18} />
      </div>
      <div className="alert-item info">
        <div className="alert-icon"><ShieldAlert size={18} /></div>
        <div>
          <b>Official warning integration ready</b>
          <p>IMD advisories can be layered here when the official warning feed is available.</p>
        </div>
        <ChevronDown size={18} />
      </div>
      <button className="outline-button" data-testid="view-alerts-button">View alert sources <span>→</span></button>
    </section>
  );
}

function Recommendation({ persona, insight, location, weatherSource }) {
  const [showWhy, setShowWhy] = useState(false);
  if (!insight) {
    return (
      <section className="important-section" data-testid="important-for-you">
        <div className="important-heading">
          <div><span className="eyebrow">IMPORTANT FOR YOU</span><h2>{persona.label} intelligence</h2></div>
          <span className="live-chip" data-testid="weather-source-chip">UPDATING…</span>
        </div>
        <div className="recommendation-row">
          <div className="recommendation-icon"><Zap size={19} /></div>
          <div><b data-testid="smart-recommendation">Fetching live conditions for {location}…</b><span>Recommendations update as soon as live weather is available.</span></div>
        </div>
      </section>
    );
  }
  return (
    <section className={`important-section severity-${insight.severity}`} data-testid="important-for-you">
      <div className="important-heading">
        <div><span className="eyebrow">IMPORTANT FOR YOU</span><h2>{persona.label} intelligence</h2></div>
        <span className="live-chip" data-testid="weather-source-chip">{weatherSource === "open-meteo" ? "LIVE WEATHER" : "AWAITING LIVE FEED"}</span>
      </div>
      <div className="recommendation-row">
        <div className="recommendation-icon"><Zap size={19} /></div>
        <div>
          <b data-testid="smart-recommendation">{insight.headline}</b>
          <span data-testid="smart-recommendation-detail">{insight.message}</span>
          {insight.bestWindow && (<span className="best-window-chip" data-testid="best-window"><Sunrise size={12} /> Best window · {insight.bestWindow}</span>)}
        </div>
      </div>
      <div className="recommendation-metrics">
        {insight.whyMetrics.map((m) => {
          const I = RECOMMENDATION_ICONS[m.icon] || Zap;
          return <span key={m.label} data-testid={`why-metric-${m.icon}`}><I size={15} /> {m.label} <b>{m.value}</b></span>;
        })}
      </div>
      <div className="recommendation-footer">
        <p className="recommendation-context" data-testid="recommendation-context">{location} · Based on current conditions and the next 6–12 hours</p>
        <button
          type="button"
          className="why-button"
          data-testid="recommendation-why-button"
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
        >
          {showWhy ? "Hide reasoning" : "Why this recommendation?"} <ChevronDown size={12} style={{ transform: showWhy ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {showWhy && (
          <motion.div
            className="why-panel"
            data-testid="recommendation-why-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="why-grid">
              {insight.whyMetrics.map((m) => (
                <div key={m.label} data-testid={`why-panel-metric-${m.icon}`}><small>{m.label}</small><b>{m.value}</b></div>
              ))}
              {insight.bestWindow && (
                <div data-testid="why-panel-window"><small>Suggested window</small><b>{insight.bestWindow}</b></div>
              )}
              <div><small>Location</small><b>{location}</b></div>
            </div>
            <p className="why-reason"><b>Reason:</b> {insight.message}</p>
            <p className="why-disclaimer">Transparent, rule-based weather reasoning from the live Open-Meteo forecast — no AI model involved.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function App() {
  const [personaId, setPersonaId] = useState(localStorage.getItem("mausam-persona") || "fitness");
  const [userName, setUserName] = useState(() => localStorage.getItem("mausam-user-name") || "");
  const [showNamePrompt, setShowNamePrompt] = useState(() => !localStorage.getItem("mausam-user-name"));
  const [onboarding, setOnboarding] = useState(localStorage.getItem("mausam-seen") !== "true");
  const [dark, setDark] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeNav, setActiveNav] = useState("Home");
  const [showThemes, setShowThemes] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("mausam-theme") || "editorial");
  const [selectedPlace, setSelectedPlace] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mausam-location-place")) || defaultPlace; } catch { return defaultPlace; }
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [savedLocations, setSavedLocations] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("mausam-saved-locations"));
      return (stored || [defaultPlace, { ...defaultPlace, name: "Hyderabad", admin1: "Telangana", latitude: 17.385, longitude: 78.4867 }, { ...defaultPlace, name: "New Delhi", admin1: "Delhi", latitude: 28.6139, longitude: 77.209 }])
        .map((item) => typeof item === "string" ? { ...defaultPlace, name: item } : item);
    } catch { return [defaultPlace]; }
  });
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [showHourlyDetail, setShowHourlyDetail] = useState(false);
  const [tick, setTick] = useState(0);
  const [modules, setModules] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mausam-modules")) || { hero: true, personal: true, hourly: true, weekly: true, alerts: true, map: true }; }
    catch { return { hero: true, personal: true, hourly: true, weekly: true, alerts: true, map: true }; }
  });

  const persona = useMemo(() => personas.find((p) => p.id === personaId) || personas[0], [personaId]);
  const location = selectedPlace.name;
  const timezone = weather?.timezone || selectedPlace.timezone || "Asia/Kolkata";
  // These derive from timezone + wall-clock (tick trigger). They must recompute on every tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localParts = useMemo(() => getLocalParts(timezone), [timezone, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localDate = useMemo(() => formatLocationDate(timezone), [timezone, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localTime = useMemo(() => formatLocationTime(timezone), [timezone, tick]);
  // Greeting is derived from the USER'S BROWSER local time, per requirement.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const greeting = useMemo(() => greetingFor(new Date().getHours()), [tick]);
  const friendlyName = userName || "friend";
  const avatarInitial = (userName || "M").trim().charAt(0).toUpperCase();
  const insight = useMemo(() => buildRecommendation(personaId, weather, selectedPlace), [personaId, weather, selectedPlace]);

  const saveUserName = (nextName) => {
    const trimmed = (nextName || "").trim();
    setUserName(trimmed);
    if (trimmed) localStorage.setItem("mausam-user-name", trimmed);
    else localStorage.removeItem("mausam-user-name");
  };
  const completeNamePrompt = (nextName) => {
    saveUserName(nextName);
    setShowNamePrompt(false);
  };

  const choosePersona = (id) => { setPersonaId(id); localStorage.setItem("mausam-persona", id); localStorage.setItem("mausam-seen", "true"); setOnboarding(false); };
  const chooseLocation = (place) => {
    const nextPlace = typeof place === "string"
      ? (savedLocations.find((item) => item.name === place) || { ...defaultPlace, name: place })
      : place;
    setSelectedPlace(nextPlace);
    localStorage.setItem("mausam-location-place", JSON.stringify(nextPlace));
    localStorage.setItem("mausam-location", nextPlace.name);
    const next = [nextPlace, ...savedLocations.filter((item) => item.name !== nextPlace.name)].slice(0, 6);
    setSavedLocations(next);
    localStorage.setItem("mausam-saved-locations", JSON.stringify(next));
    setShowLocationSearch(false);
    setLocationQuery("");
  };

  useEffect(() => {
    if (locationQuery.trim().length < 2) { setLocationResults([]); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchWeatherLocations(locationQuery.trim());
        if (!cancelled) setLocationResults(results);
      } catch {
        const q = locationQuery.trim().toLowerCase();
        const fallback = locationCatalog.filter(([name, area]) => `${name} ${area}`.toLowerCase().includes(q))
          .map(([name, area]) => ({ ...defaultPlace, name, admin1: area.split(",")[0] }));
        if (!cancelled) setLocationResults(fallback);
      } finally { if (!cancelled) setSearching(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [locationQuery]);

  useEffect(() => {
    let cancelled = false;
    setWeatherLoading(true);
    setWeatherError("");
    setWeather(null);
    fetchWeather(selectedPlace)
      .then((result) => { if (!cancelled) setWeather(result); })
      .catch(() => { if (!cancelled) { setWeather(null); setWeatherError("Live weather is temporarily unavailable · retrying shortly"); } })
      .finally(() => { if (!cancelled) setWeatherLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPlace]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", dark);
    document.body.dataset.theme = theme;
    localStorage.setItem("mausam-theme", theme);
  }, [dark, theme]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const Lifestyle = useMemo(() => {
    if (persona.id === "fitness") return (props) => <FitnessCard insight={insight} {...props} />;
    if (persona.id === "health") return (props) => <HealthCard insight={insight} {...props} />;
    if (persona.id === "travel") return (props) => <TravelCard insight={insight} location={location} {...props} />;
    if (persona.id === "beach") return BeachCard;
    return (props) => <GenericCard persona={persona} {...props} />;
  }, [persona, insight, location]);

  const navTargets = { Home: "hero-weather-card", Forecast: "hourly-forecast", Map: "weather-map", Alerts: "alerts-section", "Saved Places": "saved-places-row" };
  const navigate = (x) => {
    setActiveNav(x); setMobileMenu(false);
    const target = document.querySelector(`[data-testid="${navTargets[x]}"]`);
    if (target) window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 82), behavior: "smooth" });
  };
  const saveModules = () => { localStorage.setItem("mausam-modules", JSON.stringify(modules)); setCustomize(false); };

  return (
    <div className="app-shell">
      <AnimatePresence>
        {showNamePrompt && <NamePrompt onSubmit={completeNamePrompt} />}
      </AnimatePresence>

      <AnimatePresence>
        {!showNamePrompt && onboarding && <Onboarding onChoose={choosePersona} onSkip={() => { localStorage.setItem("mausam-seen", "true"); setOnboarding(false); }} />}
      </AnimatePresence>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Sun size={18} /></span>
          <span>mausam</span>
          <small>IMD / MoES</small>
        </div>
        <nav className={mobileMenu ? "open" : ""}>
          {["Home", "Forecast", "Map", "Alerts", "Saved Places"].map((x) => (
            <button className={activeNav === x ? "nav-active" : ""} key={x} onClick={() => navigate(x)} data-testid={`nav-${x.toLowerCase().replace(" ", "-")}`}>{x}</button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="location-picker" onClick={() => setShowLocationSearch(true)} data-testid="location-selector">
            <MapPin size={15} /> {location} <ChevronDown size={14} />
          </button>
          <div className="theme-picker-wrap">
            <IconButton label="Choose visual theme" onClick={() => setShowThemes(!showThemes)} testid="theme-picker-button"><Palette size={18} /></IconButton>
            {showThemes && (
              <div className="theme-menu" data-testid="theme-menu">
                <span className="theme-menu-label">VISUAL MOOD</span>
                {[["editorial", "Storm glass", "#5ea7aa"], ["imd", "Clean IMD", "#1261a0"], ["midnight", "Midnight weather", "#17253e"]].map(([id, label, color]) => (
                  <button className={theme === id ? "selected" : ""} key={id} onClick={() => { setTheme(id); setDark(id === "midnight"); setShowThemes(false); }} data-testid={`theme-option-${id}`}>
                    <i style={{ background: color }} /><span>{label}</span>{theme === id && <b>✓</b>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton label="Toggle dark mode" onClick={() => setDark(!dark)} testid="dark-mode-toggle">{dark ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
          <IconButton label="Open notifications" onClick={() => setShowNotifications(!showNotifications)} testid="notification-button"><Bell size={18} /><i className="notification-dot" /></IconButton>
          <IconButton label="Open profile" onClick={() => setShowProfile(!showProfile)} testid="profile-button"><span className="avatar" data-testid="profile-avatar">{avatarInitial}</span></IconButton>
          <IconButton label="Open menu" onClick={() => setMobileMenu(!mobileMenu)} testid="mobile-menu-button"><Menu size={20} /></IconButton>
        </div>
        {showNotifications && (
          <div className="header-popover" data-testid="notification-panel">
            <b>Live weather sources</b>
            <span data-testid="notification-current">{weather?.current?.condition_label || (weatherLoading ? "Updating…" : "Unavailable")} in {location}</span>
            <span>Official IMD warnings, AQI, UV and radar are not connected in this build.</span>
          </div>
        )}
        {showProfile && (
          <div className="header-popover profile-popover" data-testid="profile-panel">
            <b data-testid="profile-name-display">{userName || "Set your name"}</b>
            <span>{persona.label} profile</span>
            <input
              type="text"
              className="profile-name-input"
              value={userName}
              onChange={(event) => saveUserName(event.target.value)}
              placeholder="Update your name"
              maxLength={40}
              data-testid="profile-name-input"
            />
            <button onClick={() => setCustomize(true)} data-testid="profile-preferences-button">Open preferences</button>
          </div>
        )}
      </header>

      <main className="main-content">
        <div className="welcome-row">
          <div>
            <span className="eyebrow" data-testid="local-datetime">{localDate} · {localTime} · {timezone}</span>
            <h2 data-testid="welcome-greeting">{greeting}, {friendlyName} <span>👋</span></h2>
            <p data-testid="persona-note">{persona.note} · Personalized for <b>{persona.label}</b></p>
          </div>
          <button className="customize-button" onClick={() => setCustomize(true)} data-testid="customize-dashboard-button">
            <Settings2 size={16} /> Personalize dashboard
          </button>
        </div>

        <div className="persona-switcher" data-testid="persona-switcher">
          {personas.map(({ id, short, icon: I }) => (
            <button className={id === personaId ? "active" : ""} key={id} onClick={() => choosePersona(id)} data-testid={`persona-switch-${id}`}>
              <I size={16} /><span>{short}</span>
            </button>
          ))}
        </div>

        {weatherError && <div className="weather-inline-error" data-testid="weather-error">{weatherError}</div>}

        <div className="dashboard-grid">
          {modules.hero && <Hero location={location} weather={weather} loading={weatherLoading} localTime={localTime} greeting={greeting} userName={friendlyName} />}
          {modules.personal && <Lifestyle weather={weather} />}
        </div>

        {modules.personal && <Recommendation persona={persona} insight={insight} location={location} weatherSource={weather?.source} />}

        <div className="lower-grid">
          <div>
            {modules.hourly && <Hourly weather={weather} timezone={timezone} onViewAll={() => setShowHourlyDetail(true)} />}
            {modules.map && <WeatherMap location={location} weather={weather} place={selectedPlace} />}
          </div>
          <div>
            {modules.weekly && <Weekly weather={weather} />}
            {modules.alerts && <Alerts weather={weather} insight={insight} />}
          </div>
        </div>

        <section className="saved-row" data-testid="saved-places-row">
          <div><span className="eyebrow">YOUR PLACES</span><h2>Saved locations</h2></div>
          <button className="add-place" onClick={() => setShowLocationSearch(true)} data-testid="add-location-button">
            <Plus size={16} /> Add location
          </button>
          <div className="place-cards">
            {savedLocations.map((place) => (
              <div className={`place-card ${place.name === location ? "current" : ""}`} key={place.name} onClick={() => chooseLocation(place)} data-testid={`saved-place-${place.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <MapPin size={15} />
                <b>{place.name}</b>
                <span>{place.name === location ? "Live weather selected" : "Tap to view weather"}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {showLocationSearch && (
        <LocationSearch
          query={locationQuery} setQuery={setLocationQuery} results={locationResults} searching={searching}
          onSelect={chooseLocation} onClose={() => { setShowLocationSearch(false); setLocationQuery(""); }}
        />
      )}

      {showHourlyDetail && <HourlyDetail weather={weather} timezone={timezone} onClose={() => setShowHourlyDetail(false)} />}

      {customize && (
        <div className="modal-backdrop modal-backdrop-glass" data-testid="customize-modal-backdrop">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="customize-modal customize-modal-glass" data-testid="customize-modal">
            <div className="modal-head">
              <div><span className="eyebrow">PERSONALIZE</span><h2>Make it yours</h2></div>
              <IconButton label="Close customization" onClick={() => setCustomize(false)} testid="close-customize-button"><X size={20} /></IconButton>
            </div>
            <p>Choose the signals you want at the top of your dashboard.</p>
            {[["Hero weather", "hero"], ["Personal recommendation", "personal"], ["Hourly forecast", "hourly"], ["7-day outlook", "weekly"], ["Alerts", "alerts"], ["Weather map", "map"]].map(([x, key]) => (
              <label key={x} className="toggle-row" data-testid={`customize-row-${key}`}>
                <span>{x}</span>
                <input type="checkbox" checked={modules[key]} onChange={() => setModules({ ...modules, [key]: !modules[key] })} />
                <i />
              </label>
            ))}
            <button className="primary-button full" onClick={saveModules} data-testid="save-customize-button">Save dashboard</button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default App;
