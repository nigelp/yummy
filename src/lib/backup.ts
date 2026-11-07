import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { Ingredient, Recipe, RecipeNote, RecipeSource } from "../core/types";
import { ensureRecipeMeta } from "./classify";
import { parseIngredient } from "../core/preview";

export const BACKUP_VERSION = 1;

export function buildBackup(recipes: Recipe[]): string {
  return JSON.stringify({
    app: "yummy",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
  });
}

export function backupFilename(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `yummy-recipes-${stamp}.json`;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asNotes(value: unknown): RecipeNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((note, index) => {
      if (!note || typeof note !== "object") return null;
      const text = asText((note as RecipeNote).text);
      if (!text) return null;
      return {
        id: asText((note as RecipeNote).id) ?? `note-imported-${index}`,
        text,
        at: asText((note as RecipeNote).at) ?? new Date().toISOString(),
      };
    })
    .filter((note): note is RecipeNote => !!note);
}

function asIngredient(value: unknown): Ingredient | null {
  if (typeof value === "string") {
    const parsed = parseIngredient(value);
    return parsed.canonicalId || parsed.item ? parsed : null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as Ingredient;
  const item = asText(raw.item) ?? asText(raw.raw);
  if (!item) return null;
  return {
    raw: asText(raw.raw) ?? item,
    qty: asNumber(raw.qty),
    qtyMax: asNumber(raw.qtyMax),
    unit: asText(raw.unit),
    unitKind:
      raw.unitKind === "mass" || raw.unitKind === "volume" || raw.unitKind === "count"
        ? raw.unitKind
        : undefined,
    item,
    canonicalId: asText(raw.canonicalId),
    note: asText(raw.note),
    optional: raw.optional === true,
  };
}

const SOURCES: RecipeSource[] = ["seed", "web", "photo", "manual", "featured"];

/** Accepts both a Yummy backup and a bare array of recipes. */
export function parseBackup(text: string): Recipe[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as { recipes?: unknown }).recipes
      : undefined;

  if (!Array.isArray(list)) {
    throw new Error("That file isn't a Yummy recipe backup.");
  }

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const imported: Recipe[] = [];

  list.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const title = asText(raw.title);
    const ingredients = Array.isArray(raw.ingredients)
      ? raw.ingredients
          .map(asIngredient)
          .filter((ingredient): ingredient is Ingredient => !!ingredient)
      : [];

    if (!title || ingredients.length === 0) return;

    let id = asText(raw.id) ?? `imported-${Date.now()}-${index}`;
    if (seen.has(id)) id = `${id}-imported-${index}`;
    seen.add(id);

    const notes = asNotes(raw.notes);
    const source = SOURCES.includes(raw.source as RecipeSource)
      ? (raw.source as RecipeSource)
      : "manual";

    const recipe: Recipe = {
      id,
      title,
      description: asText(raw.description) ?? "",
      image: asText(raw.image),
      sourceUrl: asText(raw.sourceUrl),
      servings: asNumber(raw.servings) && asNumber(raw.servings)! > 0 ? asNumber(raw.servings)! : 4,
      timeMin: asNumber(raw.timeMin),
      cuisine: asText(raw.cuisine),
      tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
      ingredients,
      steps: Array.isArray(raw.steps) ? raw.steps.map(String).filter(Boolean) : [],
      author: asText(raw.author),
      warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
      emoji: asText(raw.emoji) ?? "🍲",
      art: asText(raw.art) ?? "cream",
      mealType:
        raw.mealType === "breakfast" ||
        raw.mealType === "lunch" ||
        raw.mealType === "dinner" ||
        raw.mealType === "dessert" ||
        raw.mealType === "snack"
          ? raw.mealType
          : undefined,
      source: source === "featured" ? "web" : source,
      favorite: raw.favorite === true,
      cookCount: asNumber(raw.cookCount) ?? 0,
      lastCooked: asText(raw.lastCooked),
      notes,
      createdAt: asText(raw.createdAt) ?? now,
    };

    imported.push(ensureRecipeMeta(recipe));
  });

  if (imported.length === 0) {
    throw new Error("No recipes with a title and ingredients were found in that file.");
  }
  return imported;
}

/**
 * Writes a JSON backup and opens the share sheet on Android so it can be saved
 * to Files, Drive, email, etc. On the web it downloads the file.
 */
export async function exportRecipes(recipes: Recipe[]): Promise<boolean> {
  const data = buildBackup(recipes);
  const filename = backupFilename();

  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    try {
      await Share.share({
        title: "Yummy recipes",
        text: `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"} from Yummy`,
        files: [uri],
        dialogTitle: "Export Yummy recipes",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cancel/i.test(message)) return false;
      throw error;
    }
    return true;
  }

  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}
