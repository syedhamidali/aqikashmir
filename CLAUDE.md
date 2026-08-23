# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Archives hourly air quality for 28 towns in the Kashmir Valley and serves a static MapLibre + Chart.js dashboard from GitHub Pages. Structure is adapted from [publicmap/goa-aqi-logger](https://github.com/publicmap/goa-aqi-logger), but the data source is different and that difference matters: the Goa project scrapes a real sensor network (`backend.aqionline.in`), which has **no devices anywhere near Kashmir** (its coverage tops out around 19.9°N; Srinagar is 34.1°N). So this project samples the **ECMWF CAMS global model** via Open-Meteo's keyless air quality API instead. Values are modelled estimates at ~40 km resolution, not instrument readings — keep that caveat visible in any user-facing copy.

## Key Scripts

```bash
npm test    # src/test-connectivity.js — checks the air quality API returns a current reading for Srinagar
npm start   # src/fetch-aqi.js — fetch + write output/geojson and output/csv
AQI_PAST_DAYS=92 npm start   # seed longer history (the API serves up to 92 past days)
```

Backfilling older data requires clearing `output/state/last-timestamps.json` **and** the CSVs first — dedup is a per-station high-water mark, so a plain re-run with a larger `AQI_PAST_DAYS` silently skips everything already seen.

## Architecture

### Stations (`src/stations.js`)

Fixed list of `{ station_id, name, district, latitude, longitude }`. `station_id` is the primary key across the GeoJSON, the CSV log, MapLibre's `promoteId` feature id, and the dashboard's URL state — renaming one orphans its archived history. Points are spaced roughly a model grid cell apart; two towns within a few km resolve to the same cell and duplicate each other's values.

### Data pipeline (`src/fetch-aqi.js`)

1. Open-Meteo accepts comma-separated coordinate lists and returns one result per coordinate **in request order**, so all 28 stations cost two requests total (air quality + weather). The order dependency is why `fetchHourlySeries` asserts the result count matches `STATIONS.length` rather than matching on the returned coordinates — the API snaps them to the model grid, so they don't equal what was sent.
2. `buildReadings()` transposes the column-oriented hourly response into per-station timestamp maps and merges the two endpoints onto a shared hourly grid. Future hours are dropped (both endpoints return a forecast tail; this is an archive of what was observed), and weather-only rows are discarded so a temperature never gets logged against a blank AQI.
3. Timestamps come back naive (`2026-08-23T05:00`) and are normalised to `...:00Z` before any `Date` parsing, so results don't shift by the local offset of whatever machine runs the job.
4. Rows newer than `output/state/last-timestamps.json[station_id]` are appended to `output/csv/aqi-<IST-YYYYMMDD>.csv`. Requesting a full past day every hour means overlap, so a missed run isn't lossy.
5. `output/manifest.json` lists stations + all CSV filenames so the static dashboard doesn't need directory listing (GitHub Pages can't do that).

### Dashboard (`index.html`)

Single self-contained file. Inherited from the Goa dashboard, so most of its design notes still apply:

- MapLibre GL (OpenFreeMap `liberty` style, no API key) renders the GeoJSON, circles coloured by the standard EPA AQI breakpoints (0/51/101/151/201/301). The `aqi` source/layer are set up as soon as the map's own `load` event fires (or immediately if `map.loaded()` is already true) — intentionally decoupled from the live-data fetch in `init()`; registering `map.on('load', ...)` only after an `await` previously raced the map's own load (tiles cached ⇒ `load` fires first ⇒ listener attaches too late ⇒ source/layer silently never added, no markers, no error).
- `fetchLiveGeoJson()` loads the committed snapshot **first** to get the station list, then overlays live `current=` values from the same two Open-Meteo endpoints. The station list is deliberately never hardcoded in the HTML — adding a station to `src/stations.js` appears on the map after one logger run with no dashboard edit.
- Marker balloons show the AQI number plus the station name. Because `renderMarkerBalloon()` rewrites the marker element's `innerHTML` on every refresh, the name is stashed in `el.dataset.stationName` at marker-creation time rather than kept as a child element.
- A toggleable **shaded AQI surface** (`buildAqiSurface`) inverse-distance-weights the station values onto a 512x512 offscreen canvas, drawn as a MapLibre `image` source beneath `aqi-points-hit` so it can never intercept a click. Three things about it are deliberate: colouring each pixel with `aqiColor()` (already a step function) means the filled EPA bands fall out for free and can never disagree with the legend; the surface **fades to transparent** beyond `SURFACE_FADE_KM` of any station rather than filling its bounding box, because a solid rectangle would imply coverage this interpolation does not have; and isolines are drawn at an **adaptive interval** (`chooseContourStep`) because a fixed one gives 2 lines in summer and 40 in a winter inversion. IDW power is 2 — power 3 turned isolated stations (Gurez, Sonamarg, Tangdhar) into bullseyes.
- Clicking a point opens a side panel: current readings grid, then one small Chart.js line chart per sensor field (small multiples, not overlaid — the fields have very different scales, e.g. CO2 in ppm vs PM2.5 in µg/m³, so a single shared axis would be misleading).
- History is loaded once per panel-open from the daily CSVs listed in `output/manifest.json`, fetching up to `MAX_RANGE_DAYS` (30, +1 buffer day) and filtering client-side by `station_id`. There's no CSV library — the parser is a plain `split(',')`, so **no station name may ever contain a comma**.
- A 1D/1W/1M range selector re-filters that already-fetched superset in memory rather than refetching. The CSV download button exports whatever range is currently selected.
- Each chart draws a smooth min/max "ribbon" — one point per IST calendar day (`computeDailyEnvelope`) — plus a dashed "current live reading" line via a hand-rolled Chart.js plugin (`minMaxBandPlugin`), consistent with the no-extra-dependencies approach above.
- Hovering or clicking a chart shows a synced crosshair (`crosshairPlugin`) at the same timestamp across every field's chart, and swaps the reading tiles to that timestamp's values. Clicking toggles a pin — the primary interaction on touch devices, where there's no hover. Chart.js's native tooltip is disabled so the label can never disagree with the highlighted point.
- On the very first station click, `map.removeFeatureState` throws because the source has never had feature state set; this is caught and logged as a warning on purpose. It is expected, not a regression.

### Git / hosting

- Single branch (`main`) — no separate data branch. The hourly workflow commits directly to `output/` on `main` with `[skip ci]`.
- GitHub Pages serves from `main` / `(root)` so `index.html` can `fetch()` `output/...` with relative paths.

## API Details

Both endpoints are keyless, send `Access-Control-Allow-Origin: *` (so the browser can call them directly), and accept batched coordinates.

**Air quality**: `GET https://air-quality-api.open-meteo.com/v1/air-quality?latitude=<csv>&longitude=<csv>&hourly=us_aqi,pm2_5,pm10,carbon_monoxide,carbon_dioxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust,uv_index&past_days=N&forecast_days=1&timezone=UTC`

**Weather**: `GET https://api.open-meteo.com/v1/forecast?latitude=<csv>&longitude=<csv>&hourly=temperature_2m,relative_humidity_2m&...`

Swap `hourly=` for `current=` for a single latest reading (what the dashboard's live path uses). Note `pm1` is **not** available from this model — that field exists in the upstream Goa project but was removed here; `dust` and `uv` were added in its place.
