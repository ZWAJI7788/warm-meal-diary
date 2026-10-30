export type MealKind = "breakfast" | "lunch" | "dinner" | "snack";

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Dish {
  id: string;
  name: string;
  /** Blob key of the transparent cutout in IndexedDB */
  cutoutKey: string;
  /** Blob key of the original photo the dish was cut from */
  sourceKey: string;
  /** Normalized area of the source photo where this dish was selected */
  crop: CropRect | null;
  /** Background removal strength used (0-100) */
  tolerance: number;
  /** True when the dish is kept as a photo / crop, without removing its background */
  opaque?: boolean;
  /** width / height of the cutout */
  aspect: number;
}

export interface Placement {
  x: number;
  y: number;
  scale: number;
  rot: number;
  z: number;
}

export interface Meal {
  id: string;
  date: string;
  kind: MealKind;
  place: string;
  mood: string;
  cost: number | null;
  story: string;
  dishes: Dish[];
  placement: Record<string, Placement>;
  createdAt: number;
  updatedAt: number;
}

export interface EditableDish extends Omit<Dish, "cutoutKey" | "sourceKey"> {
  cutoutKey?: string;
  sourceKey?: string;
  cutoutBlob?: Blob;
  sourceBlob?: Blob;
}

export interface MealDraft {
  id: string;
  date: string;
  kind: MealKind;
  place: string;
  mood: string;
  cost: number | null;
  story: string;
  dishes: EditableDish[];
  placement: Record<string, Placement>;
  removedImageKeys: string[];
}
