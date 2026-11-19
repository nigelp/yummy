import { useEffect, useMemo, useState } from "react";
import { match as matchRecipes, pickUrl } from "./core/api";
import { isNative, ShareReceiver } from "./core/native";
import type { DiscoverSeed, FindMode, MatchResult, MealType, Recipe } from "./core/types";
import { useApp } from "./state/store";
import { FindScreen } from "./screens/FindScreen";
import { PantryScreen } from "./screens/PantryScreen";
import { DiscoverScreen } from "./screens/DiscoverScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { ListScreen } from "./screens/ListScreen";
import { PlanScreen } from "./screens/PlanScreen";
import { RecipeSheet } from "./screens/RecipeSheet";
import { CookMode } from "./screens/CookMode";
import { CaptureSheet } from "./screens/CaptureSheet";
import { SettingsSheet } from "./screens/SettingsSheet";
import { Icon } from "./components/Icon";
import { Sheet, Toast } from "./components/UI";

type Tab = "find" | "discover" | "library" | "list" | "plan";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "find", label: "Find", icon: "search" },
  { id: "discover", label: "Discover", icon: "sparkle" },
  { id: "library", label: "Library", icon: "book" },
  { id: "list", label: "List", icon: "list" },
  { id: "plan", label: "Plan", icon: "calendar" },
];

const MEAL_TAGS = new Set<string>(["breakfast", "lunch", "dinner", "dessert", "snack"]);

function useMatches(recipes: Recipe[]): {
  matches: Record<string, MatchResult>;
  loading: boolean;
} {
  const pantry = useApp((s) => s.pantry);
  const settings = useApp((s) => s.settings);
  const [matches, setMatches] = useState<Record<string, MatchResult>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (recipes.length === 0) {
      setMatches({});
      return;
    }
    let alive = true;
    setLoading(true);
    matchRecipes(recipes, Object.values(pantry), settings)
      .then((result) => {
        if (alive) setMatches(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [recipes, pantry, settings]);

  return { matches, loading };
}

export default function App() {
  const ready = useApp((s) => s.ready);
  const recipes = useApp((s) => s.recipes);
  const featured = useApp((s) => s.featured);
  const pantryOnline = useApp((s) => s.pantryOnline);
  const toast = useApp((s) => s.toast);
  const setToast = useApp((s) => s.setToast);

  const [tab, setTab] = useState<Tab>("find");
  const [findMode, setFindMode] = useState<FindMode>("tags");
  const [findTags, setFindTags] = useState<string[]>([]);
  const [findQuery, setFindQuery] = useState("");
  const [discoverSeed, setDiscoverSeed] = useState<DiscoverSeed | undefined>(undefined);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cookId, setCookId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureUrl, setCaptureUrl] = useState<string | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const allRecipes = useMemo(() => {
    const byId = new Map<string, Recipe>();
    for (const recipe of [...recipes, ...featured, ...pantryOnline]) {
      byId.set(recipe.id, recipe);
    }
    return Array.from(byId.values());
  }, [recipes, featured, pantryOnline]);
  const { matches, loading } = useMatches(allRecipes);

  const selected = selectedId
    ? allRecipes.find((recipe) => recipe.id === selectedId)
    : undefined;
  const cooking = cookId ? allRecipes.find((recipe) => recipe.id === cookId) : undefined;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast, setToast]);

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    let remove: (() => void) | undefined;
    const handle = async (text: string | null) => {
      if (!text) return;
      const url = pickUrl(text);
      if (url) {
        setCaptureUrl(url);
        setCaptureOpen(true);
        setToast("Link received — reading it now");
      } else {
        setToast("That share didn't include a link");
      }
    };
    void (async () => {
      try {
        const initial = await ShareReceiver.getShared();
        if (initial.text) await handle(initial.text);
        const listener = await ShareReceiver.addListener("shared", (data) => {
          void handle(data.text);
        });
        if (cancelled) void listener.remove();
        else remove = () => void listener.remove();
      } catch {
        /* share plugin unavailable */
      }
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [setToast]);

  const openRecipe = (recipe: Recipe) => {
    setSelectedId(recipe.id);
  };

  const goToTab = (next: Tab) => {
    // A seed belongs to one handoff only. Leaving Discover (or opening it
    // from anywhere other than Find) starts from the normal Discover state.
    setDiscoverSeed(undefined);
    setTab(next);
  };

  const openDiscover = () => {
    const seed =
      tab === "find" && (findQuery.trim() || findTags.length > 0)
        ? {
            query: findQuery,
            meals: findTags.filter((tag): tag is MealType => MEAL_TAGS.has(tag)),
            tags: findTags.filter((tag) => !MEAL_TAGS.has(tag)),
            nonce: Date.now(),
          }
        : undefined;
    setDiscoverSeed(seed);
    setTab("discover");
  };

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash-mark">🍑</div>
        <div className="brand" style={{ fontSize: 34 }}>
          yummy<span className="dot" />
        </div>
        <p className="tiny faint">opening your kitchen…</p>
      </div>
    );
  }

  return (
    <>
      <div className="app-shell">
        <div className="app-frame">
          {tab === "find" && (
            <FindScreen
              matches={matches}
              mode={findMode}
              onModeChange={setFindMode}
              query={findQuery}
              onQueryChange={setFindQuery}
              selected={findTags}
              onSelectedChange={setFindTags}
              onOpen={openRecipe}
              onSettings={() => setSettingsOpen(true)}
              onManagePantry={() => setPantryOpen(true)}
              onOpenDiscover={openDiscover}
              onOpenLibrary={() => goToTab("library")}
            />
          )}
          {tab === "discover" && (
            <DiscoverScreen
              seed={discoverSeed}
              matches={matches}
              loading={loading}
              onOpen={openRecipe}
              onGoPantry={() => setPantryOpen(true)}
            />
          )}
          {tab === "library" && (
            <LibraryScreen
              matches={matches}
              onOpen={openRecipe}
              onCapture={() => {
                setCaptureUrl(undefined);
                setCaptureOpen(true);
              }}
            />
          )}
          {tab === "list" && <ListScreen />}
          {tab === "plan" && <PlanScreen matches={matches} onOpen={openRecipe} />}

          <nav className="dock" aria-label="Main">
            {TABS.map((item) => (
              <button
                key={item.id}
                className={`dock-item ${tab === item.id ? "active" : ""}`}
                onClick={() => (item.id === "discover" ? openDiscover() : goToTab(item.id))}
                aria-current={tab === item.id}
              >
                <Icon name={item.icon} size={20} strokeWidth={tab === item.id ? 2 : 1.7} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {selected && (
        <RecipeSheet
          recipe={selected}
          match={matches[selected.id]}
          onClose={() => setSelectedId(null)}
          onCook={(recipe) => {
            setSelectedId(null);
            setCookId(recipe.id);
          }}
          onPlanDone={() => goToTab("plan")}
        />
      )}

      {cooking && <CookMode recipe={cooking} onClose={() => setCookId(null)} />}

      <Sheet open={pantryOpen} onClose={() => setPantryOpen(false)} full label="My pantry">
        <PantryScreen
          matches={matches}
          embedded
          onBack={() => setPantryOpen(false)}
          onSettings={() => setSettingsOpen(true)}
          onFindDinner={() => {
            setPantryOpen(false);
            goToTab("discover");
          }}
        />
      </Sheet>

      <CaptureSheet
        open={captureOpen}
        initialUrl={captureUrl}
        onClose={() => {
          setCaptureOpen(false);
          setCaptureUrl(undefined);
        }}
        onSaved={(recipe) => {
          goToTab("library");
          setSelectedId(recipe.id);
        }}
      />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Toast message={toast} />
    </>
  );
}
