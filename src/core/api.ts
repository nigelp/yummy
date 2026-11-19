import { CapacitorHttp } from "@capacitor/core";
import { catalog, catalogById, catalogItems } from "../data/catalog";
import { isNative, nativeCall, Ocr } from "./native";
import { ensureRecipeMeta } from "../lib/classify";
import * as preview from "./preview";
import type {
  Ingredient,
  MatchResult,
  MealType,
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

async function httpHtml(
  url: string,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-GB,en;q=0.9",
    ...extraHeaders,
  };
  if (isNative) {
    const response = await CapacitorHttp.get({
      url,
      headers,
      connectTimeout: 20000,
      readTimeout: 25000,
    });
    if (response.status >= 400) {
      throw new Error(`The site returned ${response.status}. Try another link.`);
    }
    return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
  }
  const response = await fetch(url, { headers });
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

export function isInstagramUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\//i.test(url.trim());
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCharCode(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => String.fromCharCode(parseInt(value, 16)));
}

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function metaContent(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const found = html.match(pattern);
    if (found?.[1]) return decodeHtmlEntities(found[1]).replace(/\\\//g, "/");
  }
  return "";
}

/**
 * Instagram's public embed page carries the caption without a login, but the
 * markup changes and Instagram sometimes serves a logged-out app shell with no
 * post data. Try JSON, the Caption block, then the meta description.
 */
function stripHtmlToText(fragment: string): string {
  return decodeHtmlEntities(
    fragment.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function instagramCaption(html: string): string {
  const jsonPatterns = [
    /"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    /"caption"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    /"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  ];
  for (const pattern of jsonPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const text = unescapeJsonString(match[1]).trim();
      if (text) return text;
    }
  }

  const captionStart = html.search(/<div[^>]+class="[^"]*\bCaption\b[^"]*"[^>]*>/i);
  if (captionStart >= 0) {
    const rest = html.slice(captionStart);
    const commentsAt = rest.search(/<div[^>]+class="[^"]*CaptionComments/i);
    const cut = commentsAt >= 0 ? rest.slice(0, commentsAt) : rest;
    const text = stripHtmlToText(
      cut.replace(
        /<a[^>]+class="[^"]*CaptionUsername[^"]*"[^>]*>[\s\S]*?<\/a>/i,
        ""
      )
    );
    if (text) return text;
  }

  return metaContent(html, "og:description") || metaContent(html, "twitter:description");
}

const INSTAGRAM_HEADERS = {
  "X-IG-App-ID": "936619743392459",
  Referer: "https://www.instagram.com/",
};

/** Shared caption-to-recipe path for Instagram links and manually pasted text. */
async function parseCaptionRecipe(
  caption: string,
  options: {
    url?: string;
    id: string;
    sourceLabel: string;
    emoji: string;
    image?: string;
  }
): Promise<Recipe> {
  const firstLine =
    caption
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0] ?? "";
  const cleanTitle = firstLine.replace(/^[^\w]+/, "").slice(0, 90);

  let parsed: Recipe | null = null;
  try {
    parsed = await coreCall<Recipe>("parse_ocr", { text: caption });
  } catch {
    parsed = null;
  }

  const hasRecipe =
    !!parsed && (parsed.ingredients.length > 0 || parsed.steps.length > 0);

  return normalizeRecipe(
    {
      ...(parsed ?? {
        id: options.id,
        title: "",
        description: "",
        servings: 4,
        tags: [],
        ingredients: [],
        steps: [],
        emoji: options.emoji,
        art: "rose",
        source: "web",
        favorite: false,
        cookCount: 0,
        notes: [],
        warnings: [],
        createdAt: new Date().toISOString(),
      }),
      id: options.id,
      title: (parsed?.title || cleanTitle || "Imported recipe").slice(0, 100),
      description: caption.slice(0, 500),
      image: options.image ?? parsed?.image,
      sourceUrl: options.url,
      source: "web",
      emoji: options.emoji,
      warnings: [
        `Imported from ${options.sourceLabel} — check the amounts and method before cooking.`,
        ...(parsed?.warnings ?? []).filter(
          (warning) => !/read from a photo/i.test(warning)
        ),
        ...(hasRecipe
          ? []
          : [
              "We couldn't spot ingredients or steps. Add them below, or choose a screenshot instead.",
            ]),
      ],
    },
    "web"
  );
}

export async function recipeFromCaption(text: string, url?: string): Promise<Recipe> {
  const caption = text.trim();
  if (!caption) throw new Error("Paste the caption text first.");
  return parseCaptionRecipe(caption, {
    url,
    id: `caption-${Date.now()}`,
    sourceLabel: "pasted text",
    emoji: "📝",
  });
}

/**
 * Best-effort Instagram import: read the public embed caption, then run it
 * through the same text parser as photo OCR. Reels and posts live behind
 * different embed paths, so try both before giving up.
 */
export async function extractFromInstagram(url: string): Promise<Recipe> {
  const target = url.match(
    /instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
  );
  if (!target) {
    throw new Error("That doesn't look like an Instagram post link.");
  }
  if (!isNative) {
    throw new Error(
      "Instagram import needs the phone app — the browser preview can't reach Instagram."
    );
  }

  const rawKind = target[1].toLowerCase();
  const kind = rawKind === "p" ? "p" : rawKind === "tv" ? "tv" : "reel";
  const code = target[2];
  const candidates = Array.from(
    new Set([
      `https://www.instagram.com/p/${code}/embed/captioned/?cr=1&v=14`,
      `https://www.instagram.com/${kind}/${code}/embed/captioned/?cr=1&v=14`,
      `https://www.instagram.com/p/${code}/embed/?cr=1&v=14`,
    ])
  );

  let html = "";
  let caption = "";
  for (const candidate of candidates) {
    try {
      const page = await httpHtml(candidate, INSTAGRAM_HEADERS);
      if (!html) html = page;
      const found = instagramCaption(page);
      if (found) {
        html = page;
        caption = found;
        break;
      }
    } catch {
      /* try the next embed shape */
    }
  }

  if (!caption.trim()) {
    throw new Error(
      "Instagram hid this post's caption from the app. Tap “Paste the caption instead” to copy it from Instagram, or choose a screenshot from your gallery."
    );
  }

  return parseCaptionRecipe(caption, {
    url,
    id: `instagram-${code}`,
    sourceLabel: "an Instagram caption",
    emoji: "📸",
    image: metaContent(html, "og:image") || undefined,
  });
}

export async function extractFromUrl(url: string): Promise<Recipe> {
  const clean = pickUrl(url) ?? url.trim();
  if (!/^https?:\/\//i.test(clean)) {
    throw new Error("That doesn't look like a web address. Paste the full recipe link.");
  }
  if (isInstagramUrl(clean)) return extractFromInstagram(clean);
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
  strYoutube?: string;
  [key: string]: unknown;
}

/** Pull a YouTube id out of the usual watch/short/embed URL shapes. */
export function youtubeId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i
  );
  return match ? match[1] : null;
}

export function youtubeThumb(url?: string): string | undefined {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
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
      videoUrl: typeof meal.strYoutube === "string" ? meal.strYoutube : undefined,
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
 *
 * When meal/tag filters are active they shape the request itself, so the web
 * results are tied to what the user asked for rather than a fixed pantry pick.
 */
export interface WebSearchFilters {
  meals?: MealType[];
  tags?: string[];
  query?: string;
}

const MEAL_CATEGORIES: Record<MealType, string[]> = {
  breakfast: ["Breakfast"],
  lunch: ["Side", "Starter", "Miscellaneous"],
  dinner: ["Chicken", "Beef", "Pasta", "Seafood", "Vegetarian"],
  dessert: ["Dessert"],
  snack: ["Starter", "Side"],
};

const STYLE_CATEGORIES: Record<string, string[]> = {
  vegan: ["Vegan"],
  vegetarian: ["Vegetarian"],
  fish: ["Seafood"],
  pasta: ["Pasta"],
  dessert: ["Dessert"],
  breakfast: ["Breakfast"],
  meaty: ["Beef", "Chicken", "Lamb", "Pork"],
};

const MEAL_WORDS: Record<string, MealType> = {
  breakfast: "breakfast",
  brunch: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  supper: "dinner",
  dessert: "dessert",
  sweet: "dessert",
  pudding: "dessert",
  snack: "snack",
  starter: "snack",
};

/** Words that describe a filter rather than something to find in a title. */
const FILTER_TOKENS = new Set([
  "breakfast",
  "brunch",
  "lunch",
  "dinner",
  "supper",
  "dessert",
  "sweet",
  "pudding",
  "snack",
  "starter",
  "vegan",
  "vegetarian",
  "fish",
  "seafood",
  "pasta",
  "meaty",
  "soup",
  "quick",
  "easy",
  "hearty",
  "gluten",
  "free",
  "low",
  "carb",
  "high",
  "protein",
  "one",
  "pan",
]);

export function isFilterToken(token: string): boolean {
  return FILTER_TOKENS.has(token.toLowerCase());
}

/** Tokens worth checking against a web recipe's title/ingredients. */
export function searchTextTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !FILTER_TOKENS.has(token));
}

function catalogIdsForToken(token: string): string[] {
  if (token.length < 3) return [];
  const ids: string[] = [];
  for (const item of catalogItems) {
    if (item.staple) continue;
    const name = item.name.toLowerCase();
    const aliases = item.aliases ?? [];
    if (name === token || aliases.some((alias) => alias.toLowerCase() === token)) {
      ids.push(item.id);
      continue;
    }
    if (
      name.includes(token) ||
      aliases.some((alias) => alias.toLowerCase().includes(token))
    ) {
      ids.push(item.id);
    }
    if (ids.length >= 2) break;
  }
  return ids;
}

async function searchMeals(term: string, limit: number): Promise<MealDbMeal[]> {
  try {
    const data = await httpJson<{ meals?: unknown }>(
      `${MEAL_API}/search.php?s=${encodeURIComponent(term)}`
    );
    return (mealList(data) as unknown as MealDbMeal[])
      .filter((meal) => !!meal.strMeal)
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function ingredientMeals(terms: string[]): Promise<MealDbMeal[]> {
  const ids = new Set<string>();
  for (const term of terms.slice(0, 3)) {
    const found = await filterIds("i", term, 6);
    found.forEach((id) => ids.add(id));
    if (ids.size >= 8) break;
  }
  if (ids.size === 0) return [];
  const full = await Promise.all(Array.from(ids).slice(0, 8).map(lookupMeal));
  return full.filter((meal): meal is MealDbMeal => !!meal && !!meal.strMeal);
}

function mergeMeals(lists: MealDbMeal[][], limit: number): MealDbMeal[] {
  const seen = new Set<string>();
  const pool: MealDbMeal[] = [];
  for (const meal of lists.flat()) {
    if (!meal.strMeal || seen.has(meal.idMeal)) continue;
    seen.add(meal.idMeal);
    pool.push(meal);
    if (pool.length >= limit) break;
  }
  return pool;
}

async function webRecipes(
  entries: PantryEntry[],
  filters: WebSearchFilters,
  includePantry: boolean
): Promise<Recipe[]> {
  const query = filters.query?.trim();
  if (query) {
    const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const categories = new Set<string>();
    const textTerms = new Set<string>([query]);
    const nameTerms = new Set<string>();
    const ingredientSources: string[][] = [];
    const usedIngredients = new Set<string>();

    for (const token of tokens) {
      const meal = MEAL_WORDS[token];
      if (meal) {
        for (const category of MEAL_CATEGORIES[meal] ?? []) categories.add(category);
      }
      for (const category of STYLE_CATEGORIES[token] ?? []) categories.add(category);
      if (token === "soup") nameTerms.add("Soup");
      if (token.length >= 3 && !isFilterToken(token)) textTerms.add(token);

      for (const id of catalogIdsForToken(token)) {
        if (usedIngredients.has(id) || ingredientSources.length >= 3) continue;
        usedIngredients.add(id);
        const definition = catalogById.get(id);
        if (definition) {
          ingredientSources.push(termsFor(id, definition.name).slice(0, 2));
        }
      }
    }

    const tasks: Array<Promise<MealDbMeal[]>> = [searchMeals(query, 12)];
    for (const term of [...textTerms].filter((term) => term !== query).slice(0, 3)) {
      tasks.push(searchMeals(term, 6));
    }
    for (const terms of ingredientSources.slice(0, 3)) tasks.push(ingredientMeals(terms));
    for (const category of [...categories].slice(0, 3)) {
      tasks.push(fullMeals("c", category, 4));
    }
    for (const term of [...nameTerms].slice(0, 2)) tasks.push(searchMeals(term, 4));

    const lists = await Promise.all(tasks);
    return mergeMeals(lists, 20).map(mealToRecipe);
  }

  const categories = new Set<string>();
  for (const meal of filters.meals ?? []) {
    for (const category of MEAL_CATEGORIES[meal] ?? []) categories.add(category);
  }
  for (const tag of filters.tags ?? []) {
    for (const category of STYLE_CATEGORIES[tag] ?? []) categories.add(category);
  }

  const ingredientSources: string[][] = [];
  const used = new Set<string>();
  for (const tag of filters.tags ?? []) {
    const definition = catalogById.get(tag);
    if (!definition || definition.staple) continue;
    if (used.has(definition.id) || STYLE_CATEGORIES[tag]) continue;
    used.add(definition.id);
    ingredientSources.push(termsFor(definition.id, definition.name).slice(0, 2));
  }

  if (includePantry) {
    const picks = entries
      .map((entry) => ({ entry, def: catalogById.get(entry.id) }))
      .filter(({ def }) => !!def && !def.staple)
      .sort((a, b) => priority(a.def!.id) - priority(b.def!.id));
    for (const { def } of picks) {
      if (ingredientSources.length >= 3) break;
      if (!def || used.has(def.id)) continue;
      used.add(def.id);
      ingredientSources.push(termsFor(def.id, def.name).slice(0, 2));
    }
  }

  const nameTerms: string[] = [];
  if ((filters.tags ?? []).includes("soup")) nameTerms.push("Soup");

  const tasks: Array<Promise<MealDbMeal[]>> = [];
  for (const terms of ingredientSources.slice(0, 3)) tasks.push(ingredientMeals(terms));
  for (const category of [...categories].slice(0, 3)) {
    tasks.push(fullMeals("c", category, 4));
  }
  for (const term of nameTerms.slice(0, 2)) tasks.push(searchMeals(term, 4));

  if (tasks.length === 0) return [];
  const lists = await Promise.all(tasks);
  return mergeMeals(lists, 20).map(mealToRecipe);
}

/** Tag/meal/query search that does not lean on the pantry — used by Find. */
export async function fetchRecipeSearch(filters: WebSearchFilters): Promise<Recipe[]> {
  return webRecipes([], filters, false);
}

/** Pantry matches, shaped by any active meal/tag/query filters. */
export async function fetchPantryMatches(
  entries: PantryEntry[],
  filters: WebSearchFilters = {}
): Promise<Recipe[]> {
  return webRecipes(entries, filters, true);
}

export function recipeEmoji(recipe: Recipe): string {
  return recipe.emoji || "🍲";
}

export function ingredientLines(ingredients: Ingredient[]): string {
  return ingredients.map((i) => i.raw).join("\n");
}
