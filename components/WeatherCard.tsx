import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  LocateFixed,
  RotateCw,
  Sun,
  Wind,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { loadWeather, WeatherError, type WeatherInfo, type WeatherKind } from "@/lib/weather";

const ICONS: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  fog: CloudFog,
  storm: CloudLightning,
  wind: Wind,
};

type State =
  | { status: "loading" }
  | { status: "ready"; data: WeatherInfo }
  | { status: "denied" }
  | { status: "error"; message: string };

export function WeatherCard() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await loadWeather();
      setState({ status: "ready", data });
    } catch (error) {
      if (error instanceof WeatherError && error.denied) {
        setState({ status: "denied" });
        return;
      }
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "天气没取到",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "ready") {
    const Icon = ICONS[state.data.kind] ?? CloudSun;
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border border-line/70 bg-paper/70 px-3.5 py-2.5"
        aria-label={`${state.data.city ? `${state.data.city}，` : ""}${state.data.text}，${state.data.temp} 度`}
      >
        <Icon className="size-7 shrink-0 text-honey" strokeWidth={1.6} />
        <div className="leading-tight">
          <p className="font-serif text-[1.35rem] leading-none text-ink">
            {state.data.temp}
            <span className="ml-0.5 align-top text-[0.7rem] text-ink-soft">°C</span>
          </p>
          <p className="mt-1 text-[10px] text-ink-soft">
            {state.data.text}
            {state.data.city ? <span className="opacity-70"> · {state.data.city}</span> : null}
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line/60 bg-paper/50 px-3.5 py-2.5">
        <CloudSun className="size-7 shrink-0 animate-pulse text-honey/70" strokeWidth={1.6} />
        <div className="space-y-1.5">
          <span className="block h-3 w-10 animate-pulse rounded-full bg-line/70" />
          <span className="block h-2 w-16 animate-pulse rounded-full bg-line/50" />
        </div>
      </div>
    );
  }

  if (state.status === "denied") {
    return (
      <button
        type="button"
        onClick={() => void load()}
        className="flex items-center gap-2 rounded-2xl border border-dashed border-line bg-paper/50 px-3.5 py-3 text-left text-[11px] leading-snug text-ink-soft transition-colors hover:border-clay/50 hover:text-ink"
      >
        <LocateFixed className="size-4 shrink-0 text-clay/80" />
        <span>
          开启定位，
          <br />
          看看今天天气
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void load()}
      className="flex items-center gap-2 rounded-2xl border border-dashed border-line bg-paper/50 px-3.5 py-3 text-left text-[11px] leading-snug text-ink-soft transition-colors hover:border-clay/50 hover:text-ink"
      title={state.message}
    >
      <RotateCw className="size-4 shrink-0 text-clay/80" />
      <span>
        天气没取到，
        <br />
        点一下再试
      </span>
    </button>
  );
}
