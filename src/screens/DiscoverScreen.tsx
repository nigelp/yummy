import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useApp } from "../state/store";
import { catalogById } from "../data/catalog";
import { fetchFeatured, fetchPantryMatches, searchTextTokens } from "../core/api";
import type { DiscoverSeed, MatchResult, MealType, Recipe } from "../core/types";
import { Icon } from "../components/Icon";
import { Art } from "../components/Art";
import { FeaturedCard, MealCard, RecipeCard, VideoCard } from "../components/RecipeCard";
import { Chip, EmptyState } from "../components/UI";
import { FILTER_TAGS, MEAL_LABELS, tagLabel } from "../lib/classify";
import { formatTime } from "../lib/format";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "dessert", "snack"];

const MEAL_FILTERS: Array<{ id: MealType; label: string; emoji: string }> = MEAL_ORDER.map(
  (id) => ({ id, label: MEAL_LABELS[id].label, emoji: MEAL_LABELS[id].emoji })
);

export function DiscoverScreen({
  seed,
  matches,
  loading,
  onOpen,
  onGoPantry,
}: {
  seed?: DiscoverSeed;
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
  const [matchError, setMatchError] = useState<string | null>(null);
  const [almostOnly, setAlmostOnly] = useState(false);
  const [meals, setMeals] = useState<Set<MealType>>(
    () => new Set(seed?.meals ?? [])
  );
  const [tags, setTags] = useState<Set<string>>(
    () => new Set(seed?.tags ?? [])
  );
  const [query, setQuery] = useState(seed?.query ?? "");
  const [explore, setExplore] = useState(false);
  const [fetchingMatches, setFetchingMatches] = useState(false);
  const requested = useRef(false);
  const onlineRequested = useRef("");
  const resultsRef = useRef<HTMLDivElement>(null);

  const pantryKey = useMemo(() => Object.keys(pantry).sort().join("|"), [pantry]);
  const mealsKey = useMemo(() => [...meals].sort().join("|"), [meals]);
  const tagsKey = useMemo(() => [...tags].sort().join("|"), [tags]);
  const queryKey = query.trim().toLowerCase();
  const requestKey = useMemo(
    () => [pantryKey, mealsKey, tagsKey, queryKey].filter(Boolean).join("~"),
    [pantryKey, mealsKey, tagsKey, queryKey]
  );

  useEffect(() => {
    setMatchError(null);
  }, [requestKey]);

  const webFilters = () => ({
    meals: [...meals],
    tags: [...tags],
    query: query.trim() || undefined,
  });

  const fetchMatchesNow = async () => {
    if (!requestKey) return;
    onlineRequested.current = requestKey;
    setFetchingMatches(true);
    setMatchError(null);
    try {
      const list = await fetchPantryMatches(Object.values(pantry), webFilters());
      setPantryOnline(list, requestKey);
    } catch {
      setMatchError("Couldn't reach TheMealDB. Check your connection and try again.");
    } finally {
      setFetchingMatches(false);
    }
  };

  const refresh = async (includeMatches = false) => {
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

    if (includeMatches) {
      onlineRequested.current = "";
      await fetchMatchesNow();
    }
  };

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const stale =
      !featuredAt || Date.now() - new Date(featuredAt).getTime() > 4 * 60 * 60 * 1000;
    if (stale) void refresh();
  }, []);

  // Criteria carried over from Find. Starting a new seed also clears any
  // previous web request marker so the fetch runs immediately.
  useEffect(() => {
    if (!seed) return;
    setQuery(seed.query);
    setTags(new Set(seed.tags));
    setMeals(new Set(seed.meals));
    setAlmostOnly(false);
    setExplore(false);
    onlineRequested.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce]);

  useEffect(() => {
    if (!requestKey) return;
    const stale =
      requestKey !== onlineKey ||
      !onlineAt ||
      Date.now() - new Date(onlineAt).getTime() > 2 * 60 * 60 * 1000;
    if (!stale || onlineRequested.current === requestKey) return;
    onlineRequested.current = requestKey;
    let alive = true;
    let completed = false;
    // Debounce so typing a search doesn't fire a request per keystroke.
    const timer = window.setTimeout(() => {
      if (!alive) return;
      void fetchMatchesNow().finally(() => {
        completed = true;
      });
    }, 450);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      setFetchingMatches(false);
      // React StrictMode mounts effects twice in dev; let an unfinished run retry.
      if (onlineRequested.current === requestKey && !completed) onlineRequested.current = "";
    };
    // webFilters is derived from these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, onlineKey, onlineAt, pantry, mealsKey, tagsKey, queryKey, setPantryOnline]);

  const matchedWeb = useMemo(
    () => (onlineKey === requestKey ? pantryOnline : []),
    [onlineKey, requestKey, pantryOnline]
  );
  const matchPool = useMemo(() => {
    const byId = new Map<string, Recipe>();
    for (const recipe of [...recipes, ...matchedWeb]) byId.set(recipe.id, recipe);
    return Array.from(byId.values());
  }, [recipes, matchedWeb]);
  const videoSource = useMemo(() => {
    const byId = new Map<string, Recipe>();
    for (const recipe of [...recipes, ...featured, ...matchedWeb]) {
      byId.set(recipe.id, recipe);
    }
    return Array.from(byId.values());
  }, [recipes, featured, matchedWeb]);
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

  const queryTokens = useMemo(() => searchTextTokens(query), [query]);
  const filtered = useMemo(() => {
    return matchPool
      .filter((recipe) => {
        if (
          meals.size > 0 &&
          (!recipe.mealType || !meals.has(recipe.mealType))
        ) {
          return false;
        }
        const match = matches[recipe.id];
        if (almostOnly && match && match.total > 0 && match.score >= 100) return false;
        if (tags.size > 0 && !Array.from(tags).every((tag) => recipe.tags.includes(tag))) {
          return false;
        }
        if (queryTokens.length > 0) {
          const haystack =
            `${recipe.title} ${recipe.description} ${recipe.tags.join(" ")} ${recipe.tags
              .map((tag) => tagLabel(tag))
              .join(" ")} ${recipe.ingredients
              .map((ingredient) => `${ingredient.item} ${ingredient.raw}`)
              .join(" ")}`.toLowerCase();
          if (!queryTokens.every((token) => haystack.includes(token))) return false;
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
  }, [matchPool, matches, meals, almostOnly, tags, queryTokens]);

  const queryNeedle = query.trim().toLowerCase();
  const explicitSearch =
    queryNeedle.length > 0 || tags.size > 0 || meals.size > 0;

  // Sharing one egg with an apple pie is not a match. A recipe has to either
  // use a lead ingredient, use several pantry items, or be a simple/breakfast dish.
  const isRelevant = (recipe: Recipe) => {
    if (pantryCount === 0) return true;
    const match = matches[recipe.id];
    if (!match || match.coreHave <= 0) return false;
    if (meals.has("dessert") || meals.has("snack")) return true;
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
    pantryCount > 0 && !explore && !explicitSearch
      ? filtered.filter(isRelevant)
      : filtered;

  const hero = useMemo(() => {
    const pool = shown.length ? shown : pantryCount === 0 ? matchPool : [];
    return pool.find((recipe) => recipe.mealType !== "dessert") ?? pool[0];
  }, [shown, matchPool, pantryCount]);

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

  // Videos follow the active filters but ignore pantry relevance — a watch-along
  // is still useful when you don't have the ingredients yet.
  const videoPool = useMemo(() => {
    const seen = new Set<string>();
    return videoSource
      .filter((recipe) => {
        if (!recipe.videoUrl) return false;
        if (meals.size > 0 && (!recipe.mealType || !meals.has(recipe.mealType))) {
          return false;
        }
        if (tags.size > 0 && !Array.from(tags).every((tag) => recipe.tags.includes(tag))) {
          return false;
        }
        if (queryTokens.length > 0) {
          const haystack =
            `${recipe.title} ${recipe.description} ${recipe.tags.join(" ")} ${recipe.tags
              .map((tag) => tagLabel(tag))
              .join(" ")} ${recipe.ingredients
              .map((ingredient) => `${ingredient.item} ${ingredient.raw}`)
              .join(" ")}`.toLowerCase();
          if (!queryTokens.every((token) => haystack.includes(token))) return false;
        }
        if (seen.has(recipe.id)) return false;
        seen.add(recipe.id);
        return true;
      })
      .slice(0, 8);
  }, [videoSource, meals, tags, queryTokens]);

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

  const toggleMeal = (meal: MealType) => {
    const next = new Set(meals);
    if (next.has(meal)) next.delete(meal);
    else next.add(meal);
    setMeals(next);
  };

  const resetFilters = () => {
    setMeals(new Set());
    setTags(new Set());
    setQuery("");
    setMatchError(null);
    setAlmostOnly(false);
    setExplore(false);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    onlineRequested.current = "";
    void fetchMatchesNow();
    window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const retryMatches = () => {
    onlineRequested.current = "";
    setMatchError(null);
    void fetchMatchesNow();
  };

  const filtersActive =
    meals.size > 0 || tags.size > 0 || almostOnly || query.trim().length > 0;
  const singleMeal = meals.size === 1 ? [...meals][0] : undefined;
  const visibleSections =
    meals.size > 1 ? sections.filter((section) => meals.has(section.type)) : sections;
  const matchesFresh = onlineKey === requestKey;

  return (
    <div className="screen">
      <div className="screen-head">
        <div className="grow">
          <p className="eyebrow">
            {pantryCount
              ? `${pantryCount} ${pantryCount === 1 ? "thing" : "things"} in your kitchen`
              : "an empty pantry, endless options"}
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

      <form className="find-search" onSubmit={submitSearch} style={{ marginTop: 12 }}>
        <div className="search-wrap">
          <Icon name="search" size={17} />
          <input
            className="input"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search recipes or ingredients…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-btn plain clear-search"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
        <button type="submit" className="search-go">
          Search
        </button>
      </form>

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
        <Chip active={meals.size === 0} onClick={() => setMeals(new Set())}>
          <span>🍽️</span> Everything
        </Chip>
        {MEAL_FILTERS.map((option) => (
          <Chip
            key={option.id}
            active={meals.has(option.id)}
            onClick={() => toggleMeal(option.id)}
          >
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

      {pantryCount > 0 && !explicitSearch && (
        <div className="row" style={{ justifyContent: "space-between", margin: "2px 2px 0", gap: 8 }}>
          <span className="tiny faint">
            {fetchingMatches
              ? "looking for matching web recipes…"
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
        <div className="row" style={{ justifyContent: "space-between", margin: "2px 2px 0", gap: 8 }}>
          <span className="tiny faint">
            {shown.length} {shown.length === 1 ? "result" : "results"}
            {[
              ...Array.from(meals).map((meal) => MEAL_LABELS[meal].label),
              ...Array.from(tags).map((tag) => tagLabel(tag)),
              query.trim() ? `“${query.trim()}”` : "",
            ]
              .filter(Boolean)
              .map((label) => ` · ${label}`)
              .join("")}
          </span>
          <button className="ghost-btn" style={{ padding: "2px 4px" }} onClick={resetFilters}>
            Clear filters
          </button>
        </div>
      )}

      {explicitSearch && (
        <p className="web-status">
          {fetchingMatches ? (
            "Searching TheMealDB for web matches…"
          ) : matchError ? (
            <>
              Couldn't reach TheMealDB.{" "}
              <button className="link" onClick={retryMatches}>
                Retry
              </button>
            </>
          ) : matchesFresh ? (
            `${matchedWeb.length} ${matchedWeb.length === 1 ? "web match" : "web matches"} loaded`
          ) : (
            "Waiting for web results…"
          )}
        </p>
      )}

      <div ref={resultsRef} className="discover-anchor" />

      {shown.length === 0 && explicitSearch ? (
        <EmptyState
          emoji="🔍"
          title="No recipes match that search"
          body={
            fetchingMatches
              ? "We're asking TheMealDB for dishes that fit. Saved recipes still work offline."
              : matchError
                ? "TheMealDB couldn't be reached. Check your connection and retry, or clear the search."
                : matchesFresh
                  ? "No saved recipes or web matches for that. Try a simpler word or fewer tags."
                  : "Waiting for the web search to finish…"
          }
          action={
            <div className="row gap-8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
              {matchError && (
                <button
                  className="primary-btn"
                  style={{ width: "auto", padding: "11px 16px" }}
                  onClick={retryMatches}
                >
                  Try the web again
                </button>
              )}
              <button
                className="secondary-btn"
                style={{ width: "auto", padding: "11px 16px" }}
                onClick={resetFilters}
              >
                Clear filters
              </button>
            </div>
          }
        />
      ) : shown.length === 0 && pantryCount > 0 && !explore ? (
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
      ) : !singleMeal ? (
        visibleSections.map((section) => (
          <div key={section.type}>
            <div className="section-head">
              <h2>
                {MEAL_LABELS[section.type].emoji} {MEAL_LABELS[section.type].label}
              </h2>
              <button
                className="link"
                onClick={() => setMeals(new Set([section.type]))}
              >
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
              {MEAL_LABELS[singleMeal].emoji} {MEAL_LABELS[singleMeal].label}
            </h2>
            <span className="tiny faint">{MEAL_LABELS[singleMeal].blurb}</span>
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

      {videoPool.length > 0 && (
        <>
          <div className="section-head">
            <h2>Watch &amp; cook</h2>
            <span className="tiny faint">
              {videoPool.length} {videoPool.length === 1 ? "video" : "videos"}
            </span>
          </div>
          <div className="rail video-rail">
            {videoPool.map((recipe) => (
              <VideoCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>Browse more from the web</h2>
        <button className="link" onClick={() => void refresh(true)} disabled={fetching}>
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
              onClick={() => void refresh(true)}
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
