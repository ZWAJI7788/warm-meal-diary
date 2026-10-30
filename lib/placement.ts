import type { CSSProperties } from "react";
import type { Dish, Placement } from "@/lib/types";

/** Width of a dish in percent of the plate scene width, before its own aspect ratio. */
const BASE_WIDTH = 42;

export function dishStyle(placement: Placement, aspect: number): CSSProperties {
  const width = BASE_WIDTH * placement.scale * Math.min(1, Math.max(0.4, aspect));
  return {
    left: `${placement.x * 100}%`,
    top: `${placement.y * 100}%`,
    width: `${width}%`,
    transform: `translate(-50%, -50%) rotate(${placement.rot}deg)`,
    zIndex: placement.z,
  };
}

export function defaultPlacements(
  dishes: Dish[],
  existing: Record<string, Placement> = {},
): Record<string, Placement> {
  const next: Record<string, Placement> = { ...existing };
  const count = dishes.length;

  dishes.forEach((dish, index) => {
    if (next[dish.id]) return;
    if (count === 1) {
      next[dish.id] = { x: 0.5, y: 0.5, scale: 1.1, rot: 0, z: 1 };
      return;
    }
    if (count === 2) {
      next[dish.id] = {
        x: index === 0 ? 0.39 : 0.61,
        y: index === 0 ? 0.53 : 0.47,
        scale: 0.78,
        rot: index === 0 ? -4 : 4,
        z: index + 1,
      };
      return;
    }
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    const radius = count <= 4 ? 0.16 : count <= 6 ? 0.195 : 0.215;
    next[dish.id] = {
      x: 0.5 + Math.cos(angle) * radius * 1.28,
      y: 0.5 + Math.sin(angle) * radius,
      scale: count <= 4 ? 0.6 : 0.5,
      rot: ((index % 3) - 1) * 6,
      z: index + 1,
    };
  });

  return next;
}
