/**
 * Browser-only preview of the Rust engine.
 *
 * The shipping app always talks to `libyummy_core.so`. This mirror exists so
 * the interface can be developed and screenshotted in a normal browser; it
 * implements the same maths for the handful of things the UI previews.
 */
import { catalogById, catalogItems, substitutions } from "../data/catalog";
import type {
  Ingredient,
  MatchResult,
  MissingItem,
  Recipe,
  ScaleResult,
  ScaledIngredient,
} from "./types";

type Kind = "mass" | "volume" | "count";

const UNITS: Record<string, { kind: Kind; base: number; canonical: string }> = {
  cup: { kind: "volume", base: 240, canonical: "cup" },
  cups: { kind: "volume", base: 240, canonical: "cup" },
  tbsp: { kind: "volume", base: 15, canonical: "tbsp" },
  tablespoon: { kind: "volume", base: 15, canonical: "tbsp" },
  tablespoons: { kind: "volume", base: 15, canonical: "tbsp" },
  tsp: { kind: "volume", base: 5, canonical: "tsp" },
  teaspoon: { kind: "volume", base: 5, canonical: "tsp" },
  teaspoons: { kind: "volume", base: 5, canonical: "tsp" },
  ml: { kind: "volume", base: 1, canonical: "ml" },
  l: { kind: "volume", base: 1000, canonical: "l" },
  g: { kind: "mass", base: 1, canonical: "g" },
  gram: { kind: "mass", base: 1, canonical: "g" },
  grams: { kind: "mass", base: 1, canonical: "g" },
  kg: { kind: "mass", base: 1000, canonical: "kg" },
  oz: { kind: "mass", base: 28.3495, canonical: "oz" },
  ounce: { kind: "mass", base: 28.3495, canonical: "oz" },
  ounces: { kind: "mass", base: 28.3495, canonical: "oz" },
  lb: { kind: "mass", base: 453.592, canonical: "lb" },
  lbs: { kind: "mass", base: 453.592, canonical: "lb" },
  pound: { kind: "mass", base: 453.592, canonical: "lb" },
  pounds: { kind: "mass", base: 453.592, canonical: "lb" },
  clove: { kind: "count", base: 1, canonical: "clove" },
  cloves: { kind: "count", base: 1, canonical: "clove" },
  can: { kind: "count", base: 1, canonical: "can" },
  cans: { kind: "count", base: 1, canonical: "can" },
  tin: { kind: "count", base: 1, canonical: "tin" },
  tins: { kind: "count", base: 1, canonical: "tin" },
  slice: { kind: "count", base: 1, canonical: "slice" },
  slices: { kind: "count", base: 1, canonical: "slice" },
  head: { kind: "count", base: 1, canonical: "head" },
  heads: { kind: "count", base: 1, canonical: "head" },
  bunch: { kind: "count", base: 1, canonical: "bunch" },
  bunches: { kind: "count", base: 1, canonical: "bunch" },
  handful: { kind: "count", base: 1, canonical: "handful" },
  handfuls: { kind: "count", base: 1, canonical: "handful" },
  pinch: { kind: "count", base: 1, canonical: "pinch" },
  pinches: { kind: "count", base: 1, canonical: "pinch" },
  sprig: { kind: "count", base: 1, canonical: "sprig" },
  sprigs: { kind: "count", base: 1, canonical: "sprig" },
  stalk: { kind: "count", base: 1, canonical: "stalk" },
  stalks: { kind: "count", base: 1, canonical: "stalk" },
  packet: { kind: "count", base: 1, canonical: "packet" },
  packets: { kind: "count", base: 1, canonical: "packet" },
  pkg: { kind: "count", base: 1, canonical: "packet" },
  jar: { kind: "count", base: 1, canonical: "jar" },
  jars: { kind: "count", base: 1, canonical: "jar" },
  piece: { kind: "count", base: 1, canonical: "piece" },
  pieces: { kind: "count", base: 1, canonical: "piece" },
  scoop: { kind: "count", base: 1, canonical: "scoop" },
  scoops: { kind: "count", base: 1, canonical: "scoop" },
  splash: { kind: "volume", base: 5, canonical: "splash" },
  dash: { kind: "volume", base: 0.6, canonical: "dash" },
};

const LIQUIDS = new Set([
  "milk", "cream", "buttermilk", "yogurt", "sour_cream", "water", "stock",
  "wine", "olive_oil", "oil", "vinegar", "soy_sauce", "honey", "maple_syrup",
  "coconut_milk", "lemon_juice", "ketchup",
]);

const STOP = new Set([
  "fresh", "large", "medium", "small", "ripe", "whole", "boneless", "skinless",
  "organic", "free", "range", "extra", "virgin", "of", "a", "an", "the", "to",
  "taste", "optional", "plus", "for", "serving", "garnish",
]);

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (/(ses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map(singular)
    .filter((w) => w && !STOP.has(w));
}

export function textKey(text: string): string {
  return words(text).join(" ");
}

export function canonicalize(text: string): string | undefined {
  const target = words(text);
  if (!target.length) return undefined;
  const joined = target.join(" ");
  for (const item of catalogItems) {
    for (const alias of [item.name, ...item.aliases]) {
      if (words(alias).join(" ") === joined) return item.id;
    }
  }
  let best: { id: string; len: number; chars: number } | null = null;
  for (const item of catalogItems) {
    for (const alias of [item.name, ...item.aliases]) {
      const aliasWords = words(alias);
      if (!aliasWords.length) continue;
      for (let i = 0; i + aliasWords.length <= target.length; i += 1) {
        if (aliasWords.every((w, j) => target[i + j] === w)) {
          const chars = aliasWords.join("").length;
          if (!best || aliasWords.length > best.len || (aliasWords.length === best.len && chars > best.chars)) {
            best = { id: item.id, len: aliasWords.length, chars };
          }
        }
      }
    }
  }
  return best?.id;
}

function parseQty(tokens: string[]): { qty?: number; qtyMax?: number; used: number } {
  const parse = (token: string): { value: number; max?: number } | null => {
    const t = token.replace(/^[.,]+|[.,]+$/g, "");
    const range = t.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    if (range) return { value: Number(range[1]), max: Number(range[2]) };
    const frac = t.match(/^(\d+)\/(\d+)$/);
    if (frac) return { value: Number(frac[1]) / Number(frac[2]) };
    if (/^\d+(?:\.\d+)?$/.test(t)) return { value: Number(t) };
    return null;
  };
  if (!tokens.length) return { used: 0 };
  let first = parse(tokens[0]);
  let used = 1;
  if (!first) {
    const attached = tokens[0].match(/^(\d+(?:\.\d+)?|\d+\/\d+)([a-zA-Z]+)$/);
    if (attached && UNITS[attached[2].toLowerCase()]) {
      tokens.splice(1, 0, attached[2]);
      first = parse(attached[1]);
      tokens[0] = attached[1];
    }
  }
  if (!first) return { used: 0 };
  if (tokens[1] && /^\d+\/\d+$/.test(tokens[1]) && tokens[0].includes(" ") === false) {
    // handled upstream by unicode/mixed splitting
  }
  if (tokens[1] && /^(to|-|–)$/.test(tokens[1]) && tokens[2]) {
    const upper = parse(tokens[2]);
    if (upper) return { qty: first.value, qtyMax: upper.value, used: 3 };
  }
  if (!first.max && tokens[1] && /^\d+\/\d+$/.test(tokens[1]) && Number.isInteger(first.value)) {
    const frac = parse(tokens[1])!;
    return { qty: first.value + frac.value, used: 2 };
  }
  return { qty: first.value, qtyMax: first.max, used };
}

export function parseIngredient(rawLine: string): Ingredient {
  const raw = rawLine.trim();
  let working = raw
    .replace(/½/g, " 1/2 ")
    .replace(/¼/g, " 1/4 ")
    .replace(/¾/g, " 3/4 ")
    .replace(/⅓/g, " 1/3 ")
    .replace(/⅔/g, " 2/3 ")
    .replace(/⅛/g, " 1/8 ")
    .replace(/–/g, "-");
  let optional = false;
  if (/optional/i.test(working)) {
    optional = true;
    working = working.replace(/\(optional\)/i, "").replace(/optional/i, "");
  }
  const tokens = working.split(/\s+/).filter(Boolean);
  const { qty, qtyMax, used } = parseQty(tokens);
  let index = used;
  const notes: string[] = [];
  while (tokens[index]?.match(/^\(.+\)$/)) {
    notes.push(tokens[index].replace(/[()]/g, ""));
    index += 1;
  }
  let unit: string | undefined;
  let unitKind: Kind | undefined;
  const unitToken = tokens[index]?.toLowerCase().replace(/\.$/, "");
  if (unitToken && UNITS[unitToken]) {
    unit = UNITS[unitToken].canonical;
    unitKind = UNITS[unitToken].kind;
    index += 1;
  }
  let rest = tokens.slice(index).join(" ");
  let item = rest;
  const comma = rest.indexOf(",");
  if (comma >= 0) {
    item = rest.slice(0, comma).trim();
    notes.push(rest.slice(comma + 1).trim());
  }
  item = item.replace(/^of\s+/i, "").trim();
  const taste = item.match(/\s+(to taste|as needed)$/i);
  if (taste) {
    notes.push(taste[1]);
    item = item.slice(0, -taste[0].length).trim();
  }
  return {
    raw,
    qty,
    qtyMax,
    unit,
    unitKind,
    item: item || raw,
    canonicalId: canonicalize(item) ?? canonicalize(raw),
    note: notes.filter(Boolean).join(", ") || undefined,
    optional,
  };
}

const FRACTIONS: Array<[number, string]> = [
  [0, ""], [0.125, "⅛"], [0.25, "¼"], [0.3333, "⅓"], [0.375, "⅜"],
  [0.5, "½"], [0.625, "⅝"], [0.6667, "⅔"], [0.75, "¾"], [0.875, "⅞"], [1, ""],
];

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function fraction(value: number): string {
  if (value <= 0) return "0";
  const whole = Math.floor(value);
  const frac = value - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) {
    if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  }
  if (!best[1]) return best[0] === 0 ? String(whole) : String(whole + 1);
  return whole === 0 ? best[1] : `${whole} ${best[1]}`;
}

function formatQty(value: number, kind: Kind): string {
  if (kind === "count") {
    const r = roundTo(value, 0.5);
    return Number.isInteger(r) ? String(r) : fraction(r);
  }
  if (kind === "volume") return fraction(value);
  return value >= 20 ? String(Math.round(value)) : fraction(roundTo(value, 0.5));
}

function cupGramsFor(id?: string): number | undefined {
  if (!id || LIQUIDS.has(id)) return undefined;
  return catalogById.get(id)?.cupGrams;
}

function displayAmount(
  qty: number,
  unit: string | undefined,
  system: string,
  cupGrams?: number
): { amount: number; unit: string; kind: Kind } {
  const def = unit ? UNITS[unit] : undefined;
  if (!def) return { amount: roundTo(qty, 0.5), unit: "", kind: "count" };
  const base = qty * def.base;
  if (def.kind === "count") return { amount: roundTo(qty, 0.5), unit: def.canonical, kind: "count" };
  if (def.kind === "mass") {
    if (system === "imperial") {
      const oz = base / 28.3495;
      return oz >= 16
        ? { amount: roundTo(oz / 16, 0.25), unit: "lb", kind: "mass" }
        : { amount: roundTo(oz, 0.25), unit: "oz", kind: "mass" };
    }
    return base >= 1000
      ? { amount: roundTo(base / 1000, 0.05), unit: "kg", kind: "mass" }
      : { amount: roundTo(base, base < 100 ? 1 : 5), unit: "g", kind: "mass" };
  }
  if (system === "imperial") {
    if (base >= 120) return { amount: roundTo(base / 240, 0.125), unit: "cup", kind: "volume" };
    if (base >= 30) return { amount: roundTo(base / 15, 0.125), unit: "tbsp", kind: "volume" };
    return { amount: roundTo(base / 5, 0.125), unit: "tsp", kind: "volume" };
  }
  if (def.canonical === "cup") {
    if (cupGrams) {
      const grams = (base / 240) * cupGrams;
      return grams >= 1000
        ? { amount: roundTo(grams / 1000, 0.05), unit: "kg", kind: "mass" }
        : { amount: roundTo(grams, grams < 100 ? 1 : 5), unit: "g", kind: "mass" };
    }
    return { amount: roundTo(base, base < 100 ? 1 : 5), unit: "ml", kind: "volume" };
  }
  if (["tbsp", "tsp", "dash", "splash"].includes(def.canonical)) {
    return { amount: roundTo(qty, 0.125), unit: def.canonical, kind: "volume" };
  }
  return base >= 1000
    ? { amount: roundTo(base / 1000, 0.05), unit: "l", kind: "volume" }
    : { amount: roundTo(base, base < 100 ? 1 : 5), unit: "ml", kind: "volume" };
}

function plural(unit: string, amount: number): string {
  if (amount === 1 || ["g", "kg", "ml", "l", "oz", "lb", "tbsp", "tsp"].includes(unit)) return unit;
  if (/(s|x|ch|sh)$/.test(unit)) return unit + "es";
  return unit + "s";
}


const UNCOUNTABLE = new Set([
  "fish", "rice", "pasta", "bread", "cheese", "spinach", "garlic", "chicken", "beef",
  "pork", "lamb", "salmon", "tuna", "tofu", "honey", "yogurt", "flour", "sugar", "salt",
  "pepper", "water", "oil", "milk", "butter", "cream", "jam", "chocolate", "corn",
  "broccoli", "cauliflower", "asparagus", "couscous", "quinoa", "bacon", "sausage",
]);

function pluralItem(item: string): string {
  const words = item.trim().split(/\s+/);
  if (!words.length) return item;
  const last = words.length - 1;
  const word = words[last];
  if (UNCOUNTABLE.has(word) || word.endsWith("s")) return item;
  let plural: string;
  if (word === "potato" || word === "tomato") plural = `${word}es`;
  else if (/(ch|sh|x)$/.test(word)) plural = `${word}es`;
  else if (word.endsWith("y") && word.length > 2) plural = `${word.slice(0, -1)}ies`;
  else plural = `${word}s`;
  words[last] = plural;
  return words.join(" ");
}

export function scaleRecipe(recipe: Recipe, toServings: number, system: string): ScaleResult {
  const factor = toServings / (recipe.servings > 0 ? recipe.servings : 4);
  const notes: string[] = [];
  const ingredients: ScaledIngredient[] = recipe.ingredients.map((ing) => {
    let qty = ing.qty ? ing.qty * factor : undefined;
    let note = ing.note;
    if (qty && ["egg", "lemon", "lime", "onion"].includes(ing.canonicalId ?? "")) {
      const rounded = Math.round(qty);
      if (rounded >= 1 && Math.abs(qty - rounded) > 0.02) {
        note = note ? `${note} — round up to ${rounded}` : `≈ round to ${rounded} for ease`;
        qty = rounded;
      }
    }
    const cupGrams = cupGramsFor(ing.canonicalId);
    let text: string;
    let amount: number | undefined;
    let unit: string | undefined;
    if (qty !== undefined) {
      const shown = displayAmount(qty, ing.unit, system, cupGrams);
      amount = shown.amount;
      unit = shown.unit;
      text = shown.unit
        ? `${formatQty(shown.amount, shown.kind)} ${plural(shown.unit, shown.amount)} ${ing.item}`
        : `${formatQty(shown.amount, shown.kind)} ${shown.amount === 1 ? ing.item : pluralItem(ing.item)}`;
    } else {
      text = ing.unit ? `${ing.unit} of ${ing.item}` : ing.item;
    }
    if (note) text += `, ${note}`;
    text = text.charAt(0).toUpperCase() + text.slice(1);
    return {
      text,
      item: ing.item,
      amount,
      unit,
      canonicalId: ing.canonicalId,
      optional: !!ing.optional,
      note,
    };
  });
  if (Math.abs(factor - 1) > 0.01) {
    notes.push("Season to taste — salt and strong spices don't scale perfectly.");
  }
  if (factor >= 1.75) notes.push("Big batch: use a wider pan and start checking 5–10 minutes early.");
  if (factor <= 0.6) notes.push("Small batch: use a smaller pan so things brown instead of steam.");
  return { servings: toServings, factor, ingredients, notes };
}

function qtyText(ing: Ingredient): string | undefined {
  if (ing.qty === undefined) return undefined;
  const shown = displayAmount(
    ing.qty,
    ing.unit,
    "metric",
    cupGramsFor(ing.canonicalId)
  );
  return shown.unit
    ? `${formatQty(shown.amount, shown.kind)} ${plural(shown.unit, shown.amount)}`
    : formatQty(shown.amount, shown.kind);
}

export function matchRecipes(
  recipes: Recipe[],
  pantry: Array<{ id: string; name?: string; daysLeft?: number }>,
  useStaples: boolean,
  allowSubs: boolean
): MatchResult[] {
  const pantryMap = new Map(pantry.map((p) => [p.id, p]));
  const results = recipes.map((recipe) => {
    let total = 0;
    let have = 0;
    const missing: MissingItem[] = [];
    const details: MatchResult["details"] = [];
    const expiringUsed: string[] = [];
    for (const ing of recipe.ingredients) {
      const id = ing.canonicalId ?? canonicalize(ing.item);
      const def = id ? catalogById.get(id) : undefined;
      const name = ing.item || def?.name || "ingredient";
      if (ing.optional) {
        details.push({ canonicalId: id, item: name, state: pantryMap.has(id ?? "") ? "have" : "optional", note: "optional" });
        continue;
      }
      total += 1;
      if (useStaples && def?.staple) {
        have += 1;
        details.push({ canonicalId: id, item: name, state: "staple" });
        continue;
      }
      const p =
        (id ? pantryMap.get(id) : undefined) ??
        (textKey(ing.item)
          ? pantry.find((entry) => {
              const name =
                entry.name || (entry.id ? catalogById.get(entry.id)?.name : "");
              return !!name && textKey(name) === textKey(ing.item);
            })
          : undefined);
      if (p) {
        have += 1;
        if (p.daysLeft !== undefined && p.daysLeft <= 3) {
          expiringUsed.push(name);
        }
        details.push({ canonicalId: id, item: name, state: "have" });
        continue;
      }
      let sub: MissingItem["sub"];
      if (allowSubs && id) {
        const entry = substitutions.find(
          (s) => s.missing === id && s.use.every((u) => pantryMap.has(u))
        );
        if (entry) {
          sub = {
            text: `${entry.use.map((u) => catalogById.get(u)?.name.toLowerCase() ?? u).join(" + ")} — ${entry.note}`,
            ids: entry.use,
            names: entry.use.map((u) => catalogById.get(u)?.name ?? u),
          };
        }
      }
      missing.push({
        item: name,
        aisle: def?.aisle ?? "other",
        qtyText: qtyText(ing),
        canonicalId: id,
        sub,
      });
      details.push({ canonicalId: id, item: name, state: "missing", note: sub?.text });
    }
    const score = total === 0 ? 100 : Math.round((have / total) * 100);
    return {
      recipeId: recipe.id,
      score,
      have,
      total,
      missing,
      short: [],
      expiringUsed,
      details,
      substitutable: missing.length > 0 && missing.every((m) => !!m.sub),
    };
  });
  return results.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : a.missing.length - b.missing.length ||
        b.expiringUsed.length - a.expiringUsed.length
  );
}

/** A believable demo page so the capture flow can be designed in a browser. */
export function demoRecipe(url: string): Recipe {
  const ingredients = [
    "400 g rigatoni",
    "2 tbsp olive oil",
    "1 onion, finely chopped",
    "2 cloves garlic, sliced",
    "1 (400 g) can chopped tomatoes",
    "1 tsp smoked paprika",
    "100 g spinach",
    "60 g parmesan, grated",
    "A handful of basil",
  ].map(parseIngredient);
  return {
    id: `web-${Date.now()}`,
    title: "Smoky Tomato Rigatoni",
    description: "A deep, sweet tomato sauce with wilted spinach and parmesan.",
    sourceUrl: url,
    servings: 4,
    timeMin: 30,
    cuisine: "Italian",
    tags: ["weeknight", "vegetarian"],
    ingredients,
    steps: [
      "Bring a large pot of salted water to the boil and cook the rigatoni until al dente.",
      "Warm the olive oil in a wide pan and soften the onion for 8 minutes.",
      "Add the garlic and paprika, cook for a minute, then tip in the tomatoes and simmer for 12 minutes.",
      "Fold the spinach through the sauce until it wilts and season well.",
      "Toss with the pasta, a splash of cooking water, and finish with parmesan and basil.",
    ],
    emoji: "🍝",
    art: "sunset",
    source: "web",
    favorite: false,
    cookCount: 0,
    notes: [],
    warnings: ["Preview mode — this is a demo recipe. On your phone the page is read for real."],
    createdAt: new Date().toISOString(),
  };
}

export function demoOcr(): { text: string } {
  return {
    text: `Nonna's Tomato Pasta
Serves 4
Ingredients
• 400 g spaghetti
• 2 tbsp olive oil
• 3 cloves garlic, sliced
• 1 (400 g) can chopped tomatoes
• A handful of basil
• Salt and pepper
Method
1. Boil the pasta in salted water until just tender.
2. Gently fry the garlic in the oil until fragrant.
3. Add the tomatoes and simmer for 15 minutes, then toss with the pasta and basil.`,
  };
}
