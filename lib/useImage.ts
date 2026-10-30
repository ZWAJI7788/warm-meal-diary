import { useEffect, useState } from "react";
import { getImage } from "./db";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();

export function cachedImageUrl(key: string): string | undefined {
  return cache.get(key);
}

export function ensureImageUrl(key: string): Promise<string | undefined> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const job = getImage(key)
    .then((blob) => {
      if (!blob) return undefined;
      const url = URL.createObjectURL(blob);
      cache.set(key, url);
      return url;
    })
    .catch(() => undefined)
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, job);
  return job;
}

export function forgetImageUrl(key: string) {
  const url = cache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(key);
  }
}

export function useImageUrl(key?: string) {
  const [url, setUrl] = useState<string | undefined>(() => (key ? cache.get(key) : undefined));

  useEffect(() => {
    if (!key) {
      setUrl(undefined);
      return;
    }
    let alive = true;
    const hit = cache.get(key);
    if (hit) {
      setUrl(hit);
      return;
    }
    setUrl(undefined);
    ensureImageUrl(key).then((value) => {
      if (alive) setUrl(value);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return url;
}
