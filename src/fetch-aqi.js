/**
 * Kashmir AQI Logger
 *
 * Samples the Open-Meteo air quality API (ECMWF CAMS atmospheric composition
 * model) and weather API at each point in src/stations.js, writes a GeoJSON
 * snapshot (one point per station, latest reading), and appends a CSV time
 * series log so the full history can be reconstructed for analysis.
 *
 * Both APIs are keyless and accept batched coordinates, so a run is two HTTP
 * requests regardless of how many stations are configured.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STATIONS } from './stations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// How many days of history to request per run. One past day comfortably
// covers the gap since the last hourly run (with overlap, so a missed run
// isn't lossy); raise it to seed history on a fresh checkout. The air
// quality API caps this at 92.
const PAST_DAYS = Number(process.env.AQI_PAST_DAYS || 1);

// A reading is only counted as "live" for the online flag if it is within
// this window - the model publishes hourly, so anything older means the
// upstream feed has stalled.
const ONLINE_WINDOW_MS = 3 * 60 * 60 * 1000;

// Sensor field -> upstream Open-Meteo variable. Field names match the CSV
// columns and the dashboard's SENSOR_META keys.
const AIR_QUALITY_FIELDS = {
  aqi: 'us_aqi',
  pm25: 'pm2_5',
  pm10: 'pm10',
  co: 'carbon_monoxide',
  co2: 'carbon_dioxide',
  no2: 'nitrogen_dioxide',
  o3: 'ozone',
  so2: 'sulphur_dioxide',
  dust: 'dust',
  uv: 'uv_index'
};

const WEATHER_FIELDS = {
  temp: 'temperature_2m',
  hum: 'relative_humidity_2m'
};

const SENSOR_FIELDS = [...Object.keys(AIR_QUALITY_FIELDS), ...Object.keys(WEATHER_FIELDS)];

const GEOJSON_OUTPUT_DIR = path.join(ROOT_DIR, 'output/geojson');
const CSV_OUTPUT_DIR = path.join(ROOT_DIR, 'output/csv');
const STATE_DIR = path.join(ROOT_DIR, 'output/state');
const GEOJSON_FILE = path.join(GEOJSON_OUTPUT_DIR, 'aqi-latest.geojson');
const MANIFEST_FILE = path.join(ROOT_DIR, 'output/manifest.json');
const STATE_FILE = path.join(STATE_DIR, 'last-timestamps.json');

for (const dir of [GEOJSON_OUTPUT_DIR, CSV_OUTPUT_DIR, STATE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Kashmir is IST (UTC+5:30). CSV logs are bucketed by IST calendar day so a
// day's file lines up with local sunrise-to-sunrise readings.
function toISTDayString(date) {
  const ist = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
  const iso = ist.toISOString();
  return iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10);
}

function escapeCsvField(field) {
  if (field === null || field === undefined) return '';
  const stringField = String(field);
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; aqikashmir/1.0; +https://github.com/syedhamidali/aqikashmir)'
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText}): ${url}`);
  }
  return response.json();
}

// Open-Meteo accepts comma-separated coordinate lists and returns one result
// object per coordinate, in request order - so every station is covered by a
// single request. A single-coordinate request returns a bare object rather
// than a list, hence the normalisation here.
async function fetchHourlySeries(baseUrl, variables) {
  const params = new URLSearchParams({
    latitude: STATIONS.map(s => s.latitude).join(','),
    longitude: STATIONS.map(s => s.longitude).join(','),
    hourly: Object.values(variables).join(','),
    past_days: String(PAST_DAYS),
    forecast_days: '1',
    timezone: 'UTC'
  });
  const json = await fetchJson(`${baseUrl}?${params}`);
  const results = Array.isArray(json) ? json : [json];
  if (results.length !== STATIONS.length) {
    throw new Error(`Expected ${STATIONS.length} results from ${baseUrl}, got ${results.length}`);
  }
  return results;
}

// Turns the API's column-oriented hourly response ({ time: [...], pm10: [...] })
// into a per-station map of ISO timestamp -> { field: value }, merging the air
// quality and weather responses onto a shared hourly grid. Hours in the future
// are dropped: the endpoints return a forecast tail, and this is an archive of
// what was actually observed.
function buildReadings(airResults, weatherResults) {
  const now = Date.now();
  const byStation = new Map();

  for (const [index, station] of STATIONS.entries()) {
    const readings = new Map();

    const collect = (result, fieldMap) => {
      const hourly = result?.hourly;
      if (!hourly?.time) return;
      for (const [row, rawTime] of hourly.time.entries()) {
        // The API returns naive UTC timestamps ("2026-08-23T05:00"); make the
        // zone explicit so downstream Date parsing can't drift by the local
        // offset of whatever machine runs this.
        const time = `${rawTime}:00Z`;
        if (new Date(time).getTime() > now) continue;
        let entry = readings.get(time);
        if (!entry) { entry = {}; readings.set(time, entry); }
        for (const [field, variable] of Object.entries(fieldMap)) {
          const value = hourly[variable]?.[row];
          if (value !== null && value !== undefined) entry[field] = value;
        }
      }
    };

    collect(airResults[index], AIR_QUALITY_FIELDS);
    collect(weatherResults[index], WEATHER_FIELDS);

    // Drop hours where the air quality model has nothing - a weather-only row
    // would log a temperature with a blank AQI and read as a dead sensor.
    for (const [time, entry] of readings) {
      if (entry.aqi === undefined && entry.pm25 === undefined) readings.delete(time);
    }

    byStation.set(station.station_id, [...readings.entries()]
      .map(([time, values]) => ({ time, ...values }))
      .sort((a, b) => a.time.localeCompare(b.time)));
  }

  return byStation;
}

function unitsFrom(result, fieldMap) {
  const units = {};
  const upstream = result?.hourly_units || {};
  for (const [field, variable] of Object.entries(fieldMap)) {
    if (upstream[variable]) units[`${field}_unit`] = upstream[variable];
  }
  return units;
}

function buildGeoJson(readingsByStation, airResults, weatherResults) {
  const now = Date.now();
  const features = STATIONS.map((station, index) => {
    const rows = readingsByStation.get(station.station_id) || [];
    const latest = rows[rows.length - 1] || {};
    const { time, ...values } = latest;
    const units = {
      ...unitsFrom(airResults[index], AIR_QUALITY_FIELDS),
      ...unitsFrom(weatherResults[index], WEATHER_FIELDS)
    };
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
      properties: {
        station_id: station.station_id,
        name: station.name,
        district: station.district,
        online: !!time && (now - new Date(time).getTime()) < ONLINE_WINDOW_MS,
        time: time || null,
        ...values,
        ...units
      }
    };
  });

  return {
    type: 'FeatureCollection',
    metadata: {
      source: 'https://open-meteo.com/en/docs/air-quality-api',
      model: 'ECMWF CAMS global atmospheric composition',
      timestamp: new Date().toISOString(),
      count: features.length
    },
    features
  };
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const CSV_HEADER = ['time', 'station_id', 'name', 'latitude', 'longitude', ...SENSOR_FIELDS];

function appendRowsToDayFiles(rowsByDay) {
  const touchedFiles = [];
  for (const [day, rows] of Object.entries(rowsByDay)) {
    const filePath = path.join(CSV_OUTPUT_DIR, `aqi-${day}.csv`);
    const isNewFile = !fs.existsSync(filePath);
    if (isNewFile) {
      fs.writeFileSync(filePath, CSV_HEADER.join(',') + '\n');
    }
    // Sorted so a day's file reads chronologically even though rows arrive
    // grouped by station.
    rows.sort((a, b) => a.time.localeCompare(b.time));
    const lines = rows.map(row => CSV_HEADER.map(field => escapeCsvField(row[field])).join(','));
    fs.appendFileSync(filePath, lines.join('\n') + '\n');
    touchedFiles.push(path.basename(filePath));
  }
  return touchedFiles;
}

function updateManifest() {
  const existingCsvFiles = fs.readdirSync(CSV_OUTPUT_DIR).filter(f => f.endsWith('.csv')).sort();
  const manifest = {
    updatedAt: new Date().toISOString(),
    source: 'https://open-meteo.com/en/docs/air-quality-api',
    model: 'ECMWF CAMS global atmospheric composition',
    fields: SENSOR_FIELDS,
    stations: STATIONS.map(station => ({ ...station, sensors: SENSOR_FIELDS })),
    csvFiles: existingCsvFiles
  };
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function fetchAndLogAqiData() {
  log(`Fetching air quality + weather for ${STATIONS.length} stations (past_days=${PAST_DAYS})...`);
  const [airResults, weatherResults] = await Promise.all([
    fetchHourlySeries(AIR_QUALITY_URL, AIR_QUALITY_FIELDS),
    fetchHourlySeries(WEATHER_URL, WEATHER_FIELDS)
  ]);

  const readingsByStation = buildReadings(airResults, weatherResults);

  log('Writing latest-reading GeoJSON snapshot...');
  const geojson = buildGeoJson(readingsByStation, airResults, weatherResults);
  fs.writeFileSync(GEOJSON_FILE, JSON.stringify(geojson, null, 2));
  log(`Wrote ${geojson.features.length} features to ${path.relative(ROOT_DIR, GEOJSON_FILE)}`);

  // Append only readings newer than the last run's high-water mark per
  // station - this is what makes overlapping fetch windows safe to re-run.
  const state = loadState();
  const rowsByDay = {};
  let totalNewRows = 0;

  for (const station of STATIONS) {
    const lastSeen = state[station.station_id];
    let newestTime = lastSeen || null;

    for (const reading of readingsByStation.get(station.station_id) || []) {
      if (lastSeen && reading.time <= lastSeen) continue;

      const day = toISTDayString(new Date(reading.time));
      if (!rowsByDay[day]) rowsByDay[day] = [];

      const row = {
        time: reading.time,
        station_id: station.station_id,
        name: station.name,
        latitude: station.latitude,
        longitude: station.longitude
      };
      for (const field of SENSOR_FIELDS) {
        row[field] = reading[field] !== undefined ? Number(reading[field]) : '';
      }
      rowsByDay[day].push(row);
      totalNewRows += 1;

      if (!newestTime || reading.time > newestTime) newestTime = reading.time;
    }

    if (newestTime) state[station.station_id] = newestTime;
  }

  log(`Collected ${totalNewRows} new readings across ${Object.keys(rowsByDay).length} day(s)`);
  const touchedFiles = appendRowsToDayFiles(rowsByDay);
  saveState(state);

  const manifest = updateManifest();
  log(`Manifest updated with ${manifest.stations.length} stations and ${manifest.csvFiles.length} CSV file(s)`);

  return { stationCount: STATIONS.length, newRows: totalNewRows, touchedFiles };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchAndLogAqiData().catch(error => {
    console.error('ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}
