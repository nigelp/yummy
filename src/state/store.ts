import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import seedData from "../data/seed.json";
import { isNative } from "../core/native";
import { aisleOf } from "../data/catalog";
import { ensureRecipeMeta } from "../lib/classify";
import type {
  CustomPantryItem,
  MatchResult,
  MissingItem,
  PantryEntry,
  Recipe,
  Settings,
  ShoppingItem,
} from "../core/types";

const STATE_FILE = "yummy-state.json";
const SEED_VERSION = "2026-11-07";

const seedRecipes: Recipe[] = (seedData.recipes as unknown as Recipe[]).map((recipe) =>
  ensureRecipeMeta({
    ...recipe,
    notes: recipe.notes ?? [],
    favorite: recipe.favorite ?? false,
    cookCount: recipe.cookCount ?? 0,
    warnings: recipe.warnings ?? [],
    tags: recipe.tags ?? [],
  })
);

const seedById = new Map(seedRecipes.map((recipe) => [recipe.id, recipe]));

/** Keep user edits, but refresh curated metadata (meal type, tags) for seeded recipes. */
function withSeedMeta(recipe: Recipe): Recipe {
  const seed = seedById.get(recipe.id);
  if (!seed) return recipe;
  return {
    ...recipe,
    mealType: seed.mealType ?? recipe.mealType,
    tags: Array.from(new Set([...(recipe.tags ?? []), ...(seed.tags ?? [])])),
  };
}

const storage = createJSONStorage(() => ({
  getItem: async (_name: string) => {
    if (!isNative) return localStorage.getItem("yummy-state");
    try {
      const result = await Filesystem.readFile({
        path: STATE_FILE,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      return typeof result.data === "string" ? result.data : null;
    } catch {
      return null;
    }
  },
  setItem: async (_name: string, value: string) => {
    if (!isNative) {
      localStorage.setItem("yummy-state", value);
      return;
    }
    await Filesystem.writeFile({
      path: STATE_FILE,
      data: value,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  },
  removeItem: async (_name: string) => {
    if (!isNative) {
      localStorage.removeItem("yummy-state");
      return;
    }
    try {
      await Filesystem.deleteFile({ path: STATE_FILE, directory: Directory.Data });
    } catch {
      /* already gone */
    }
  },
}));

export interface YummyState {
  ready: boolean;
  seedVersion: string;
  pantry: Record<string, PantryEntry>;
  customPantry: CustomPantryItem[];
  recipes: Recipe[];
  featured: Recipe[];
  featuredAt?: string;
  pantryOnline: Recipe[];
  onlineKey: string;
  onlineAt?: string;
  plan: Record<string, string[]>;
  shopping: ShoppingItem[];
  settings: Settings;
  toast?: string;
  setToast: (message?: string) => void;
  togglePantry: (id: string, name?: string) => void;
  setPantryDetail: (id: string, detail: Partial<PantryEntry>) => void;
  addCustomPantryItem: (item: { name: string; emoji: string; aisle: string }) => void;
  deleteCustomPantryItem: (id: string) => void;
  clearPantry: () => void;
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (id: string, patch: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  toggleFavorite: (id: string) => void;
  addNote: (id: string, text: string) => void;
  logCook: (id: string) => void;
  planRecipe: (date: string, recipeId: string) => void;
  unplanRecipe: (date: string, recipeId: string) => void;
  addMissingToShopping: (recipe: Recipe, missing: MissingItem[]) => void;
  addShoppingItem: (text: string, aisle?: string) => void;
  toggleShopping: (id: string) => void;
  removeShopping: (id: string) => void;
  clearChecked: () => void;
  clearShopping: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  setFeatured: (recipes: Recipe[]) => void;
  setPantryOnline: (recipes: Recipe[], key: string) => void;
  saveFeatured: (id: string) => void;
  resetApp: () => void;
}

export const useApp = create<YummyState>()(
  persist(
    (set, get) => ({
      ready: false,
      seedVersion: SEED_VERSION,
      pantry: {},
      customPantry: [],
      recipes: seedRecipes,
      featured: [],
      featuredAt: undefined,
      pantryOnline: [],
      onlineKey: "",
      onlineAt: undefined,
      plan: {},
      shopping: [],
      settings: {
        system: "metric",
        useStaples: true,
        substitutions: true,
        defaultServings: 4,
      },
      toast: undefined,

      setToast: (toast) => set({ toast }),

      togglePantry: (id, name) =>
        set((state) => {
          const next = { ...state.pantry };
          if (next[id]) {
            delete next[id];
          } else {
            next[id] = { id, name, addedAt: new Date().toISOString() };
          }
          return { pantry: next };
        }),

      setPantryDetail: (id, detail) =>
        set((state) => {
          const existing = state.pantry[id];
          if (!existing) return state;
          return {
            pantry: {
              ...state.pantry,
              [id]: { ...existing, ...detail },
            },
          };
        }),

      addCustomPantryItem: (item) =>
        set((state) => {
          const name = item.name.trim();
          if (!name) return state;
          const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          const id = `custom-${slug || "item"}-${Date.now().toString(36)}`;
          const entry: CustomPantryItem = {
            id,
            name,
            emoji: item.emoji || "🥫",
            aisle: item.aisle || "other",
          };
          return {
            customPantry: [entry, ...state.customPantry],
            pantry: {
              ...state.pantry,
              [id]: { id, name, addedAt: new Date().toISOString() },
            },
            toast: `${name} is in your pantry`,
          };
        }),

      deleteCustomPantryItem: (id) =>
        set((state) => {
          const pantry = { ...state.pantry };
          delete pantry[id];
          return {
            customPantry: state.customPantry.filter((item) => item.id !== id),
            pantry,
            toast: "Custom ingredient removed",
          };
        }),

      clearPantry: () => set({ pantry: {} }),

      addRecipe: (recipe) =>
        set((state) => ({
          recipes: [recipe, ...state.recipes.filter((r) => r.id !== recipe.id)],
          featured: state.featured.filter((r) => r.id !== recipe.id),
          pantryOnline: state.pantryOnline.filter((r) => r.id !== recipe.id),
        })),

      updateRecipe: (id, patch) =>
        set((state) => ({
          recipes: state.recipes.map((recipe) =>
            recipe.id === id ? { ...recipe, ...patch } : recipe
          ),
        })),

      deleteRecipe: (id) =>
        set((state) => ({
          recipes: state.recipes.filter((r) => r.id !== id),
          plan: Object.fromEntries(
            Object.entries(state.plan)
              .map(([day, ids]) => [day, ids.filter((rid) => rid !== id)])
              .filter(([, ids]) => (ids as string[]).length > 0)
          ),
        })),

      toggleFavorite: (id) =>
        set((state) => ({
          recipes: state.recipes.map((r) =>
            r.id === id ? { ...r, favorite: !r.favorite } : r
          ),
        })),

      addNote: (id, text) =>
        set((state) => ({
          recipes: state.recipes.map((r) =>
            r.id === id
              ? {
                  ...r,
                  notes: [
                    { id: `note-${Date.now()}`, text, at: new Date().toISOString() },
                    ...r.notes,
                  ],
                }
              : r
          ),
        })),

      logCook: (id) =>
        set((state) => ({
          recipes: state.recipes.map((r) =>
            r.id === id
              ? {
                  ...r,
                  cookCount: r.cookCount + 1,
                  lastCooked: new Date().toISOString(),
                }
              : r
          ),
        })),

      planRecipe: (date, recipeId) =>
        set((state) => {
          const day = state.plan[date] ?? [];
          if (day.includes(recipeId)) return state;
          return { plan: { ...state.plan, [date]: [...day, recipeId] } };
        }),

      unplanRecipe: (date, recipeId) =>
        set((state) => {
          const day = (state.plan[date] ?? []).filter((id) => id !== recipeId);
          const plan = { ...state.plan };
          if (day.length) plan[date] = day;
          else delete plan[date];
          return { plan };
        }),

      addMissingToShopping: (recipe, missing) =>
        set((state) => {
          const next = [...state.shopping];
          for (const item of missing) {
            const key = item.canonicalId ?? item.item.toLowerCase();
            const existing = next.find(
              (s) => (s.id === key || s.text.toLowerCase() === item.item.toLowerCase()) && !s.checked
            );
            if (existing) continue;
            next.push({
              id: item.canonicalId ?? `item-${Date.now()}-${next.length}`,
              text: [item.qtyText, item.item].filter(Boolean).join(" "),
              aisle: item.aisle || "other",
              checked: false,
              recipeId: recipe.id,
              recipeTitle: recipe.title,
            });
          }
          return { shopping: next, toast: `${missing.length} added to your list` };
        }),

      addShoppingItem: (text, aisle) =>
        set((state) => {
          const clean = text.trim();
          if (!clean) return state;
          if (state.shopping.some((s) => s.text.toLowerCase() === clean.toLowerCase())) {
            return { toast: "Already on the list" };
          }
          return {
            shopping: [
              ...state.shopping,
              {
                id: `manual-${Date.now()}`,
                text: clean,
                aisle: aisle ?? "other",
                checked: false,
              },
            ],
          };
        }),

      toggleShopping: (id) =>
        set((state) => ({
          shopping: state.shopping.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item
          ),
        })),

      removeShopping: (id) =>
        set((state) => ({ shopping: state.shopping.filter((item) => item.id !== id) })),

      clearChecked: () =>
        set((state) => ({ shopping: state.shopping.filter((item) => !item.checked) })),

      clearShopping: () => set({ shopping: [] }),

      setSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),

      setFeatured: (recipes) => {
        const savedIds = new Set(get().recipes.map((r) => r.id));
        set({
          featured: recipes.filter((r) => !savedIds.has(r.id)),
          featuredAt: new Date().toISOString(),
        });
      },

      setPantryOnline: (recipes, key) => {
        const savedIds = new Set(get().recipes.map((r) => r.id));
        set({
          pantryOnline: recipes.filter((r) => !savedIds.has(r.id)),
          onlineKey: key,
          onlineAt: new Date().toISOString(),
        });
      },

      saveFeatured: (id) => {
        const found = get().featured.find((r) => r.id === id);
        if (!found) return;
        get().addRecipe({ ...found, source: "featured" });
        set({ toast: "Saved to your library" });
      },

      resetApp: () =>
        set({
          pantry: {},
          recipes: seedRecipes,
          featured: [],
          featuredAt: undefined,
          pantryOnline: [],
          onlineKey: "",
          onlineAt: undefined,
          plan: {},
          shopping: [],
          customPantry: [],
          settings: {
            system: "metric",
            useStaples: true,
            substitutions: true,
            defaultServings: 4,
          },
          toast: "Fresh start",
        }),
    }),
    {
      name: "yummy-state",
      storage,
      partialize: (state) => ({
        seedVersion: state.seedVersion,
        pantry: state.pantry,
        customPantry: state.customPantry,
        recipes: state.recipes,
        featured: state.featured,
        featuredAt: state.featuredAt,
        pantryOnline: state.pantryOnline,
        onlineKey: state.onlineKey,
        onlineAt: state.onlineAt,
        plan: state.plan,
        shopping: state.shopping,
        settings: state.settings,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<YummyState>;
        const savedRecipes = (saved.recipes ?? current.recipes).map(withSeedMeta);
        let recipes = savedRecipes.map(ensureRecipeMeta);
        let seedVersion = saved.seedVersion ?? "0";
        if (seedVersion !== SEED_VERSION) {
          const known = new Set(recipes.map((recipe) => recipe.id));
          const additions = seedRecipes.filter((recipe) => !known.has(recipe.id));
          recipes = [...recipes, ...additions];
          seedVersion = SEED_VERSION;
        }
        return {
          ...current,
          ...saved,
          seedVersion,
          recipes,
          featured: (saved.featured ?? current.featured).map(ensureRecipeMeta),
          pantryOnline: (saved.pantryOnline ?? []).map(ensureRecipeMeta),
          onlineKey: saved.onlineKey ?? "",
          onlineAt: saved.onlineAt,
          customPantry: saved.customPantry ?? [],
          pantry: saved.pantry ?? {},
        };
      },
      onRehydrateStorage: () => (state) => {
        useApp.setState({ ready: true });
        if (state && !state.recipes) useApp.setState({ recipes: seedRecipes });
      },
    }
  )
);

if (typeof window !== "undefined") {
  window.setTimeout(() => {
    if (!useApp.getState().ready) useApp.setState({ ready: true });
  }, 450);
}

export function shoppingAisle(text: string): string {
  return aisleOf(undefined) ?? "other";
}

export function planWithMatches(
  plan: Record<string, string[]>,
  matches: Record<string, MatchResult>
): Array<{ date: string; ids: string[]; missing: number }> {
  return Object.entries(plan).map(([date, ids]) => ({
    date,
    ids,
    missing: ids.reduce((sum, id) => sum + (matches[id]?.missing.length ?? 0), 0),
  }));
}
