import type { PointerEvent } from "react";
import { useImageUrl } from "@/lib/useImage";
import { dishStyle } from "@/lib/placement";
import type { Dish, Placement } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DishSpriteProps {
  dish: Dish;
  placement: Placement;
  className?: string;
  interactive?: boolean;
  selected?: boolean;
  onPointerDown?: (event: PointerEvent<HTMLImageElement>) => void;
}

export function DishSprite({ dish, placement, className, interactive, selected, onPointerDown }: DishSpriteProps) {
  const url = useImageUrl(dish.cutoutKey);
  if (!url) return null;

  return (
    <img
      src={url}
      alt={dish.name}
      draggable={false}
      onPointerDown={onPointerDown}
      className={cn(
        "absolute max-w-none select-none",
        dish.opaque ? "rounded-[0.9rem] shadow-[0_14px_26px_-18px_rgba(62,40,24,.65)]" : "dish-shadow",
        interactive ? "cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none",
        selected && "outline outline-2 outline-offset-4 outline-dashed outline-primary/70",
        className,
      )}
      style={dishStyle(placement, dish.aspect)}
    />
  );
}
