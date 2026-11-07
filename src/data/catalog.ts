import rawCatalog from "../../rust/yummy-core/assets/catalog.json";
import rawSubs from "../../rust/yummy-core/assets/substitutions.json";
import type { Aisle, CatalogItem } from "../core/types";

export const catalog = rawCatalog as { aisles: Aisle[]; items: CatalogItem[] };
export const aisles = catalog.aisles;
export const catalogItems = catalog.items;
export const catalogById = new Map(catalogItems.map((item) => [item.id, item]));

export const substitutions = rawSubs as {
  missing: string;
  use: string[];
  note: string;
}[];

export function aisleOf(id?: string): string {
  if (!id) return "other";
  return catalogById.get(id)?.aisle ?? "other";
}

export function aisleLabel(id: string): string {
  return aisles.find((a) => a.id === id)?.label ?? "Other";
}

export function aisleEmoji(id: string): string {
  return aisles.find((a) => a.id === id)?.emoji ?? "🧺";
}

/** Art direction per pantry aisle, used for tiles and empty states. */
export const aisleTint: Record<string, string> = {
  produce: "mint",
  dairy: "butter",
  protein: "rose",
  pantry: "peach",
  spice: "sunset",
  bakery: "lilac",
  frozen: "sky",
  other: "cream",
};
