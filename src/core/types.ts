export type UnitSystem = "metric" | "imperial";

export type MealType = "breakfast" | "lunch" | "dinner" | "dessert" | "snack";

export interface Ingredient {
  raw: string;
  qty?: number;
  qtyMax?: number;
  unit?: string;
  unitKind?: "mass" | "volume" | "count";
  item: string;
  canonicalId?: string;
  note?: string;
  optional?: boolean;
}

export interface RecipeNote {
  id: string;
  text: string;
  at: string;
}

export type RecipeSource = "seed" | "web" | "photo" | "manual" | "featured";

export interface Recipe {
  id: string;
  title: string;
  description: string;
  image?: string;
  sourceUrl?: string;
  servings: number;
  timeMin?: number;
  cuisine?: string;
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
  author?: string;
  warnings?: string[];
  emoji: string;
  art: string;
  mealType?: MealType;
  source: RecipeSource;
  favorite: boolean;
  cookCount: number;
  lastCooked?: string;
  notes: RecipeNote[];
  createdAt: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  emoji: string;
  aisle: string;
  aliases: string[];
  cupGrams?: number;
  staple?: boolean;
}

export interface Aisle {
  id: string;
  label: string;
  emoji: string;
}

export interface CustomPantryItem {
  id: string;
  name: string;
  emoji: string;
  aisle: string;
}

export interface PantryEntry {
  id: string;
  name?: string;
  qty?: number;
  unit?: string;
  daysLeft?: number;
  addedAt: string;
}

export interface SubSuggestion {
  text: string;
  ids: string[];
  names: string[];
}

export interface MissingItem {
  item: string;
  aisle: string;
  qtyText?: string;
  canonicalId?: string;
  sub?: SubSuggestion;
}

export interface PantryStatus {
  canonicalId?: string;
  item: string;
  state: "have" | "short" | "missing" | "staple" | "optional";
  note?: string;
}

export interface MatchResult {
  recipeId: string;
  score: number;
  have: number;
  total: number;
  missing: MissingItem[];
  short: MissingItem[];
  expiringUsed: string[];
  details: PantryStatus[];
  substitutable: boolean;
}

export interface ScaledIngredient {
  text: string;
  item: string;
  amount?: number;
  unit?: string;
  canonicalId?: string;
  optional: boolean;
  note?: string;
}

export interface ScaleResult {
  servings: number;
  factor: number;
  ingredients: ScaledIngredient[];
  notes: string[];
}

export interface ShoppingItem {
  id: string;
  text: string;
  aisle: string;
  checked: boolean;
  recipeId?: string;
  recipeTitle?: string;
}

export interface Settings {
  system: UnitSystem;
  useStaples: boolean;
  substitutions: boolean;
  defaultServings: number;
}
