import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/store";
import { catalogById } from "../data/catalog";
import { fetchFeatured } from "../core/api";
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
  const pantry = useApp((s) => s.pantry);
  const [fetching, setFetching] = useState(false);
  const [almostOnly, setAlmostOnly] = useState(false);
  const [meal, setMeal] = useState<MealFilter>("all");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const requested = useRef(false);

  const refresh = async (force = false) => {
    if (!force && !navigator.onLine) return;
    setFetching(true);
    try {
      const fresh = await fetchFeatured();
      if (fresh.length) setFeatured(fresh);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const stale =
      !featuredAt || Date.now() - new Date(featuredAt).getTime() > 4 * 60 * 60 * 1000;
    if (stale) void refresh();
  }, []);

  const all = useMemo(() => [...recipes, ...featured], [recipes, featured]);
  const pantryCount = Object.keys(pantry).length;

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
          (mb?.score ?? 0) - (ma?.score ?? 0) ||
          (mb?.expiringUsed.length ?? 0) - (ma?.expiringUsed.length ?? 0) ||
          (a.timeMin ?? 99) - (b.timeMin ?? 99)
        );
      });
  }, [all, matches, meal, almostOnly, tags]);

  const hero = useMemo(() => {
    const pool = filtered.length ? filtered : all;
    // A dessert should never be the headline "best match" unless you asked for sweets.
    return pool.find((recipe) => recipe.mealType !== "dessert") ?? pool[0];
  }, [filtered, all]);

  const heroMatch = hero ? matches[hero.id] : undefined;

  const sections = useMemo(
    () =>
      MEAL_ORDER.map((type) => {
        const list = filtered.filter((recipe) => recipe.mealType === type);
        return { type, total: list.length, recipes: list.slice(0, 4) };
      }).filter((section) => section.recipes.length > 0),
    [filtered]
  );

  const featuredVisible = useMemo(
    () =>
      featured
        .filter((recipe) => meal === "all" || recipe.mealType === meal)
        .slice(0, 10),
    [featured, meal]
  );

  const surprise = () => {
    const pool = filtered.slice(0, Math.min(8, filtered.length));
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

      {filtersActive && (
        <div className="row" style={{ justifyContent: "space-between", margin: "2px 2px 0" }}>
          <span className="tiny faint">
            {filtered.length} {filtered.length === 1 ? "meal" : "meals"} match
          </span>
          <button className="ghost-btn" style={{ padding: "2px 4px" }} onClick={resetFilters}>
            Clear filters
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
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
            {filtered.slice(0, 24).map((recipe) => (
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
        <h2>Fresh from the web</h2>
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
            {featured.length > 0
              ? "No web recipes for that meal type in the current batch — refresh for another handful."
              : "No internet, no problem — your saved recipes still work. Featured ideas appear here when you're back online."}
          </p>
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
        Featured recipes come from TheMealDB. Matches use your pantry, swaps and food that needs
        eating first.
      </p>
    </div>
  );
}
