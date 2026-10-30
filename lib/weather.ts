export type WeatherKind = "clear" | "partly" | "cloudy" | "rain" | "snow" | "fog" | "storm" | "wind";

export interface WeatherInfo {
  temp: number;
  text: string;
  kind: WeatherKind;
  city: string;
}

export class WeatherError extends Error {
  denied: boolean;

  constructor(message: string, denied = false) {
    super(message);
    this.denied = denied;
  }
}

const CACHE_KEY = "meal-diary-weather-v1";
const CACHE_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT = 9000;

// 填了高德的 Web 服务 Key 就优先走高德；留空或请求失败时用免 Key 的天气服务。
const AMAP_KEY = ((import.meta.env.VITE_AMAP_KEY as string | undefined) ?? "").trim();

interface Cached {
  at: number;
  data: WeatherInfo;
}

function readCache(): WeatherInfo | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed?.data || Date.now() - parsed.at > CACHE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data: WeatherInfo) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // private mode: a live fetch next time is fine
  }
}

/** City from the last cached weather, so place search can start from where the user is. */
export function cachedWeatherCity() {
  return readCache()?.city ?? "";
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`天气服务返回了 ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  } finally {
    window.clearTimeout(timer);
  }
}

function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new WeatherError("这个浏览器不支持定位"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        reject(new WeatherError(denied ? "定位没打开" : "定位没有成功", denied));
      },
      { enableHighAccuracy: false, timeout: REQUEST_TIMEOUT, maximumAge: 10 * 60 * 1000 },
    );
  });
}

function amapKind(text: string): WeatherKind {
  if (/雷/.test(text)) return "storm";
  if (/雪/.test(text)) return "snow";
  if (/雨/.test(text)) return "rain";
  if (/雾|霾/.test(text)) return "fog";
  if (/沙|尘|风|台/.test(text)) return "wind";
  if (/阴/.test(text)) return "cloudy";
  if (/多云/.test(text)) return "partly";
  return "clear";
}

function wmoInfo(code: number): { text: string; kind: WeatherKind } {
  if (code === 0) return { text: "晴", kind: "clear" };
  if (code === 1) return { text: "晴间多云", kind: "partly" };
  if (code === 2) return { text: "多云", kind: "partly" };
  if (code === 3) return { text: "阴", kind: "cloudy" };
  if (code === 45 || code === 48) return { text: "有雾", kind: "fog" };
  if (code >= 51 && code <= 57) return { text: "毛毛雨", kind: "rain" };
  if (code >= 61 && code <= 65) return { text: "下雨", kind: "rain" };
  if (code === 66 || code === 67) return { text: "冻雨", kind: "rain" };
  if (code >= 71 && code <= 77) return { text: "下雪", kind: "snow" };
  if (code >= 80 && code <= 82) return { text: "阵雨", kind: "rain" };
  if (code === 85 || code === 86) return { text: "阵雪", kind: "snow" };
  if (code >= 95) return { text: "雷阵雨", kind: "storm" };
  return { text: "天气", kind: "partly" };
}

// 直辖市的 addressComponent.city 会返回空数组，所以逐级往下取。
function amapPlace(component: Record<string, unknown> | undefined): string {
  for (const key of ["city", "province", "district"]) {
    const value = component?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function fromAmap(lon: number, lat: number): Promise<WeatherInfo> {
  const geo = await getJson(
    `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(AMAP_KEY)}&location=${lon.toFixed(6)},${lat.toFixed(6)}&extensions=base`,
  );
  if (geo.status !== "1") throw new Error("高德定位没成功");
  const component = (geo.regeocode as { addressComponent?: Record<string, unknown> } | undefined)?.addressComponent;
  const adcode = typeof component?.adcode === "string" ? component.adcode : "";
  if (!adcode) throw new Error("没找到你所在的城市");

  const live = await getJson(
    `https://restapi.amap.com/v3/weather/weatherInfo?key=${encodeURIComponent(AMAP_KEY)}&city=${adcode}&extensions=base`,
  );
  const info = (live.lives as Array<Record<string, string>> | undefined)?.[0];
  if (!info) throw new Error("高德暂时没有这座城市的天气");
  const text = info.weather || "天气";
  return {
    temp: Math.round(Number(info.temperature)),
    text,
    kind: amapKind(text),
    city: amapPlace(component) || info.city || "",
  };
}

async function fromOpenMeteo(lon: number, lat: number): Promise<WeatherInfo> {
  const [weather, place] = await Promise.all([
    getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code&timezone=auto`,
    ),
    getJson(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&localityLanguage=zh`,
    ).catch(() => null),
  ]);

  const current = weather.current as { temperature_2m?: number; weather_code?: number } | undefined;
  if (typeof current?.temperature_2m !== "number") throw new Error("天气服务没有返回结果");
  const info = wmoInfo(Number(current.weather_code ?? 3));
  const city =
    (place?.city as string) || (place?.locality as string) || (place?.principalSubdivision as string) || "";
  return { temp: Math.round(current.temperature_2m), text: info.text, kind: info.kind, city };
}

export async function loadWeather(): Promise<WeatherInfo> {
  const cached = readCache();
  if (cached) return cached;

  const position = await locate();
  const lon = position.coords.longitude;
  const lat = position.coords.latitude;
  let info: WeatherInfo;
  if (AMAP_KEY) {
    try {
      info = await fromAmap(lon, lat);
    } catch {
      // 高德额度用尽或网关抽风时，退回免 Key 服务，别让卡片空着。
      info = await fromOpenMeteo(lon, lat);
    }
  } else {
    info = await fromOpenMeteo(lon, lat);
  }
  writeCache(info);
  return info;
}
