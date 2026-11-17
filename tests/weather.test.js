import { test } from 'node:test';
import assert from 'node:assert/strict';
const weather = import('../src/lib/weather.js');
test('weather mock is explicit, bounded, and independent of preview parameters', async () => {
  const { parseWeatherMock } = await weather;
  assert.equal(parseWeatherMock(new URLSearchParams('weatherPreview=yuan-snow')), null);
  assert.deepEqual(parseWeatherMock(new URLSearchParams('mock=weather&character=yuan&scene=snow&temp=-4&place=测试城市')), { character: 'yuan', scene: 'snow', temperature: -4, place: '测试城市' });
  const invalid = parseWeatherMock(new URLSearchParams('mock=weather&character=bad&scene=__proto__&temp=Infinity'));
  assert.equal(invalid.character, 'hanako'); assert.equal(invalid.scene, 'cloudy'); assert.equal(invalid.temperature, 24);
  assert.equal(parseWeatherMock(new URLSearchParams('mock=weather&temp=100')).temperature, 60);
});
test('all fog/snow codes and eighteen explicit previews are supported', async () => {
  const { weatherAppearance, weatherPreview } = await weather;
  for (const code of [45, 48]) assert.equal(weatherAppearance(code, 100).scene, 'fog');
  for (const code of [71, 73, 75, 77, 85, 86]) assert.equal(weatherAppearance(code, 100).scene, 'snow');
  for (const person of ['hanako', 'yuan', 'yuu']) for (const scene of ['sunny', 'cloudy', 'rainy', 'windy', 'fog', 'snow']) assert.equal(weatherPreview(`${person}-${scene}`), `${person}-${scene}`);
  for (const value of ['yuan-hail', '../snow', '', null]) assert.equal(weatherPreview(value), '');
  assert.deepEqual(weatherAppearance(999, 100), { text: '天气状况未知', scene: 'cloudy' });
});
test('illustration choice persists for its date only and cycles in order', async () => {
  const { selectedWeatherCharacter, nextWeatherCharacter, dailyAssistant } = await weather;
  assert.deepEqual(['hanako', 'yuan', 'yuu'].map(nextWeatherCharacter), ['yuan', 'yuu', 'hanako']);
  assert.equal(selectedWeatherCharacter({ date: '2026-11-17', character: 'yuan' }, '2026-11-17'), 'yuan');
  assert.equal(selectedWeatherCharacter({ date: '2026-11-16', character: 'yuan' }, '2026-11-17'), dailyAssistant('2026-11-17'));
  assert.equal(selectedWeatherCharacter({ date: '2026-11-17', character: 'invalid' }, '2026-11-17'), dailyAssistant('2026-11-17'));
});
test('location requests reduce precision and never invent a city from IP fallback', async () => {
  const { coarseLocation, localityLabel } = await weather;
  assert.deepEqual(coarseLocation({ latitude: 23.129134, longitude: 113.264412 }), { latitude: 23.13, longitude: 113.26 });
  assert.throws(() => coarseLocation({ latitude: 91, longitude: 0 }));
  assert.equal(localityLabel({ lookupSource: 'coordinates', city: '广州市', locality: '越秀区' }), '广州市 · 越秀区');
  assert.equal(localityLabel({ lookupSource: 'coordinates', city: '广州市', locality: '广州市' }), '广州市');
  assert.throws(() => localityLabel({ lookupSource: 'ip', city: '广州' }));
  assert.throws(() => localityLabel({ lookupSource: 'coordinates' }));
});
test('weather scenes preserve rain and neutral snow/fog despite strong wind', async () => {
  const { weatherAppearance } = await weather;
  assert.equal(weatherAppearance(0, 10).scene, 'sunny');
  assert.equal(weatherAppearance(3, 10).scene, 'cloudy');
  assert.equal(weatherAppearance(2, 28).scene, 'windy');
  assert.deepEqual(weatherAppearance(65, 60), { text: '大雨', scene: 'rainy' });
  assert.deepEqual(weatherAppearance(75, 60), { text: '大雪', scene: 'snow' });
  assert.deepEqual(weatherAppearance(45, 60), { text: '雾', scene: 'fog' });
  assert.equal(weatherAppearance(999, 60).scene, 'cloudy');
});
test('date uses location timezone and characters rotate stably', async () => {
  const { localDateKey, dailyAssistant } = await weather;
  const instant = new Date('2026-11-16T16:30:00Z');
  assert.equal(localDateKey(instant, 'Asia/Shanghai'), '2026-11-17');
  assert.equal(localDateKey(instant, 'America/New_York'), '2026-11-16');
  assert.equal(dailyAssistant('2026-11-17'), dailyAssistant('2026-11-17'));
  assert.equal(new Set(['2026-11-17', '2026-11-18', '2026-11-19'].map(dailyAssistant)).size, 3);
});
test('weather rejects missing, stale and incorrect-unit data without fake temperatures', async () => {
  const { parseWeather } = await weather;
  const now = Date.now();
  const payload = { current: { temperature_2m: 0, weather_code: 3, wind_speed_10m: 12, time: now / 1000 }, current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' }, timezone: 'Asia/Shanghai' };
  assert.equal(parseWeather(payload, now).temperature, 0);
  assert.throws(() => parseWeather({}, now));
  assert.throws(() => parseWeather(payload, now + 91 * 60 * 1000));
  assert.throws(() => parseWeather({ ...payload, current: { ...payload.current, temperature_2m: null } }, now));
  assert.throws(() => parseWeather({ ...payload, timezone: 'invalid' }, now));
  assert.throws(() => parseWeather({ ...payload, current_units: { temperature_2m: '°F' } }, now));
});
