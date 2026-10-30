import type { CropRect } from "@/lib/types";

export interface CutoutResult {
  blob: Blob;
  width: number;
  height: number;
  aspect: number;
  /** false when nothing looked like background, so the photo is kept whole */
  removed: boolean;
  /** Rectangle of the original photo (in source pixels) that the cutout covers */
  source: { x: number; y: number; w: number; h: number };
}

const ANALYSIS_MAX = 820;
const OUTPUT_MAX = 640;
const PHOTO_MAX = 1500;
const FULL: CropRect = { x: 0, y: 0, w: 1, h: 1 };

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Safari sometimes rejects formats that <img> can still display
    }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("这张图片读不出来，换一张试试"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  return image;
}

function sizeOf(source: ImageBitmap | HTMLImageElement) {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface Swatch {
  r: number;
  g: number;
  b: number;
  hue: number;
  sat: number;
}

function hueOf(r: number, g: number, b: number, max: number, min: number) {
  const delta = max - min;
  if (delta === 0) return 0;
  if (max === r) return 60 * (((g - b) / delta + 6) % 6);
  if (max === g) return 60 * ((b - r) / delta + 2);
  return 60 * ((r - g) / delta + 4);
}

function hueGap(a: number, b: number) {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
}

/** Collect the dominant colors along the four edges: table, cloth, plate, shadow. */
function borderSwatches(data: Uint8ClampedArray, width: number, height: number): Swatch[] {
  const ring = Math.max(2, Math.round(Math.min(width, height) * 0.022));
  const step = Math.max(1, Math.round(Math.max(width, height) / 260));
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();

  const add = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  };

  for (let x = 0; x < width; x += step) {
    for (let t = 0; t < ring; t += 1) {
      add(x, t);
      add(x, height - 1 - t);
    }
  }
  for (let y = 0; y < height; y += step) {
    for (let t = 0; t < ring; t += 1) {
      add(t, y);
      add(width - 1 - t, y);
    }
  }

  const all = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
  const total = all.reduce((sum, item) => sum + item.n, 0) || 1;
  const swatches = all
    .slice(0, 6)
    .filter((item) => item.n / total > 0.015)
    .map((item) => {
      const r = item.r / item.n;
      const g = item.g / item.n;
      const b = item.b / item.n;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return {
        r,
        g,
        b,
        hue: hueOf(r, g, b, max, min),
        sat: max === 0 ? 0 : (max - min) / max,
      };
    });
  // A plate that touches the frame would put its cream into the palette, and then the
  // flood eats every creamy sauce in the dish. Ceramic is left to the flatness pass.
  const plain = swatches.filter((swatch) => {
    const max = Math.max(swatch.r, swatch.g, swatch.b);
    const min = Math.min(swatch.r, swatch.g, swatch.b);
    return (max + min) / 510 <= 0.62 || (max === 0 ? 0 : (max - min) / max) >= 0.22;
  });
  return plain.length ? plain : swatches;
}

/**
 * A ceramic plate is large, bright, low-saturation and almost flat. The color flood
 * often can't reach its face because the shaded rim closes the loop, so classify it
 * directly by smoothness over a small window. A plate-sized region must also reach the
 * backdrop, which keeps creamy sauces and other pale food islands inside the dish.
 */
function removePlateSurface(image: ImageData, background: Uint8Array) {
  const { data, width, height } = image;
  const total = width * height;
  const radius = Math.max(2, Math.round(Math.min(width, height) * 0.008));
  const stride = width + 1;

  const integral = new Float64Array(stride * (height + 1));
  const squared = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    let rowSq = 0;
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      const value = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
      rowSum += value;
      rowSq += value * value;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
      squared[(y + 1) * stride + x + 1] = squared[y * stride + x + 1] + rowSq;
    }
  }

  const flat = new Uint8Array(total);
  const smoothness = new Float32Array(total).fill(1);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (background[index]) continue;
      const p = index * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const max = r > g ? (r > b ? r : b) : g > b ? g : b;
      const min = r < g ? (r < b ? r : b) : g < b ? g : b;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const n = (x1 - x0) * (y1 - y0);
      const sum =
        integral[y1 * stride + x1] - integral[y0 * stride + x1] -
        integral[y1 * stride + x0] + integral[y0 * stride + x0];
      const sq =
        squared[y1 * stride + x1] - squared[y0 * stride + x1] -
        squared[y1 * stride + x0] + squared[y0 * stride + x0];
      const mean = sum / n;
      const variance = sq / n - mean * mean;
      smoothness[index] = variance;
      const lightness = (max + min) / 510;
      if (lightness < 0.58) continue;
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (saturation > 0.16) continue;
      flat[index] = variance <= 0.0013 ? 1 : 0;
    }
  }

  const labels = new Int32Array(total).fill(-1);
  const stack = new Int32Array(total);
  const sizes: number[] = [];
  const backed: boolean[] = [];
  const minSize = Math.max(1200, Math.round(total * 0.025));

  for (let start = 0; start < total; start += 1) {
    if (!flat[start] || labels[start] !== -1) continue;
    const label = sizes.length;
    let top = 0;
    let size = 0;
    let touchesBackdrop = false;
    labels[start] = label;
    stack[top] = start;
    top += 1;
    while (top > 0) {
      top -= 1;
      const index = stack[top];
      size += 1;
      const x = index % width;
      const y = (index / width) | 0;
      const left = x > 0 ? index - 1 : -1;
      const right = x < width - 1 ? index + 1 : -1;
      const up = y > 0 ? index - width : -1;
      const down = y < height - 1 ? index + width : -1;
      const neighbors = [left, right, up, down];
      for (let k = 0; k < 4; k += 1) {
        const neighbor = neighbors[k];
        if (neighbor < 0 || background[neighbor]) {
          touchesBackdrop = true;
          continue;
        }
        if (flat[neighbor] && labels[neighbor] === -1) {
          labels[neighbor] = label;
          stack[top] = neighbor;
          top += 1;
        }
      }
    }
    sizes[label] = size;
    backed[label] = touchesBackdrop;
  }

  let count = 0;
  for (let index = 0; index < total; index += 1) {
    if (!flat[index]) continue;
    const label = labels[index];
    if (sizes[label] < minSize || !backed[label]) continue;
    background[index] = 1;
    count += 1;
  }

  // Second tier: warm-tinted ceramic that hugs the backdrop is still plate, but the
  // looser test only applies inside a thin shell so pale food in the dish survives.
  const shell = 30;
  const distance = new Uint16Array(total).fill(60000);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < total; index += 1) {
    if (background[index]) {
      distance[index] = 0;
      queue[tail] = index;
      tail += 1;
    }
  }
  while (head < tail) {
    const index = queue[head];
    head += 1;
    if (distance[index] >= shell) continue;
    const x = index % width;
    const y = (index / width) | 0;
    const next = distance[index] + 1;
    const visit = (neighbor: number) => {
      if (distance[neighbor] <= next) return;
      distance[neighbor] = next;
      queue[tail] = neighbor;
      tail += 1;
    };
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y < height - 1) visit(index + width);
  }
  for (let index = 0; index < total; index += 1) {
    if (background[index] || distance[index] > shell) continue;
    const p = index * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    const lightness = (max + min) / 510;
    if (lightness < 0.56) continue;
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation > 0.22 || smoothness[index] > 0.0018) continue;
    background[index] = 1;
    count += 1;
  }
  return count;
}

/**
 * The plate's antialiased edge survives the flood as a thin warm line. Shave kept
 * pixels that hug the removed backdrop and are pale enough to be ceramic, not food.
 */
function shaveRim(image: ImageData, background: Uint8Array, passes = 4) {
  const { data, width, height } = image;
  for (let pass = 0; pass < passes; pass += 1) {
    const doomed: number[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (background[index]) continue;
        const edge =
          (x > 0 && background[index - 1] === 1) ||
          (x < width - 1 && background[index + 1] === 1) ||
          (y > 0 && background[index - width] === 1) ||
          (y < height - 1 && background[index + width] === 1);
        if (!edge) continue;
        const p = index * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const max = r > g ? (r > b ? r : b) : g > b ? g : b;
        const min = r < g ? (r < b ? r : b) : g < b ? g : b;
        const lightness = (max + min) / 510;
        const saturation = max === 0 ? 0 : (max - min) / max;
        if (lightness > 0.45 && saturation < 0.55) doomed.push(index);
      }
    }
    for (const index of doomed) background[index] = 1;
  }
}

/**
 * Plate shadows in the crop corners survive as dark wedges that touch the frame. A
 * small kept island that leans on the border is table, not dinner; drop it so the
 * trimmed dish is centered on the food.
 */
function dropBorderIslands(background: Uint8Array, width: number, height: number) {
  const total = width * height;
  const labels = new Int32Array(total).fill(-1);
  const stack = new Int32Array(total);
  const sizes: number[] = [];
  const border: boolean[] = [];

  for (let start = 0; start < total; start += 1) {
    if (background[start] || labels[start] !== -1) continue;
    const label = sizes.length;
    let top = 0;
    let size = 0;
    let touchesBorder = false;
    labels[start] = label;
    stack[top] = start;
    top += 1;
    while (top > 0) {
      top -= 1;
      const index = stack[top];
      size += 1;
      const x = index % width;
      const y = (index / width) | 0;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (let k = 0; k < 4; k += 1) {
        const neighbor = neighbors[k];
        if (neighbor < 0 || background[neighbor] || labels[neighbor] !== -1) continue;
        labels[neighbor] = label;
        stack[top] = neighbor;
        top += 1;
      }
    }
    sizes[label] = size;
    border[label] = touchesBorder;
  }

  const largest = sizes.reduce((max, size) => Math.max(max, size), 0);
  const limit = Math.min(total * 0.035, largest * 0.1);
  for (let index = 0; index < total; index += 1) {
    if (background[index]) continue;
    const label = labels[index];
    if (sizes[label] < 40 || (border[label] && sizes[label] < limit)) background[index] = 1;
  }
}

function feather(alpha: Uint8ClampedArray, width: number, height: number) {  const horizontal = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const left = alpha[row + Math.max(0, x - 1)];
      const mid = alpha[row + x];
      const right = alpha[row + Math.min(width - 1, x + 1)];
      horizontal[row + x] = (left + mid + right) / 3;
    }
  }
  const out = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y += 1) {
    const upY = Math.max(0, y - 1) * width;
    const midY = y * width;
    const downY = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      out[midY + x] = (horizontal[upY + x] + horizontal[midY + x] + horizontal[downY + x]) / 3;
    }
  }
  return out;
}

function segment(image: ImageData, strength: number) {
  const { data, width, height } = image;
  const total = width * height;
  const swatches = borderSwatches(data, width, height);
  const distance = new Float32Array(total);

  for (let i = 0, p = 0; i < total; i += 1, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    // Saturated food and saturated background can land close in RGB — shadowed bok
    // choy sits within a few units of table wood — so keep hues apart: green leaves
    // must not be reachable from a brown backdrop.
    const hue = sat > 0.28 ? hueOf(r, g, b, max, min) : -1;
    let best = 255;
    for (let s = 0; s < swatches.length; s += 1) {
      const swatch = swatches[s];
      if (hue >= 0 && swatch.sat > 0.28 && hueGap(hue, swatch.hue) > 32) continue;
      const dr = r - swatch.r;
      const dg = g - swatch.g;
      const db = b - swatch.b;
      const d = Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 3;
      if (d < best) best = d;
    }
    distance[i] = best;
  }

  // Past ~38 the palette starts matching the dish itself, so the slider stops there.
  const threshold = 9 + Math.min(strength, 46) * 0.62;
  const background = new Uint8Array(total);
  const stack = new Int32Array(total);
  let top = 0;

  const push = (index: number) => {
    if (!background[index] && distance[index] < threshold) {
      background[index] = 1;
      stack[top] = index;
      top += 1;
    }
  };

  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (top > 0) {
    top -= 1;
    const index = stack[top];
    const x = index % width;
    const y = (index / width) | 0;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  removePlateSurface(image, background);
  shaveRim(image, background);
  dropBorderIslands(background, image.width, image.height);
  shaveRim(image, background);

  let kept = 0;
  for (let i = 0; i < total; i += 1) if (!background[i]) kept += 1;
  const removed = kept / total < 0.98;

  const alpha = new Uint8ClampedArray(total);
  const softLow = threshold * 0.62;
  const softHigh = threshold * 1.45;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (background[index]) continue;
      const edge =
        (x > 0 && background[index - 1] === 1) ||
        (x < width - 1 && background[index + 1] === 1) ||
        (y > 0 && background[index - width] === 1) ||
        (y < height - 1 && background[index + width] === 1);
      if (!edge) {
        alpha[index] = 255;
        continue;
      }
      const t = (distance[index] - softLow) / (softHigh - softLow);
      alpha[index] = t <= 0 ? 30 : t >= 1 ? 255 : Math.round(30 + t * 225);
    }
  }

  return { alpha, removed };
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("这个浏览器无法处理图片");
  return { canvas, ctx };
}

export interface PhotoResult {
  blob: Blob;
  width: number;
  height: number;
  aspect: number;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("导出图片失败"))), type, quality);
  });
}

/** Cuts a rectangle out of the photo and keeps it fully opaque — no background removal. */
export async function cropPhoto(photo: Blob, crop: CropRect | null): Promise<PhotoResult> {
  const source = await decode(photo);
  const { width: sourceWidth, height: sourceHeight } = sizeOf(source);
  if (!sourceWidth || !sourceHeight) throw new Error("这张图片读不出来，换一张试试");

  const area = crop ?? FULL;
  const sx = clamp(Math.round(area.x * sourceWidth), 0, sourceWidth - 1);
  const sy = clamp(Math.round(area.y * sourceHeight), 0, sourceHeight - 1);
  const cw = clamp(Math.round(area.w * sourceWidth), 8, sourceWidth - sx);
  const ch = clamp(Math.round(area.h * sourceHeight), 8, sourceHeight - sy);
  const scale = Math.min(1, PHOTO_MAX / Math.max(cw, ch));
  const width = Math.max(8, Math.round(cw * scale));
  const height = Math.max(8, Math.round(ch * scale));

  const { canvas, ctx } = canvasOf(width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source as CanvasImageSource, sx, sy, cw, ch, 0, 0, width, height);
  if (source instanceof ImageBitmap) source.close();

  const blob = await toBlob(canvas, "image/jpeg", 0.9);
  return { blob, width, height, aspect: width / height };
}

export async function removeFoodBackground(
  photo: Blob,
  crop: CropRect | null,
  strength = 26,
): Promise<CutoutResult> {
  const source = await decode(photo);
  const { width: sourceWidth, height: sourceHeight } = sizeOf(source);
  if (!sourceWidth || !sourceHeight) throw new Error("这张图片读不出来，换一张试试");

  const area = crop ?? FULL;
  const sx = clamp(Math.round(area.x * sourceWidth), 0, sourceWidth - 1);
  const sy = clamp(Math.round(area.y * sourceHeight), 0, sourceHeight - 1);
  const cw = clamp(Math.round(area.w * sourceWidth), 8, sourceWidth - sx);
  const ch = clamp(Math.round(area.h * sourceHeight), 8, sourceHeight - sy);
  const scale = Math.min(1, ANALYSIS_MAX / Math.max(cw, ch));
  const width = Math.max(8, Math.round(cw * scale));
  const height = Math.max(8, Math.round(ch * scale));

  const { canvas, ctx } = canvasOf(width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source as CanvasImageSource, sx, sy, cw, ch, 0, 0, width, height);
  if (source instanceof ImageBitmap) source.close();

  const image = ctx.getImageData(0, 0, width, height);
  const { alpha, removed } = segment(image, strength);
  const feathered = feather(alpha, width, height);

  for (let i = 0, p = 3; i < width * height; i += 1, p += 4) {
    image.data[p] = removed ? feathered[i] : 255;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (image.data[(y * width + x) * 4 + 3] > 14) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    minX = 0;
    minY = 0;
    maxX = width - 1;
    maxY = height - 1;
  }

  const pad = Math.round(Math.max(width, height) * 0.012);
  minX = clamp(minX - pad, 0, width - 1);
  minY = clamp(minY - pad, 0, height - 1);
  maxX = clamp(maxX + pad, 0, width - 1);
  maxY = clamp(maxY + pad, 0, height - 1);

  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const outScale = Math.min(1, OUTPUT_MAX / Math.max(boxWidth, boxHeight));
  const outWidth = Math.max(1, Math.round(boxWidth * outScale));
  const outHeight = Math.max(1, Math.round(boxHeight * outScale));

  const full = canvasOf(width, height);
  full.ctx.putImageData(image, 0, 0);
  const out = canvasOf(outWidth, outHeight);
  out.ctx.imageSmoothingQuality = "high";
  out.ctx.drawImage(full.canvas, minX, minY, boxWidth, boxHeight, 0, 0, outWidth, outHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("导出图片失败"))),
      "image/png",
    );
  });

  return {
    blob,
    width: outWidth,
    height: outHeight,
    aspect: outWidth / outHeight,
    removed,
    source: {
      x: sx + minX / scale,
      y: sy + minY / scale,
      w: boxWidth / scale,
      h: boxHeight / scale,
    },
  };
}
