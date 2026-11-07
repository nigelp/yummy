import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/store";
import { catalogById } from "../data/catalog";
import { fetchFeatured, fetchPantryMatches } from "../core/api";
import type { MatchResult, MealType, Recipe } from "../core/types";
import { Icon } from "../components/Icon";
import { Art } from "../components/Art";
import { FeaturedCard, MealCard, RecipeCard } from "../components/RecipeCard";
import { Chip, EmptyState } from "../components/UI";
import { FILTER_TAGS, MEAL_LABELS, tagLabel } from "../lib/classify";
import { formatTime } from "../lib/format";

type MealFilter = "all" | MealType;

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "dessert", "snack"];

const MEAL_FILTERS: Array<{ id: MealFilter; label: string; emoji: string }> = [
  { id: "all", label: "Everything", emoji: "🍽️" },
  ...MEAL_ORDER.map((id) => ({ id, label: MEAL_LABELS[id].label, emoji: MEAL_LABELS[id].emoji })),
];

export function DiscoverScreen({
  matches,
  loading,
  onOpen,
  onGoPantry,
}: {
  matches: Record<string, MatchResult>;
  loading: boolean;
  onOpen: (recipe: Recipe) => void;
  onGoPantry: () => void;
}) {
  const recipes = useApp((s) => s.recipes);
  const featured = useApp((s) => s.featured);
  const featuredAt = useApp((s) => s.featuredAt);
  const setFeatured = useApp((s) => s.setFeatured);
  const pantryOnline = useApp((s) => s.pantryOnline);
  const onlineKey = useApp((s) => s.onlineKey);
  const onlineAt = useApp((s) => s.onlineAt);
  const setPantryOnline = useApp((s) => s.setPantryOnline);
  const pantry = useApp((s) => s.pantry);
  const [fetching, setFetching] = useState(false);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [almostOnly, setAlmostOnly] = useState(false);
  const [meal, setMeal] = useState<MealFilter>("all");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [explore, setExplore] = useState(false);
  const [fetchingMatches, setFetchingMatches] = useState(false);
  const requested = useRef(false);
  const onlineRequested = useRef("");

  const pantryKey = useMemo(() => Object.keys(pantry).sort().join("|"), [pantry]);

  const refresh = async (force = false, includeMatches = false) => {
    if (!force && !navigator.onLine) return;
    setFetching(true);
    setFeatureError(null);
    try {
      const fresh = await fetchFeatured();
      if (fresh.length) {
        setFeatured(fresh);
      } else {
        setFeatureError("TheMealDB didn't return any recipes just now.");
      }
    } catch {
      setFeatureError(
        navigator.onLine
          ? "Couldn't reach TheMealDB. Give it a moment and try again."
          : "You're offline — saved recipes still work."
      );
    } finally {
      setFetching(false);
    }

    if (includeMatches && pantryKey && navigator.onLine) {
      onlineRequested.current = "";
      setFetchingMatches(true);
      fetchPantryMatches(Object.values(pantry))
        .then((list) => {
          if (list.length) setPantryOnline(list, pantryKey);
        })
        .catch(() => undefined)
        .finally(() => setFetchingMatches(false));
    }
  };

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const stale =
      !featuredAt || Date.now() - new Date(featuredAt).getTime() > 4 * 60 * 60 * 1000;
    if (stale) void refresh();
  }, []);

  useEffect(() => {
    if (!pantryKey || !navigator.onLine) return;
    const stale =
      pantryKey !== onlineKey ||
      !onlineAt ||
      Date.now() - new Date(onlineAt).getTime() > 2 * 60 * 60 * 1000;
    if (!stale || onlineRequested.current === pantryKey) return;
    onlineRequested.current = pantryKey;
    let alive = true;
    let completed = false;
    setFetchingMatches(true);
    fetchPantryMatches(Object.values(pantry))
      .then((list) => {
        completed = true;
        if (alive && list.length) setPantryOnline(list, pantryKey);
      })
      .catch(() => undefined)
      .finally(() => {
        completed = true;
        if (alive) setFetchingMatches(false);
      });
    return () => {
      alive = false;
      setFetchingMatches(false);
      // React StrictMode mounts effects twice in dev; let an unfinished run retry.
      if (onlineRequested.current === pantryKey && !completed) onlineRequested.current = "";
    };
  }, [pantryKey, onlineKey, onlineAt, pantry, setPantryOnline]);

  const all = useMemo(() => {
    const byId = new Map<string, Recipe>();
    for (const recipe of [...recipes, ...featured, ...pantryOnline]) {
      byId.set(recipe.id, recipe);
    }
    return Array.from(byId.values());
  }, [recipes, featured, pantryOnline]);
  const pantryCount = Object.keys(pantry).length;
  const coreOf = (recipe: Recipe) => matches[recipe.id]?.coreHave ?? 0;
  const pantryIdSet = useMemo(() => new Set(Object.keys(pantry)), [pantry]);
  const pantryWords = useMemo(() => {
    const words = new Set<string>();
    for (const entry of Object.values(pantry)) {
      const def = catalogById.get(entry.id);
      if (def?.staple) continue;
      const name = (def?.name ?? entry.name ?? "").toLowerCase();
      for (const word of name.split(/[^a-z]+/)) {
        if (word.length > 2) words.add(word);
      }
    }
    return words;
  }, [pantry]);

  const titleMatchesPantry = (recipe: Recipe): boolean =>
    recipe.title
      .toLowerCase()
      .split(/[^a-z]+/)
      .some((word) => pantryWords.has(word));

  const pantryHas = (id?: string): boolean => {
    if (!id) return false;
    if (pantryIdSet.has(id)) return true;
    if (["chicken", "chicken_breast", "chicken_thigh"].includes(id)) {
      return ["chicken", "chicken_breast", "chicken_thigh"].some((cut) => pantryIdSet.has(cut));
    }
    return false;
  };

  const filtered = useMemo(() => {
    return all
      .filter((recipe) => {
        if (meal !== "all" && recipe.mealType !== meal) return false;
        const match = matches[recipe.id];
        if (almostOnly && match && match.total > 0 && match.score >= 100) return false;
        if (tags.size > 0 && !Array.from(tags).every((tag) => recipe.tags.includes(tag))) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ma = matches[a.id];
        const mb = matches[b.id];
        return (
          (mb?.coreHave ?? 0) - (ma?.coreHave ?? 0) ||
          (mb?.score ?? 0) - (ma?.score ?? 0) ||
          (mb?.expiringUsed.length ?? 0) - (ma?.expiringUsed.length ?? 0) ||
          (a.timeMin ?? 99) - (b.timeMin ?? 99)
        );
      });
  }, [all, matches, meal, almostOnly, tags]);

  // Sharing one egg with an apple pie is not a match. A recipe has to either
  // use a lead ingredient, use several pantry items, or be a simple/breakfast dish.
  const isRelevant = (recipe: Recipe) => {
    if (pantryCount === 0) return true;
    const match = matches[recipe.id];
    if (!match || match.coreHave <= 0) return false;
    if (meal === "dessert" || meal === "snack") return true;
    if (match.coreHave >= 2) return true;
    if (recipe.mealType === "dessert" || recipe.mealType === "snack") return false;
    if (recipe.mealType === "breakfast") return true;
    if (titleMatchesPantry(recipe)) return true;
    const leadIndex = recipe.ingredients.findIndex(
      (ingredient) =>
        !!ingredient.canonicalId &&
        pantryHas(ingredient.canonicalId) &&
        !catalogById.get(ingredient.canonicalId)?.staple
    );
    if (leadIndex >= 0 && leadIndex <= 1) return true;
    if (match.coreTotal <= 4) return true;
    if (match.total > 0 && match.have / match.total >= 0.75) return true;
    return false;
  };

  const shown =
    pantryCount > 0 && !explore ? filtered.filter(isRelevant) : filtered;

  const hero = useMemo(() => {
    const pool = shown.length ? shown : pantryCount === 0 ? all : [];
    return pool.find((recipe) => recipe.mealType !== "dessert") ?? pool[0];
  }, [shown, all, pantryCount]);

  const heroMatch = hero ? matches[hero.id] : undefined;

  const sections = useMemo(
    () =>
      MEAL_ORDER.map((type) => {
        const list = shown.filter((recipe) => recipe.mealType === type);
        return { type, total: list.length, recipes: list.slice(0, 4) };
      }).filter((section) => section.recipes.length > 0),
    [shown]
  );

  // The web rail is a browse feed, not a meal-filtered result set.
  const featuredVisible = useMemo(() => featured.slice(0, 10), [featured]);

  const surprise = () => {
    const pool = shown.slice(0, Math.min(8, shown.length));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) onOpen(pick);
  };

  const toggleTag = (tag: string) => {
    const next = new Set(tags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setTags(next);
  };

  const resetFilters = () => {
    setMeal("all");
    setTags(new Set());
    setAlmostOnly(false);
    setExplore(false);
  };

  const filtersActive = meal !== "all" || tags.size > 0 || almostOnly;

  return (
    <div className="screen">
      <div className="screen-head">
        <div className="grow">
          <p className="eyebrow">
            {pantryCount ? `${pantryCount} things in your kitchen` : "an empty pantry, endless options"}
          </p>
          <h1 className="title-xl" style={{ marginTop: 4 }}>
            Find a meal
          </h1>
        </div>
        <button className="icon-btn" onClick={surprise} aria-label="Surprise me">
          <Icon name="shuffle" size={19} />
        </button>
      </div>

      {pantryCount > 0 ? (
        <div className="chip-row" style={{ marginBottom: 4 }}>
          {Object.values(pantry)
            .slice(0, 6)
            .map((entry) => {
              const item = catalogById.get(entry.id);
              return (
                <span key={entry.id} className="chip soft" style={{ pointerEvents: "none" }}>
                  <span>{item?.emoji ?? "🥫"}</span> {item?.name ?? entry.name}
                </span>
              );
            })}
          <button className="chip ghost" onClick={onGoPantry}>
            <Icon name="pen" size={12} /> edit
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 16, marginBottom: 8 }}>
          <div className="row gap-10">
            <div className="mini-bubble">🥕</div>
            <div className="grow">
              <strong style={{ fontSize: 13 }}>Add a few ingredients for honest matches</strong>
              <p className="tiny muted" style={{ marginTop: 2 }}>
                Everything is still browsable — scores just get personal once your pantry knows you.
              </p>
            </div>
          </div>
          <button
            className="secondary-btn"
            style={{ marginTop: 11 }}
            onClick={onGoPantry}
          >
            <Icon name="basket" size={16} /> Open my pantry
          </button>
        </div>
      )}

      {hero && (
        <button className="hero pressable" onClick={() => onOpen(hero)} style={{ width: "100%", border: 0, padding: 0, textAlign: "left" }}>
          <Art art={hero.art} emoji={hero.emoji} image={hero.image} />
          <div className="badge">
            <Icon name="sparkle" size={11} /> best match · {MEAL_LABELS[hero.mealType ?? "dinner"].emoji}{" "}
            {MEAL_LABELS[hero.mealType ?? "dinner"].label}
          </div>
          {heroMatch && (
            <div className="hero-score">
              {heroMatch.score}% <span>match</span>
            </div>
          )}
          <div className="overlay">
            <h2>{hero.title}</h2>
            <div className="meta">
              {hero.timeMin ? (
                <span>
                  <Icon name="clock" size={13} /> {formatTime(hero.timeMin)}
                </span>
              ) : null}
              <span>
                <Icon name="users" size={13} /> {hero.servings}
              </span>
              <span>{hero.cuisine ?? "Home cooking"}</span>
            </div>
          </div>
        </button>
      )}

      <div className="chip-row" style={{ marginTop: 16 }}>
        {MEAL_FILTERS.map((option) => (
          <Chip key={option.id} active={meal === option.id} onClick={() => setMeal(option.id)}>
            <span>{option.emoji}</span> {option.label}
          </Chip>
        ))}
      </div>

      <div className="chip-row">
        <Chip active={almostOnly} onClick={() => setAlmostOnly((value) => !value)}>
          <Icon name="sparkle" size={12} /> Almost there
        </Chip>
        {FILTER_TAGS.map((tag) => (
          <Chip key={tag} active={tags.has(tag)} onClick={() => toggleTag(tag)} soft>
            {tagLabel(tag)}
          </Chip>
        ))}
      </div>

      {pantryCount > 0 && (
        <div className="row" style={{ justifyContent: "space-between", margin: "2px 2px 0", gap: 8 }}>
          <span className="tiny faint">
            {fetchingMatches
              ? "looking for web dishes with your ingredients…"
              : explore
                ? `Showing everything · ${shown.length} ideas`
                : `${shown.length} ${shown.length === 1 ? "meal uses" : "meals use"} your pantry`}
          </span>
          <button
            className="ghost-btn"
            style={{ padding: "2px 4px", whiteSpace: "nowrap" }}
            onClick={() => setExplore((value) => !value)}
          >
            {explore ? "Only my ingredients" : "Explore everything"}
          </button>
        </div>
      )}

      {filtersActive && (
        <div className="row" style={{ justifyContent: "space-between", margin: "2px 2px 0" }}>
          <span className="tiny faint">
            {shown.length} {shown.length === 1 ? "meal" : "meals"} match
          </span>
          <button className="ghost-btn" style={{ padding: "2px 4px" }} onClick={resetFilters}>
            Clear filters
          </button>
        </div>
      )}

      {shown.length === 0 && pantryCount > 0 && !explore ? (
        <EmptyState
          emoji="🧺"
          title="Nothing uses those ingredients yet"
          body={
            fetchingMatches
              ? "We're looking through TheMealDB for dishes built around what you have."
              : "Add another ingredient or two, or explore everything — sometimes a recipe is worth a small shop."
          }
          action={
            <div className="row gap-8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
              <button className="primary-btn" style={{ width: "auto", padding: "11px 16px" }} onClick={onGoPantry}>
                <Icon name="basket" size={16} /> Edit pantry
              </button>
              <button className="secondary-btn" style={{ width: "auto", padding: "11px 16px" }} onClick={() => setExplore(true)}>
                Explore everything
              </button>
            </div>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          emoji="🫧"
          title="No recipe fits those filters"
          body="Loosen a filter, or add a few more ingredients to the pantry — half a lemon counts."
          action={
            <button className="secondary-btn" style={{ width: "auto", padding: "11px 16px" }} onClick={resetFilters}>
              Clear filters
            </button>
          }
        />
      ) : meal === "all" ? (
        sections.map((section) => (
          <div key={section.type}>
            <div className="section-head">
              <h2>
                {MEAL_LABELS[section.type].emoji} {MEAL_LABELS[section.type].label}
              </h2>
              <button className="link" onClick={() => setMeal(section.type)}>
                {section.total > section.recipes.length ? `see all ${section.total}` : "see all"}
              </button>
            </div>
            <div className="rail">
              {section.recipes.map((recipe) => (
                <MealCard
                  key={recipe.id}
                  recipe={recipe}
                  match={matches[recipe.id]}
                  onClick={() => onOpen(recipe)}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <>
          <div className="section-head">
            <h2>
              {MEAL_LABELS[meal].emoji} {MEAL_LABELS[meal].label}
            </h2>
            <span className="tiny faint">{MEAL_LABELS[meal].blurb}</span>
          </div>
          <div className="stack gap-10">
            {shown.slice(0, 24).map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                match={matches[recipe.id]}
                onClick={() => onOpen(recipe)}
              />
            ))}
          </div>
        </>
      )}

      {loading && <p className="tiny faint center" style={{ marginTop: 10 }}>reading your pantry…</p>}

      <div className="section-head">
        <h2>Browse more from the web</h2>
        <button className="link" onClick={() => void refresh(true, true)} disabled={fetching}>
          {fetching ? "looking…" : "refresh"}
        </button>
      </div>
      {fetching && featured.length === 0 ? (
        <div className="rail">
          {[0, 1, 2].map((index) => (
            <div key={index} className="shimmer" style={{ width: 168, height: 200, borderRadius: 22 }} />
          ))}
        </div>
      ) : featuredVisible.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <p className="small muted" style={{ lineHeight: 1.5 }}>
            {featureError
              ? featureError
              : !navigator.onLine
                ? "You're offline — saved recipes still work."
                : "Nothing new right now — tap refresh to ask TheMealDB again."}
          </p>
          {(featureError || featured.length === 0) && (
            <button
              className="secondary-btn"
              style={{ marginTop: 10 }}
              disabled={fetching}
              onClick={() => void refresh(true, true)}
            >
              {fetching ? "Trying…" : "Try again"}
            </button>
          )}
        </div>
      ) : (
        <div className="rail">
          {featuredVisible.map((recipe) => (
            <FeaturedCard
              key={recipe.id}
              recipe={recipe}
              match={matches[recipe.id]}
              onClick={() => onOpen(recipe)}
            />
          ))}
        </div>
      )}

      <p className="tiny faint center" style={{ marginTop: 24, lineHeight: 1.5 }}>
        Matched recipes come from your library and TheMealDB (filtered by your ingredients). The
        web rail is a broader browse. Matches ignore store-cupboard staples.
      </p>
    </div>
  );
}
