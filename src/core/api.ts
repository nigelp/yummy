import { CapacitorHttp } from "@capacitor/core";
import { catalog, catalogById, catalogItems } from "../data/catalog";
import { isNative, nativeCall, Ocr } from "./native";
import { ensureRecipeMeta } from "../lib/classify";
import * as preview from "./preview";
import type {
  Ingredient,
  MatchResult,
  PantryEntry,
  Recipe,
  ScaleResult,
  Settings,
} from "./types";

export { catalog, catalogById, catalogItems };

const MEAL_API = "https://www.themealdb.com/api/json/v1/1";

const CATEGORY_EMOJI: Record<string, string> = {
  beef: "🥩",
  chicken: "🍗",
  dessert: "🍰",
  lamb: "🍖",
  miscellaneous: "🍲",
  pasta: "🍝",
  pork: "🥓",
  seafood: "🐟",
  side: "🥗",
  starter: "🥟",
  vegan: "🥦",
  vegetarian: "🥬",
  breakfast: "🥞",
  goat: "🍖",
};

const ART_KEYS = ["citrus", "herb", "sunset", "mint", "lilac", "rose", "butter", "sky"];

function pickArt(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return ART_KEYS[hash % ART_KEYS.length];
}

async function httpHtml(url: string): Promise<string> {
  if (isNative) {
    const response = await CapacitorHttp.get({
      url,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      connectTimeout: 20000,
      readTimeout: 25000,
    });
    if (response.status >= 400) {
      throw new Error(`The site returned ${response.status}. Try another link.`);
    }
    return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The site returned ${response.status}. Try another link.`);
  return response.text();
}

async function httpJson<T>(url: string): Promise<T> {
  if (isNative) {
    const response = await CapacitorHttp.get({ url, connectTimeout: 15000, readTimeout: 20000 });
    if (response.status >= 400) throw new Error("Meal service unavailable");
    return (typeof response.data === "string" ? JSON.parse(response.data) : response.data) as T;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("Meal service unavailable");
  return (await response.json()) as T;
}

function parseOcrTextPreview(text: string): Recipe {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lower = lines.map((l) => l.toLowerCase());
  const ingIdx = lower.findIndex((l) => l.includes("ingredient"));
  const stepIdx = lower.findIndex(
    (l) => l.includes("method") || l.includes("instruction") || l.includes("direction")
  );
  const ingredients: string[] =
    ingIdx >= 0
      ? lines.slice(ingIdx + 1, stepIdx > ingIdx ? stepIdx : undefined)
      : lines.filter((l) => /^\d/.test(l) || /(g|ml|tbsp|tsp|cup|pinch)/i.test(l));
  const steps: string[] =
    stepIdx >= 0
      ? lines.slice(stepIdx + 1).filter((l) => l.length > 15)
      : [];
  return {
    id: `photo-${Date.now()}`,
    title: lines.find((l) => l.length > 2 && !/ingredient|method/i.test(l)) ?? "My recipe",
    description: "",
    servings: 4,
    ingredients: ingredients.map(preview.parseIngredient),
    steps,
    tags: [],
    emoji: "📷",
    art: "butter",
    source: "photo",
    favorite: false,
    cookCount: 0,
    notes: [],
    warnings: ["Read from a photo — check the amounts before you start."],
    createdAt: new Date().toISOString(),
  };
}

export async function coreCall<T>(
  method: string,
  payload: Record<string, unknown>
): Promise<T> {
  if (isNative) return nativeCall<T>(method, payload);
  switch (method) {
    case "catalog":
      return catalog as unknown as T;
    case "health":
      return { engine: "preview", catalogSize: catalogItems.length } as unknown as T;
    case "parse_ingredient":
      return preview.parseIngredient(String(payload.line ?? "")) as unknown as T;
    case "parse_ingredients":
      return ((payload.lines as string[]) ?? []).map(preview.parseIngredient) as unknown as T;
    case "scale_recipe": {
      const req = payload as {
        recipe: Recipe;
        toServings?: number;
        system?: string;
      };
      return preview.scaleRecipe(
        req.recipe,
        req.toServings ?? req.recipe.servings,
        req.system ?? "metric"
      ) as unknown as T;
    }
    case "match_recipes": {
      const req = payload as {
        recipes: Recipe[];
        pantry: PantryEntry[];
        useStaples?: boolean;
        substitutions?: boolean;
      };
      return preview.matchRecipes(
        req.recipes,
        req.pantry,
        req.useStaples ?? true,
        req.substitutions ?? true
      ) as unknown as T;
    }
    case "extract_recipe":
      return preview.demoRecipe(String(payload.url ?? "")) as unknown as T;
    case "parse_ocr":
      return parseOcrTextPreview(String(payload.text ?? "")) as unknown as T;
    default:
      throw new Error(`Preview mode can't do “${method}” yet.`);
  }
}

export async function scale(
  recipe: Recipe,
  toServings: number,
  system: Settings["system"]
): Promise<ScaleResult> {
  return coreCall<ScaleResult>("scale_recipe", {
    recipe,
    toServings,
    system,
  });
}

export async function match(
  recipes: Recipe[],
  pantry: PantryEntry[],
  settings: Settings
): Promise<Record<string, MatchResult>> {
  if (recipes.length === 0) return {};
  const results = await coreCall<MatchResult[]>("match_recipes", {
    recipes,
    pantry: Object.values(pantry),
    useStaples: settings.useStaples,
    substitutions: settings.substitutions,
  });
  return Object.fromEntries(results.map((r) => [r.recipeId, r]));
}

export function pickUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[).,]+$/, "") : null;
}

export async function extractFromUrl(url: string): Promise<Recipe> {
  const clean = pickUrl(url) ?? url.trim();
  if (!/^https?:\/\//i.test(clean)) {
    throw new Error("That doesn't look like a web address. Paste the full recipe link.");
  }
  if (!isNative) return preview.demoRecipe(clean);
  const html = await httpHtml(clean);
  const recipe = await coreCall<Recipe>("extract_recipe", { html, url: clean });
  return normalizeRecipe(recipe, "web");
}

export async function recognizePhoto(dataUrl: string): Promise<string> {
  if (!isNative) return preview.demoOcr().text;
  const result = await Ocr.recognize({ image: dataUrl });
  return result.text;
}

export function normalizeRecipe(recipe: Recipe, source: Recipe["source"]): Recipe {
  const normalised: Recipe = {
    ...recipe,
    id: recipe.id || `${source}-${Date.now()}`,
    source: recipe.source ?? source,
    emoji: recipe.emoji || CATEGORY_EMOJI[(recipe.tags?.[0] ?? "").toLowerCase()] || "🍲",
    art: recipe.art || pickArt(recipe.id || recipe.title || "yummy"),
    tags: recipe.tags ?? [],
    ingredients: recipe.ingredients ?? [],
    steps: recipe.steps ?? [],
    notes: recipe.notes ?? [],
    warnings: recipe.warnings ?? [],
    favorite: recipe.favorite ?? false,
    cookCount: recipe.cookCount ?? 0,
    createdAt: recipe.createdAt || new Date().toISOString(),
  };
  return ensureRecipeMeta(normalised);
}

interface MealDbMeal {
  idMeal: string;
  strMeal: string;
  strCategory?: string;
  strArea?: string;
  strInstructions?: string;
  strMealThumb?: string;
  [key: string]: unknown;
}

function mealToRecipe(meal: MealDbMeal): Recipe {
  const lines: string[] = [];
  for (let i = 1; i <= 20; i += 1) {
    const name = String(meal[`strIngredient${i}`] ?? "").trim();
    const measure = String(meal[`strMeasure${i}`] ?? "").trim();
    if (name) lines.push(`${measure} ${name}`.trim());
  }
  const instructions = (meal.strInstructions ?? "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
  const steps =
    instructions.length >= 2
      ? instructions
      : (meal.strInstructions ?? "")
          .split(/(?<=\.)\s+(?=[A-Z])/)
          .map((s) => s.trim())
          .filter((s) => s.length > 20);
  const category = (meal.strCategory ?? "").toLowerCase();
  return normalizeRecipe(
    {
      id: `meal-${meal.idMeal}`,
      title: meal.strMeal,
      description: [meal.strArea, meal.strCategory].filter(Boolean).join(" · "),
      image: meal.strMealThumb,
      sourceUrl: `https://www.themealdb.com/meal/${meal.idMeal}`,
      servings: 4,
      timeMin: 25 + (Number(meal.idMeal) % 30),
      cuisine: meal.strArea,
      tags: [meal.strCategory, meal.strArea].filter(Boolean).map((t) => String(t).toLowerCase()),
      ingredients: lines.map(preview.parseIngredient),
      steps,
      emoji: CATEGORY_EMOJI[category] ?? "🍲",
      art: pickArt(meal.idMeal),
    } as Recipe,
    "featured"
  );
}

interface MealDbSummary {
  idMeal: string;
  strMeal: string;
  strMealThumb?: string;
}

/** TheMealDB sometimes returns an object (paywall notice) instead of an array. */
function mealList(value: unknown): MealDbSummary[] {
  if (Array.isArray(value)) return value as MealDbSummary[];
  if (value && typeof value === "object") {
    const meals = (value as { meals?: unknown }).meals;
    if (Array.isArray(meals)) return meals as MealDbSummary[];
  }
  return [];
}

async function lookupMeal(id: string): Promise<MealDbMeal | null> {
  try {
    const data = await httpJson<{ meals?: unknown }>(
      `${MEAL_API}/lookup.php?i=${encodeURIComponent(id)}`
    );
    const first = mealList(data)[0] as unknown as MealDbMeal | undefined;
    return first && first.strMeal ? first : null;
  } catch {
    return null;
  }
}

async function filterIds(
  kind: "c" | "a" | "i",
  value: string,
  limit: number
): Promise<string[]> {
  try {
    const data = await httpJson<{ meals?: unknown }>(
      `${MEAL_API}/filter.php?${kind}=${encodeURIComponent(value)}`
    );
    const ids = mealList(data)
      .filter((meal) => !!meal.idMeal && !!meal.strMeal)
      .map((meal) => meal.idMeal);
    // The API returns alphabetical lists; randomise so refresh brings variety.
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, limit);
  } catch {
    return [];
  }
}

async function fullMeals(
  kind: "c" | "a" | "i",
  value: string,
  limit: number
): Promise<MealDbMeal[]> {
  const ids = await filterIds(kind, value, limit);
  const full = await Promise.all(ids.map(lookupMeal));
  return full.filter((meal): meal is MealDbMeal => !!meal && !!meal.strMeal);
}

/**
 * Free TheMealDB lists only — no randomselection, which is now patron-only.
 * A handful of categories and areas gives a genuinely mixed rail.
 */
export async function fetchFeatured(): Promise<Recipe[]> {
  const pool: MealDbMeal[] = [];
  const seen = new Set<string>();
  const push = (meal: MealDbMeal | null | undefined) => {
    if (!meal || !meal.strMeal || seen.has(meal.idMeal)) return;
    seen.add(meal.idMeal);
    pool.push(meal);
  };

  const groups = await Promise.all([
    fullMeals("c", "Breakfast", 3),
    fullMeals("c", "Pasta", 2),
    fullMeals("c", "Seafood", 2),
    fullMeals("c", "Vegetarian", 2),
    fullMeals("a", "Italian", 2),
    fullMeals("a", "Thai", 2),
  ]);
  groups.forEach((meals) => meals.forEach(push));

  if (pool.length === 0) {
    const fallback = await fullMeals("c", "Chicken", 4);
    fallback.forEach(push);
  }
  if (pool.length === 0) {
    throw new Error("TheMealDB returned no recipes");
  }

  return pool.slice(0, 18).map(mealToRecipe);
}

/** TheMealDB ingredient names differ from our pantry names (pasta is Spaghetti/Penne…). */
const MEALDB_TERMS: Record<string, string[]> = {
  pasta: ["Spaghetti", "Penne", "Macaroni", "Fusilli"],
  noodles: ["Egg Noodles", "Rice Noodles", "Noodles"],
  rice: ["Rice"],
  potato: ["Potatoes"],
  sweet_potato: ["Sweet Potato"],
  tomato: ["Tomatoes"],
  cheese: ["Cheddar", "Cheese"],
  parmesan: ["Parmesan"],
  mozzarella: ["Mozzarella"],
  feta: ["Feta"],
  beans: ["Kidney Beans", "Black Beans"],
  chickpeas: ["Chickpeas"],
  lentils: ["Lentils"],
  fish: ["Cod", "Haddock", "White Fish"],
  salmon: ["Salmon"],
  tuna: ["Tuna"],
  shrimp: ["Prawns", "Shrimp"],
  chicken: ["Chicken"],
  chicken_breast: ["Chicken Breast", "Chicken"],
  chicken_thigh: ["Chicken"],
  beef: ["Beef", "Minced Beef"],
  pork: ["Pork"],
  lamb: ["Lamb"],
  bacon: ["Bacon"],
  egg: ["Eggs"],
  milk: ["Milk"],
  butter: ["Butter"],
  flour: ["Plain Flour", "Flour"],
  onion: ["Onion", "Onions"],
  garlic: ["Garlic"],
  lemon: ["Lemon"],
  lime: ["Lime"],
  spinach: ["Spinach"],
  mushroom: ["Mushrooms"],
  broccoli: ["Broccoli"],
  bell_pepper: ["Bell Pepper", "Red Pepper"],
  eggplant: ["Aubergine", "Eggplant"],
  zucchini: ["Courgette", "Zucchini"],
  cabbage: ["Cabbage"],
  carrot: ["Carrot", "Carrots"],
  peas: ["Peas"],
  corn: ["Sweetcorn"],
  avocado: ["Avocado"],
  banana: ["Banana", "Bananas"],
  apple: ["Apple", "Apples"],
  blueberry: ["Blueberries"],
  coconut_milk: ["Coconut Milk"],
  stock: ["Chicken Stock", "Vegetable Stock"],
  soy_sauce: ["Soy Sauce"],
  honey: ["Honey"],
  sugar: ["Caster Sugar", "Sugar"],
  oats: ["Oats"],
  bread: ["Bread"],
  tortilla: ["Tortillas"],
};

function termsFor(id: string, fallback: string): string[] {
  return MEALDB_TERMS[id] ?? [fallback];
}

const PANTRY_PRIORITY = [
  "chicken_breast", "chicken_thigh", "chicken", "beef", "pork", "lamb", "bacon", "sausage",
  "fish", "salmon", "tuna", "shrimp", "egg", "tofu", "beans", "chickpeas", "lentils",
  "pasta", "noodles", "rice", "potato", "sweet_potato", "tomato", "cheese", "mushroom",
  "spinach", "broccoli", "cauliflower", "zucchini", "eggplant", "bell_pepper", "cucumber",
  "lemon", "lime", "onion", "garlic", "carrot", "peas", "apple", "banana",
];

function priority(id: string): number {
  const index = PANTRY_PRIORITY.indexOf(id);
  return index === -1 ? 99 : index;
}

/**
 * Ask TheMealDB for dishes that actually contain what's in the pantry:
 * ingredient filter -> full recipe lookup. These join the match engine, so
 * chicken + eggs yields chicken/egg dishes rather than random desserts.
 */
export async function fetchPantryMatches(entries: PantryEntry[]): Promise<Recipe[]> {
  const picks = entries
    .map((entry) => ({ entry, def: catalogById.get(entry.id) }))
    .filter(({ def }) => !!def && !def.staple)
    .sort((a, b) => priority(a.def!.id) - priority(b.def!.id))
    .slice(0, 3);

  if (picks.length === 0) return [];

  const lists = await Promise.all(
    picks.map(async ({ def }) => {
      const terms = termsFor(def!.id, def!.name);
      const ids = new Set<string>();
      for (const term of terms.slice(0, 3)) {
        const found = await filterIds("i", term, 6);
        found.forEach((id) => ids.add(id));
        if (ids.size >= 8) break;
      }
      return Array.from(ids).slice(0, 8);
    })
  );

  const ids = Array.from(new Set(lists.flat())).slice(0, 20);
  if (ids.length === 0) return [];
  const full = await Promise.all(ids.map(lookupMeal));
  return full
    .filter((meal): meal is MealDbMeal => !!meal && !!meal.strMeal)
    .map(mealToRecipe);
}

export function recipeEmoji(recipe: Recipe): string {
  return recipe.emoji || "🍲";
}

export function ingredientLines(ingredients: Ingredient[]): string {
  return ingredients.map((i) => i.raw).join("\n");
}
