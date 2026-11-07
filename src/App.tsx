import { useEffect, useMemo, useState } from "react";
import { match as matchRecipes, pickUrl } from "./core/api";
import { isNative, ShareReceiver } from "./core/native";
import type { MatchResult, Recipe } from "./core/types";
import { useApp } from "./state/store";
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
import { Toast } from "./components/UI";

type Tab = "pantry" | "discover" | "library" | "list" | "plan";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "pantry", label: "Pantry", icon: "basket" },
  { id: "discover", label: "Discover", icon: "sparkle" },
  { id: "library", label: "Library", icon: "book" },
  { id: "list", label: "List", icon: "list" },
  { id: "plan", label: "Plan", icon: "calendar" },
];

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
  const toast = useApp((s) => s.toast);
  const setToast = useApp((s) => s.setToast);

  const [tab, setTab] = useState<Tab>("pantry");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cookId, setCookId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureUrl, setCaptureUrl] = useState<string | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const allRecipes = useMemo(() => [...recipes, ...featured], [recipes, featured]);
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
          {tab === "pantry" && (
            <PantryScreen
              matches={matches}
              onSettings={() => setSettingsOpen(true)}
              onFindDinner={() => setTab("discover")}
            />
          )}
          {tab === "discover" && (
            <DiscoverScreen
              matches={matches}
              loading={loading}
              onOpen={openRecipe}
              onGoPantry={() => setTab("pantry")}
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
                onClick={() => setTab(item.id)}
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
          onPlanDone={() => setTab("plan")}
        />
      )}

      {cooking && <CookMode recipe={cooking} onClose={() => setCookId(null)} />}

      <CaptureSheet
        open={captureOpen}
        initialUrl={captureUrl}
        onClose={() => {
          setCaptureOpen(false);
          setCaptureUrl(undefined);
        }}
        onSaved={(recipe) => {
          setTab("library");
          setSelectedId(recipe.id);
        }}
      />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Toast message={toast} />
    </>
  );
}
