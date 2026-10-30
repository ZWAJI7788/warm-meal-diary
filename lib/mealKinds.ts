import { Coffee, Cookie, MoonStar, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MealKind } from "@/lib/types";

export interface MealKindMeta {
  key: MealKind;
  label: string;
  Icon: LucideIcon;
  tint: string;
}

export const MEAL_KINDS: MealKindMeta[] = [
  { key: "breakfast", label: "早餐", Icon: Coffee, tint: "#e2a45e" },
  { key: "lunch", label: "午餐", Icon: Sun, tint: "#c97a52" },
  { key: "dinner", label: "晚餐", Icon: MoonStar, tint: "#8e9b72" },
  { key: "snack", label: "加餐", Icon: Cookie, tint: "#b98a6a" },
];

export function mealKindMeta(kind: MealKind) {
  return MEAL_KINDS.find((item) => item.key === kind) ?? MEAL_KINDS[1];
}

export function guessMealKind(hour = new Date().getHours()): MealKind {
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

export const MEAL_ORDER: Record<MealKind, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};
