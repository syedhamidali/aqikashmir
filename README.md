# AQI Kashmir

Hourly air quality archive and live dashboard for the **Kashmir Valley** — 28 towns from Uri to Pahalgam, Gurez to Banihal.

**Live Dashboard**: [syedhamidali.github.io/aqikashmir](https://syedhamidali.github.io/aqikashmir/) — MapLibre map of current AQI per station, click a point for readings + history. On open, the dashboard fetches live readings directly from the Open-Meteo API (badge shows "Live"); if that's unreachable it falls back to the last hourly-logged snapshot (badge shows "Offline"). Each station panel has a "Download CSV" button for that station's time series.

> **Where the numbers come from.** There is no public network of live ground sensors covering Kashmir, so this project does **not** scrape physical monitors. Readings are sampled from the **ECMWF CAMS global atmospheric composition model** via the [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) at each town's coordinates. That is a ~40 km modelled estimate, not a calibrated instrument reading — good for regional trends and day-to-day comparison, not a substitute for a CPCB reference station. See [Why there are no ground sensors here](#why-there-are-no-ground-sensors-here).

**Data**
- Latest snapshot (one point per station): [`output/geojson/aqi-latest.geojson`](output/geojson/aqi-latest.geojson)
- Full time series, one CSV per day: [`output/csv/`](output/csv/)
- Station/file index: [`output/manifest.json`](output/manifest.json)

## Details

A GitHub Actions workflow runs every hour and:
1. Fetches hourly air quality + weather for all 28 stations from Open-Meteo (two batched requests, no API key)
2. Writes `output/geojson/aqi-latest.geojson` — a snapshot with the latest reading per station
3. Appends only genuinely new readings to a daily CSV under `output/csv/`, deduplicated against the per-station high-water mark in `output/state/last-timestamps.json`
4. Updates `output/manifest.json`, which the dashboard uses to know which stations and CSV files exist

Because each run requests a full past day and only appends what is new, a missed run is not lossy.

### Development

```bash
npm install     # no external dependencies today, but keeps this future-proof
npm test        # checks the API is reachable and returning values for Kashmir
npm start       # fetch latest data + append to today's CSV log
```

To seed history on a fresh checkout (the API serves up to 92 past days):

```bash
rm -f output/csv/*.csv output/state/last-timestamps.json   # clear the dedup high-water marks first
AQI_PAST_DAYS=92 npm start
```

The same backfill is available from the Actions tab — run the **Refresh AQI Data** workflow manually and set `past_days`.

### Viewing the dashboard locally

```bash
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

### Adding or moving stations

Edit [`src/stations.js`](src/stations.js) — the dashboard reads its station list from the generated snapshot, so no frontend change is needed. Keep `station_id` stable once it has been published, or that station's archived history stops joining up. Points closer together than about a model grid cell (~40 km) will report near-identical values.

### Why there are no ground sensors here

This was investigated with a live WAQI API token on 23 August 2026, and the answer is that **there is currently no usable ground-monitoring data for the Kashmir Valley**:

- A bounding-box query across all of Jammu & Kashmir and Ladakh (32–36°N, 73–80°E) returns **zero stations**.
- The one CPCB reference monitor in the valley — *Rajbagh, Srinagar* (WAQI uid 13694) — **last reported on 23 June 2026** (its final reading was AQI 52). It is not currently publishing.
- The nearest station reporting live data is **608 km away, in Kashgar, China**.

Separately, WAQI's [terms of service](https://aqicn.org/api/) state that their data "can not be redistributed as cached or archived data" — which is incompatible with this project, whose entire purpose is a public CSV archive. WAQI is therefore only usable for live on-page display, not for the archive.

[OpenAQ](https://openaq.org) remains the one route that would permit archiving (its data is CC BY 4.0), so if the Srinagar station comes back online, that is where to integrate it. The hook would be in `src/fetch-aqi.js`: fetch measured stations alongside the model, tag each feature `measured` vs `modelled`, and style the two differently on the map.

Until then, the CAMS model is genuinely the best available data for the region — which is the reason this project exists.

## Data format

**`output/geojson/aqi-latest.geojson`** — one `Point` feature per station. Properties include every sensor field (`aqi`, `pm25`, `pm10`, `co`, `co2`, `no2`, `o3`, `so2`, `dust`, `uv`, `temp`, `hum`, plus `<field>_unit`), `station_id`, `name`, `district`, `online`, and `time` (timestamp of the latest reading).

**`output/csv/aqi-YYYYMMDD.csv`** (bucketed by IST calendar day) — columns: `time, station_id, name, latitude, longitude, aqi, pm25, pm10, co, co2, no2, o3, so2, dust, uv, temp, hum`. One row per station per hour.

`aqi` is the **US EPA AQI**, matching the colour breakpoints in the dashboard legend (0/51/101/151/201/301).

## Credits

Structure, dashboard and data-logging approach adapted from [publicmap/goa-aqi-logger](https://github.com/publicmap/goa-aqi-logger). Weather and air quality data by [Open-Meteo](https://open-meteo.com) (CC BY 4.0), derived from ECMWF CAMS. Basemap by [OpenFreeMap](https://openfreemap.org) / OpenStreetMap contributors.
