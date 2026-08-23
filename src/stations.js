/**
 * Monitoring points for the Kashmir Valley.
 *
 * Unlike the sensor-network project this is modelled on, there is no public
 * live-sensor API covering Kashmir, so the "stations" here are fixed
 * locations we sample the CAMS atmospheric-composition model at (see
 * fetch-aqi.js). `station_id` is a stable slug used as the primary key in
 * the GeoJSON, the CSV log and the dashboard URL state - never renumber or
 * rename one, or its archived history stops joining up.
 *
 * Points are spaced roughly a model grid-cell apart; adding two towns within
 * a few km of each other just duplicates the same interpolated values.
 */

export const STATIONS = [
  { station_id: 'srinagar',   name: 'Srinagar',    district: 'Srinagar',   latitude: 34.0837, longitude: 74.7973 },
  { station_id: 'anantnag',   name: 'Anantnag',    district: 'Anantnag',   latitude: 33.7311, longitude: 75.1487 },
  { station_id: 'baramulla',  name: 'Baramulla',   district: 'Baramulla',  latitude: 34.1980, longitude: 74.3636 },
  { station_id: 'budgam',     name: 'Budgam',      district: 'Budgam',     latitude: 33.9299, longitude: 74.7857 },
  { station_id: 'bandipora',  name: 'Bandipora',   district: 'Bandipora',  latitude: 34.4177, longitude: 74.6431 },
  { station_id: 'ganderbal',  name: 'Ganderbal',   district: 'Ganderbal',  latitude: 34.2265, longitude: 74.7748 },
  { station_id: 'kulgam',     name: 'Kulgam',      district: 'Kulgam',     latitude: 33.6444, longitude: 75.0192 },
  { station_id: 'kupwara',    name: 'Kupwara',     district: 'Kupwara',    latitude: 34.5262, longitude: 74.2546 },
  { station_id: 'pulwama',    name: 'Pulwama',     district: 'Pulwama',    latitude: 33.8716, longitude: 74.8988 },
  { station_id: 'shopian',    name: 'Shopian',     district: 'Shopian',    latitude: 33.7167, longitude: 74.8333 },
  { station_id: 'sopore',     name: 'Sopore',      district: 'Baramulla',  latitude: 34.2870, longitude: 74.4670 },
  { station_id: 'handwara',   name: 'Handwara',    district: 'Kupwara',    latitude: 34.4000, longitude: 74.2800 },
  { station_id: 'gulmarg',    name: 'Gulmarg',     district: 'Baramulla',  latitude: 34.0484, longitude: 74.3805 },
  { station_id: 'pahalgam',   name: 'Pahalgam',    district: 'Anantnag',   latitude: 34.0159, longitude: 75.3151 },
  { station_id: 'sonamarg',   name: 'Sonamarg',    district: 'Ganderbal',  latitude: 34.3050, longitude: 75.2930 },
  { station_id: 'yusmarg',    name: 'Yusmarg',     district: 'Budgam',     latitude: 33.8300, longitude: 74.6600 },
  { station_id: 'tangmarg',   name: 'Tangmarg',    district: 'Baramulla',  latitude: 34.0450, longitude: 74.4290 },
  { station_id: 'uri',        name: 'Uri',         district: 'Baramulla',  latitude: 34.0790, longitude: 74.0500 },
  { station_id: 'awantipora', name: 'Awantipora',  district: 'Pulwama',    latitude: 33.9200, longitude: 75.0100 },
  { station_id: 'bijbehara',  name: 'Bijbehara',   district: 'Anantnag',   latitude: 33.7930, longitude: 75.1050 },
  { station_id: 'qazigund',   name: 'Qazigund',    district: 'Anantnag',   latitude: 33.6400, longitude: 75.1500 },
  { station_id: 'verinag',    name: 'Verinag',     district: 'Anantnag',   latitude: 33.5500, longitude: 75.2540 },
  { station_id: 'kokernag',   name: 'Kokernag',    district: 'Anantnag',   latitude: 33.5900, longitude: 75.3200 },
  { station_id: 'tral',       name: 'Tral',        district: 'Pulwama',    latitude: 33.9350, longitude: 75.1100 },
  { station_id: 'beerwah',    name: 'Beerwah',     district: 'Budgam',     latitude: 33.9950, longitude: 74.7100 },
  { station_id: 'banihal',    name: 'Banihal',     district: 'Ramban',     latitude: 33.4380, longitude: 75.1970 },
  { station_id: 'gurez',      name: 'Gurez (Dawar)', district: 'Bandipora', latitude: 34.6300, longitude: 74.8300 },
  { station_id: 'tangdhar',   name: 'Tangdhar',    district: 'Kupwara',    latitude: 34.6900, longitude: 74.0800 }
];

export const STATIONS_BY_ID = new Map(STATIONS.map(s => [s.station_id, s]));
