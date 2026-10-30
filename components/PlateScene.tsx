import type { ReactNode } from "react";
import type { Dish, Placement } from "@/lib/types";
import { DishSprite } from "./DishSprite";
import { cn } from "@/lib/utils";

export function PlateSurface({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("linen relative overflow-hidden", className)}>
      <div className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(120%_90%_at_30%_0%,rgba(255,255,255,.65),transparent_62%)]" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#c19a70]/25 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[91%] -translate-x-1/2 -translate-y-1/2 aspect-square">
        <div className="plate-surface plate-rim h-full w-full rounded-full" />
        <div className="absolute inset-[9%] rounded-full border border-[#b08a5f]/18" />
        <div className="absolute inset-[21%] rounded-full bg-[radial-gradient(circle_at_44%_38%,rgba(255,255,255,.75),transparent_64%)]" />
      </div>
      {children}
    </div>
  );
}

interface PlateSceneProps {
  dishes: Dish[];
  placement: Record<string, Placement>;
  className?: string;
  hint?: ReactNode;
}

export function PlateScene({ dishes, placement, className, hint }: PlateSceneProps) {
  return (
    <PlateSurface className={cn("aspect-[4/3]", className)}>
      {dishes.map((dish) => {
        const spot = placement[dish.id];
        if (!spot) return null;
        return <DishSprite key={dish.id} dish={dish} placement={spot} />;
      })}
      {dishes.length === 0 && hint ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          {hint}
        </div>
      ) : null}
    </PlateSurface>
  );
}
