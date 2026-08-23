/**
 * Quick connectivity check against the Open-Meteo air quality API, used by
 * the CI workflow to confirm the upstream feed is reachable and actually
 * returning values for Kashmir before running the logger.
 */

import { STATIONS } from './stations.js';

const station = STATIONS[0];
const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${station.latitude}` +
  `&longitude=${station.longitude}&current=us_aqi,pm2_5&timezone=UTC`;

async function main() {
  console.log(`Testing ${url}`);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Air quality endpoint returned ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  const current = json?.current;
  if (!current || current.us_aqi === undefined) {
    throw new Error('Air quality endpoint returned no current reading');
  }
  console.log(`OK: ${station.name} AQI ${current.us_aqi}, PM2.5 ${current.pm2_5} at ${current.time}`);
}

main().catch(error => {
  console.error('Connectivity test FAILED:', error.message);
  process.exit(1);
});
