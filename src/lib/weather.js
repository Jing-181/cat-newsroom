// 公共模型天气；不写入个人记录，也不把失败值当成实况。
export const DEFAULT_LOCATION = { latitude: 23.1291, longitude: 113.2644, label: '广州 · 默认', timezone: 'Asia/Shanghai' };
const labels = { 0: '晴', 1: '晴间多云', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇', 51: '小毛毛雨', 53: '毛毛雨', 55: '强毛毛雨', 56: '冻毛毛雨', 57: '强冻毛毛雨', 61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨', 71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒', 80: '小阵雨', 81: '阵雨', 82: '强阵雨', 85: '小阵雪', 86: '强阵雪', 95: '雷暴', 96: '雷暴伴冰雹', 99: '强雷暴伴冰雹' };
export function weatherAppearance(code, wind = 0) {
  const rainy = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const ordinary = [0, 1, 2, 3].includes(code);
  const fog = [45, 48].includes(code), snow = [71, 73, 75, 77, 85, 86].includes(code);
  return { text: labels[code] || '天气状况未知', scene: rainy ? 'rainy' : fog ? 'fog' : snow ? 'snow' : ordinary ? (wind >= 28 ? 'windy' : code <= 1 ? 'sunny' : 'cloudy') : 'cloudy' };
}
export const MOCK_SCENES = { sunny: '晴', cloudy: '多云', rainy: '雨', windy: '有风', fog: '雾', snow: '雪' };
export function parseWeatherMock(params) {
  if (params.get('mock') !== 'weather') return null;
  const person = params.get('character'), scene = params.get('scene'), raw = params.get('temp');
  const temperature = raw !== null && raw.trim() !== '' ? Number(raw) : 24;
  return { ...(params.get('art') === 'b-candidate' ? { art: 'b-candidate' } : {}), character: ['hanako', 'yuan', 'yuu'].includes(person) ? person : 'hanako', scene: Object.hasOwn(MOCK_SCENES, scene) ? scene : 'cloudy', temperature: Number.isFinite(temperature) ? Math.max(-60, Math.min(60, temperature)) : 24, place: (params.get('place') || '模拟地点').replace(/[\u0000-\u001f]/g, '').slice(0, 40) || '模拟地点' };
}
export function weatherPreview(value) {
  return /^(hanako|yuan|yuu)-(sunny|cloudy|rainy|windy|fog|snow)$/.test(value || '') ? value : '';
}
export function localDateKey(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export const WEATHER_CHARACTER_KEY = 'cat-newsroom-weather-character-v1';
export function selectedWeatherCharacter(selection, dateKey) {
  return selection?.date === dateKey && ['hanako', 'yuan', 'yuu'].includes(selection.character) ? selection.character : dailyAssistant(dateKey);
}
export function nextWeatherCharacter(character) {
  const people = ['hanako', 'yuan', 'yuu'];
  return people[(people.indexOf(character) + 1) % people.length];
}
export function dailyAssistant(dateKey) {
  return ['hanako', 'yuan', 'yuu'][Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000) % 3];
}
export function parseWeather(payload, now = Date.now()) {
  const c = payload?.current;
  const valid = value => typeof value === 'number' && Number.isFinite(value);
  if (!valid(c?.temperature_2m) || !valid(c?.weather_code) || !valid(c?.wind_speed_10m) || !valid(c?.time)
    || c.temperature_2m < -100 || c.temperature_2m > 70 || c.wind_speed_10m < 0
    || Math.abs(now - c.time * 1000) > 90 * 60 * 1000
    || payload.current_units?.temperature_2m !== '°C' || payload.current_units?.wind_speed_10m !== 'km/h') throw new Error('天气数据缺失或已过期');
  // 校验服务端时区，避免渲染时 Intl 抛错。
  new Intl.DateTimeFormat('zh-CN', { timeZone: payload.timezone }).format();
  if (!payload.timezone) throw new Error('缺少时区');
  return { ...weatherAppearance(c.weather_code, c.wind_speed_10m), temperature: Math.round(c.temperature_2m), wind: Math.round(c.wind_speed_10m), time: c.time * 1000, timezone: payload.timezone };
}
export function coarseLocation(coords) {
  const { latitude, longitude } = coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('无效位置');
  return { latitude: Math.round(latitude * 100) / 100, longitude: Math.round(longitude * 100) / 100 };
}
export function localityLabel(data) {
  if (data?.lookupSource !== 'coordinates') throw new Error('地址不是定位结果');
  const names = [data.city || data.principalSubdivision, data.locality].filter(x => typeof x === 'string' && x.trim());
  if (!names.length) throw new Error('地址未解析');
  return [...new Set(names)].join(' · ');
}
// Only called after a user-triggered HTML5 location grant; no IP fallback or stored coordinates.
export async function reverseLocation(coords, signal) {
  const params = new URLSearchParams({ ...coarseLocation(coords), localityLanguage: 'zh' });
  const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('地址服务暂不可用');
  return localityLabel(await response.json());
}
export async function fetchWeather(location, signal) {
  const params = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, current: 'temperature_2m,weather_code,wind_speed_10m', timezone: 'auto', timeformat: 'unixtime', temperature_unit: 'celsius', wind_speed_unit: 'kmh', forecast_days: '1' });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('天气服务暂不可用');
  return parseWeather(await response.json());
}
