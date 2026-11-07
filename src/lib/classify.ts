import type { MealType, Recipe } from "../core/types";

const MEATY_IDS = new Set([
  "chicken", "chicken_breast", "chicken_thigh", "beef", "pork", "lamb", "bacon", "sausage", "turkey",
]);
const FISH_IDS = new Set(["fish", "salmon", "tuna", "shrimp"]);
const PROTEIN_IDS = new Set([
  ...MEATY_IDS, ...FISH_IDS, "egg", "tofu", "beans", "chickpeas", "lentils",
  "cheese", "parmesan", "mozzarella", "feta", "yogurt", "milk",
]);
const GLUTEN_IDS = new Set([
  "flour", "bread", "breadcrumbs", "pasta", "noodles", "tortilla", "pita",
  "baguette", "bread_rolls", "puff_pastry", "soy_sauce",
]);
const CARBY_IDS = new Set([
  "rice", "pasta", "noodles", "potato", "sweet_potato", "bread", "flour", "sugar",
  "brown_sugar", "honey", "maple_syrup", "oats", "tortilla", "breadcrumbs",
  "baguette", "bread_rolls", "pita", "puff_pastry", "chocolate", "jam", "banana",
]);
const DESSERT_HINTS = /(cake|crumble|pie|tart|pudding|biscuit|cookie|brownie|ice cream|dessert)/i;
const BREAKFAST_HINTS = /(pancake|porridge|overnight oats|granola|waffle|french toast|shakshuka|breakfast|brunch)/i;
const LUNCH_HINTS = /(salad|sandwich|toastie|toast|wrap|soup|pita|bowl)/i;
const SOUP_HINTS = /(soup|broth|stew|chowder)/i;
const GLUTEN_HINTS = /(wheat|barley|rye|bread|pasta|couscous|soy sauce|beer|pastry|cake|pie|pizza)/i;

function idsOf(recipe: Recipe): Set<string> {
  const ids = new Set<string>();
  for (const ingredient of recipe.ingredients ?? []) {
    if (ingredient.canonicalId) ids.add(ingredient.canonicalId);
  }
  return ids;
}

export function deriveMealType(recipe: Recipe): MealType {
  if (recipe.mealType) return recipe.mealType;
  const tags = (recipe.tags ?? []).map((tag) => tag.toLowerCase());
  if (tags.includes("dessert") || tags.includes("sweet")) return "dessert";
  if (tags.includes("breakfast") || tags.includes("brunch")) return "breakfast";
  if (tags.includes("lunch")) return "lunch";
  if (tags.includes("snack") || tags.includes("starter") || tags.includes("side")) return "snack";

  const text = `${recipe.title} ${recipe.description}`;
  if (DESSERT_HINTS.test(text)) return "dessert";
  if (BREAKFAST_HINTS.test(text)) return "breakfast";
  if (LUNCH_HINTS.test(text)) return "lunch";
  return "dinner";
}

/**
 * Descriptive tags for filtering. These are practical kitchen labels, not
 * medical guarantees — gluten-free / low-carb are conservative heuristics.
 */
export function deriveTags(recipe: Recipe): string[] {
  const tags = new Set(
    (recipe.tags ?? [])
      .map((tag) => tag.toLowerCase().trim())
      .filter(Boolean)
  );
  const ids = idsOf(recipe);
  const text = `${recipe.title} ${recipe.description} ${(recipe.steps ?? []).join(" ")}`.toLowerCase();

  if (ids.has("pasta")) tags.add("pasta");
  if (ids.has("noodles") && !ids.has("pasta")) tags.add("noodles");
  if (SOUP_HINTS.test(`${recipe.title} ${recipe.description}`)) tags.add("soup");

  const meaty = [...ids].some((id) => MEATY_IDS.has(id));
  const fishy = [...ids].some((id) => FISH_IDS.has(id));
  if (meaty) tags.add("meaty");
  if (fishy) tags.add("fish");
  if (meaty || fishy || [...ids].some((id) => PROTEIN_IDS.has(id))) tags.add("high-protein");

  if (recipe.timeMin && recipe.timeMin <= 25) tags.add("quick");
  if (tags.has("one-pan") || tags.has("sheet-pan")) tags.add("one-pan");

  const dessertish = tags.has("dessert") || tags.has("sweet");
  const hasGluten = [...ids].some((id) => GLUTEN_IDS.has(id)) || GLUTEN_HINTS.test(text);
  if (!hasGluten && recipe.ingredients.length >= 3) tags.add("gluten-free");

  const hasCarbs = [...ids].some((id) => CARBY_IDS.has(id));
  if (!hasCarbs && !dessertish && recipe.ingredients.length >= 3) tags.add("low-carb");

  if (!dessertish && (meaty || [...ids].some((id) => ["potato", "rice", "pasta", "beans", "lentils", "bread"].includes(id)) || tags.has("soup"))) {
    tags.add("hearty");
  }

  if (dessertish) tags.add("dessert");
  return [...tags];
}

/** Fill in anything old saves or freshly scraped pages are missing. */
export function ensureRecipeMeta(recipe: Recipe): Recipe {
  const mealType = deriveMealType(recipe);
  return {
    ...recipe,
    mealType,
    tags: deriveTags({ ...recipe, mealType }),
  };
}

export const MEAL_LABELS: Record<MealType, { label: string; emoji: string; blurb: string }> = {
  breakfast: { label: "Breakfast", emoji: "☀️", blurb: "Slow starts and quick wins" },
  lunch: { label: "Lunch", emoji: "🥗", blurb: "Something good in the middle of the day" },
  dinner: { label: "Dinner", emoji: "🌙", blurb: "The main event, matched to your pantry" },
  dessert: { label: "Something sweet", emoji: "🍰", blurb: "Worth leaving room for" },
  snack: { label: "Snacks", emoji: "🫒", blurb: "Little things between meals" },
};

export const FILTER_TAGS = [
  "quick",
  "vegetarian",
  "vegan",
  "gluten-free",
  "low-carb",
  "high-protein",
  "soup",
  "pasta",
  "fish",
  "meaty",
  "hearty",
  "one-pan",
] as const;

export function tagLabel(tag: string): string {
  return tag
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
