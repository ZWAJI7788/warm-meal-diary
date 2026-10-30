import { cachedWeatherCity } from "@/lib/weather";

const AMAP_KEY = ((import.meta.env.VITE_AMAP_KEY as string | undefined) ?? "").trim();
const CITY_KEY = "meal-diary-place-city";
const REQUEST_TIMEOUT = 9000;

export interface PlaceOption {
  id: string;
  /** Only the name is kept in the diary — like picking a location in WeChat. */
  name: string;
  /** Extra line for the picker list: district, street or distance. */
  detail: string;
}

export class PlacesError extends Error {}

export function placesEnabled() {
  return Boolean(AMAP_KEY);
}

function readCity() {
  try {
    return sessionStorage.getItem(CITY_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberCity(city: string) {
  try {
    sessionStorage.setItem(CITY_KEY, city);
  } catch {
    // private mode: search without a city bias next time is fine
  }
}

/** City used to bias keyword search, from the last nearby lookup or the weather card. */
export function knownCity() {
  return readCity() || cachedWeatherCity();
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new PlacesError("高德地图没回应");
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PlacesError) throw error;
    throw new PlacesError("地图请求失败了，先手动写吧");
  } finally {
    window.clearTimeout(timer);
  }
}

function text(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed === "[]" ? "" : trimmed;
}

// 直辖市的 addressComponent.city 会返回空数组，所以逐级往下取。
function cityOf(component: Record<string, unknown> | undefined) {
  for (const key of ["city", "province"]) {
    const value = text(component?.[key]);
    if (value) return value;
  }
  return "";
}

function distanceLabel(value: unknown) {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters <= 0) return "";
  return meters < 1000 ? `${Math.round(meters)} 米` : `${(meters / 1000).toFixed(1)} 公里`;
}

function detailOf(district: unknown, address: unknown, distance: unknown) {
  const parts = [text(district), text(address), distanceLabel(distance)].filter(Boolean);
  return parts.join(" · ");
}

export async function searchPlaces(keyword: string): Promise<PlaceOption[]> {
  const word = keyword.trim();
  if (!word) return [];
  if (!AMAP_KEY) throw new PlacesError("还没有配置高德 Key");

  const params = new URLSearchParams({ key: AMAP_KEY, keywords: word, datatype: "poi" });
  const city = knownCity();
  if (city) params.set("city", city);

  const data = await getJson(`https://restapi.amap.com/v3/assistant/inputtips?${params.toString()}`);
  if (data.status !== "1") throw new PlacesError("高德没返回结果，先手动写吧");

  const tips = Array.isArray(data.tips) ? (data.tips as Array<Record<string, unknown>>) : [];
  const seen = new Set<string>();
  const options: PlaceOption[] = [];
  for (const tip of tips) {
    const name = text(tip.name);
    if (!name) continue;
    const key = `${name}|${text(tip.district)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      id: text(tip.id) || key,
      name,
      detail: detailOf(tip.district, tip.address, null),
    });
    if (options.length >= 12) break;
  }
  return options;
}

function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new PlacesError("这个浏览器不支持定位，搜一下店名也可以"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        reject(
          new PlacesError(
            error.code === error.PERMISSION_DENIED
              ? "定位没打开，搜一下店名也可以"
              : "没定位到你，搜一下店名也可以",
          ),
        );
      },
      { enableHighAccuracy: false, timeout: REQUEST_TIMEOUT, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/** Restaurants within walking distance of where the user is standing. */
export async function nearbyPlaces(): Promise<PlaceOption[]> {
  if (!AMAP_KEY) throw new PlacesError("还没有配置高德 Key");
  const position = await locate();
  const location = `${position.coords.longitude.toFixed(6)},${position.coords.latitude.toFixed(6)}`;

  const geo = await getJson(
    `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(AMAP_KEY)}&location=${location}&extensions=base`,
  );
  if (geo.status === "1") {
    const city = cityOf(
      (geo.regeocode as { addressComponent?: Record<string, unknown> } | undefined)?.addressComponent,
    );
    if (city) rememberCity(city);
  }

  const around = await getJson(
    `https://restapi.amap.com/v3/place/around?key=${encodeURIComponent(AMAP_KEY)}&location=${location}&types=050000&radius=1500&offset=12&page=1&sortrule=distance&extensions=base`,
  );
  if (around.status !== "1") throw new PlacesError("附近的地点没取到，搜一下店名也可以");

  const pois = Array.isArray(around.pois) ? (around.pois as Array<Record<string, unknown>>) : [];
  return pois
    .map((poi) => {
      const name = text(poi.name);
      const parts = [text(poi.adname), text(poi.address), distanceLabel(poi.distance)].filter(Boolean);
      return { id: text(poi.id) || name, name, detail: parts.join(" · ") };
    })
    .filter((option) => option.name)
    .slice(0, 12);
}
