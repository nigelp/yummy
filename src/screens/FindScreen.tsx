import { useMemo, useRef, useState, type FormEvent } from "react";
import { catalogById, catalogItems } from "../data/catalog";
import type { FindMode, MatchResult, MealType, Recipe } from "../core/types";
import { useApp } from "../state/store";
import { Icon } from "../components/Icon";
import { RecipeCard } from "../components/RecipeCard";
import { Chip, EmptyState, Segmented } from "../components/UI";
import { FILTER_TAGS, MEAL_LABELS, tagLabel } from "../lib/classify";

const MEAL_TAGS: MealType[] = ["breakfast", "lunch", "dinner", "dessert", "snack"];
const MEAL_SET = new Set<string>(MEAL_TAGS);
const STYLE_TAGS = [...FILTER_TAGS];
const STYLE_SET = new Set<string>(STYLE_TAGS);

const QUICK_ADDS = [
  "egg",
  "milk",
  "butter",
  "pasta",
  "rice",
  "onion",
  "garlic",
  "tomato",
  "cheese",
  "chicken_breast",
];

const STYLE_EMOJI: Record<string, string> = {
  quick: "⚡",
  vegetarian: "🥬",
  vegan: "🌱",
  "gluten-free": "🌾",
  "low-carb": "🥑",
  "high-protein": "💪",
  soup: "🍲",
  pasta: "🍝",
  fish: "🐟",
  meaty: "🥩",
  hearty: "🥘",
  "one-pan": "🍳",
};

function labelFor(tag: string): string {
  if (MEAL_SET.has(tag)) return MEAL_LABELS[tag as MealType].label;
  return tagLabel(tag);
}

function emojiFor(tag: string): string {
  if (MEAL_SET.has(tag)) return MEAL_LABELS[tag as MealType].emoji;
  return catalogById.get(tag)?.emoji ?? STYLE_EMOJI[tag] ?? "🍽️";
}

export function FindScreen({
  matches,
  mode,
  onModeChange,
  query,
  onQueryChange,
  selected,
  onSelectedChange,
  onOpen,
  onSettings,
  onManagePantry,
  onOpenDiscover,
  onOpenLibrary,
}: {
  matches: Record<string, MatchResult>;
  mode: FindMode;
  onModeChange: (mode: FindMode) => void;
  query: string;
  onQueryChange: (query: string) => void;
  selected: string[];
  onSelectedChange: (tags: string[]) => void;
  onOpen: (recipe: Recipe) => void;
  onSettings: () => void;
  onManagePantry: () => void;
  onOpenDiscover: () => void;
  onOpenLibrary: () => void;
}) {
  const recipes = useApp((s) => s.recipes);
  const pantry = useApp((s) => s.pantry);
  const customPantry = useApp((s) => s.customPantry);
  const togglePantry = useApp((s) => s.togglePantry);

  const [expandedTags, setExpandedTags] = useState(false);
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const needle = query.trim().toLowerCase();
  const tokens = useMemo(
    () => needle.split(/[^a-z0-9]+/).filter((token) => token.length > 1),
    [needle]
  );
  const filtersActive = selected.length > 0 || needle.length > 0;
  const pantryCount = Object.keys(pantry).length;

  const textMatches = (recipe: Recipe): boolean => {
    if (tokens.length === 0) return true;
    const mealLabel = recipe.mealType ? MEAL_LABELS[recipe.mealType].label : "";
    const haystack = [
      recipe.title,
      recipe.description,
      mealLabel,
      ...recipe.tags,
      ...recipe.tags.map((tag) => tagLabel(tag)),
      ...recipe.ingredients.map((ingredient) => `${ingredient.item} ${ingredient.raw}`),
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  };

  const styleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of STYLE_TAGS) counts.set(tag, 0);
    for (const recipe of recipes) {
      for (const tag of STYLE_TAGS) {
        if (recipe.tags.includes(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [recipes]);

  const ingredientTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const recipe of recipes) {
      for (const tag of recipe.tags) {
        if (STYLE_SET.has(tag)) continue;
        const definition = catalogById.get(tag);
        if (!definition || definition.staple) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || tagLabel(a[0]).localeCompare(tagLabel(b[0]))
    );
  }, [recipes]);

  const selectedMeals = useMemo(
    () => selected.filter((tag): tag is MealType => MEAL_SET.has(tag)),
    [selected]
  );
  const selectedOther = useMemo(
    () => selected.filter((tag) => !MEAL_SET.has(tag)),
    [selected]
  );

  const filtered = useMemo(() => {
    let list = recipes.filter((recipe) => {
      // Several meal tags mean "breakfast OR dinner"; other tags narrow the set.
      const mealOk =
        selectedMeals.length === 0 ||
        (!!recipe.mealType && selectedMeals.includes(recipe.mealType));
      return (
        mealOk &&
        selectedOther.every((tag) => recipe.tags.includes(tag)) &&
        textMatches(recipe)
      );
    });
    if (mode === "ingredients" && pantryCount > 0 && !showAllIngredients) {
      list = list.filter((recipe) => (matches[recipe.id]?.coreHave ?? 0) > 0);
    }
    return list.sort(
      (a, b) =>
        (matches[b.id]?.score ?? 0) - (matches[a.id]?.score ?? 0) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    // textMatches closes over the current query tokens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    recipes,
    matches,
    mode,
    selectedMeals,
    selectedOther,
    tokens,
    pantryCount,
    showAllIngredients,
  ]);

  const recent = useMemo(
    () =>
      [...recipes]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 3),
    [recipes]
  );

  const tagSuggestions = useMemo(() => {
    if (mode !== "tags" || needle.length < 2) return [];
    const all = [
      ...MEAL_TAGS,
      ...STYLE_TAGS,
      ...ingredientTags.map(([tag]) => tag),
    ];
    return all
      .filter(
        (tag) => !selected.includes(tag) && labelFor(tag).toLowerCase().includes(needle)
      )
      .slice(0, 4);
  }, [mode, needle, selected, ingredientTags]);

  const selectedPantry = useMemo(
    () =>
      Object.values(pantry)
        .map((entry) => ({
          entry,
          definition:
            catalogById.get(entry.id) ??
            customPantry.find((item) => item.id === entry.id),
        }))
        .slice(0, 8),
    [pantry, customPantry]
  );

  const quickAdds = useMemo(
    () =>
      QUICK_ADDS.map((id) => catalogById.get(id)).filter(
        (item): item is NonNullable<typeof item> => !!item
      ),
    []
  );

  const catalogHits = useMemo(() => {
    if (mode !== "ingredients" || needle.length < 2) return [];
    return catalogItems
      .filter((item) => !pantry[item.id])
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          (item.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle))
      )
      .slice(0, 6);
  }, [mode, needle, pantry]);

  const toggle = (tag: string) => {
    onSelectedChange(
      selected.includes(tag)
        ? selected.filter((item) => item !== tag)
        : [...selected, tag]
    );
  };

  const clearFilters = () => {
    onSelectedChange([]);
    onQueryChange("");
    setShowAllIngredients(false);
  };

  const changeMode = (next: FindMode) => {
    onModeChange(next);
    onSelectedChange([]);
    onQueryChange("");
    setExpandedTags(false);
    setShowAllIngredients(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const visibleIngredientTags = expandedTags
    ? ingredientTags
    : ingredientTags.slice(0, 16);
  const extraSelected = selected.filter(
    (tag) =>
      catalogById.has(tag) &&
      !STYLE_SET.has(tag) &&
      !visibleIngredientTags.some(([visible]) => visible === tag)
  );
  const shownIngredientTags = [
    ...visibleIngredientTags,
    ...extraSelected.map((tag) => [tag, 0] as [string, number]),
  ];

  const tagGroups = (
    <>
      <div className="tag-group">
        <span className="eyebrow">meal</span>
        <div className="row wrap gap-6">
          {MEAL_TAGS.map((meal) => (
            <Chip
              key={meal}
              active={selected.includes(meal)}
              soft={!selected.includes(meal)}
              onClick={() => toggle(meal)}
            >
              <span>{MEAL_LABELS[meal].emoji}</span> {MEAL_LABELS[meal].label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="tag-group">
        <span className="eyebrow">style &amp; diet</span>
        <div className="row wrap gap-6">
          {STYLE_TAGS.map((tag) => {
            const count = styleCounts.get(tag) ?? 0;
            return (
              <Chip
                key={tag}
                active={selected.includes(tag)}
                soft={!selected.includes(tag)}
                onClick={() => toggle(tag)}
                title={`${tagLabel(tag)} · ${count} ${count === 1 ? "recipe" : "recipes"}`}
              >
                {tagLabel(tag)}
                {count > 0 && <span className="chip-count">{count}</span>}
              </Chip>
            );
          })}
        </div>
      </div>

      {ingredientTags.length > 0 && (
        <div className="tag-group">
          <span className="eyebrow">ingredients in your recipes</span>
          <div className="row wrap gap-6">
            {shownIngredientTags.map(([tag, count]) => (
              <Chip
                key={tag}
                active={selected.includes(tag)}
                soft={!selected.includes(tag)}
                onClick={() => toggle(tag)}
                title={
                  count > 0
                    ? `${tagLabel(tag)} · ${count} ${count === 1 ? "recipe" : "recipes"}`
                    : tagLabel(tag)
                }
              >
                <span>{emojiFor(tag)}</span> {labelFor(tag)}
                {count > 0 && <span className="chip-count">{count}</span>}
              </Chip>
            ))}
            {ingredientTags.length > 16 && (
              <button
                className="chip ghost"
                onClick={() => setExpandedTags((value) => !value)}
              >
                {expandedTags ? "fewer" : `+${ingredientTags.length - 16} more`}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );

  const webHandoff = (
    <button className="find-manage" onClick={onOpenDiscover} style={{ marginTop: 16 }}>
      <span className="mini-bubble" style={{ background: "var(--lilac-soft)" }}>
        ✨
      </span>
      <span className="grow">
        <strong>Search the web for this</strong>
        <span>
          {filtersActive
            ? "Take these search terms and filters to Discover"
            : "Browse recipes from TheMealDB in Discover"}
        </span>
      </span>
      <Icon name="arrowRight" size={16} className="faint" />
    </button>
  );

  return (
    <div className="screen find-screen">
      <div className="screen-head">
        <div className="brand">
          yummy<span className="dot" />
        </div>
        <div className="grow" />
        <button className="icon-btn" onClick={onSettings} aria-label="Settings">
          <Icon name="settings" size={19} />
        </button>
      </div>

      <div className="find-hero">
        <p className="eyebrow">find something good</p>
        <h1 className="title-xl" style={{ marginTop: 6, maxWidth: 300 }}>
          What are we cooking?
        </h1>
        <p className="sub" style={{ marginTop: 7, maxWidth: 300 }}>
          Search your recipes by name, tag or ingredient — or tap a few tags below.
        </p>
      </div>

      <div className="find-controls">
        <Segmented
          value={mode}
          options={[
            { value: "tags", label: "Tags" },
            { value: "ingredients", label: "Ingredients" },
          ]}
          onChange={changeMode}
        />

        <form className="find-search" onSubmit={submit}>
          <div className="search-wrap">
            <Icon name="search" size={17} />
            <input
              className="input"
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              placeholder={
                mode === "tags"
                  ? "Search your recipes, or type a tag…"
                  : "Add an ingredient, or search recipes…"
              }
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="icon-btn plain clear-search"
                onClick={() => onQueryChange("")}
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

        {mode === "tags" && tagSuggestions.length > 0 && (
          <div className="row wrap gap-6 find-suggest">
            {tagSuggestions.map((tag) => (
              <Chip
                key={tag}
                soft
                onClick={() => {
                  toggle(tag);
                  onQueryChange("");
                }}
              >
                <Icon name="plus" size={11} /> {labelFor(tag)}
              </Chip>
            ))}
          </div>
        )}

        {mode === "ingredients" && catalogHits.length > 0 && (
          <div className="row wrap gap-6 find-suggest">
            {catalogHits.map((item) => (
              <Chip
                key={item.id}
                soft
                onClick={() => {
                  togglePantry(item.id, item.name);
                  onQueryChange("");
                }}
              >
                <Icon name="plus" size={11} /> <span>{item.emoji}</span> {item.name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {mode === "tags" ? (
        <>
          {filtersActive && (
            <div className="find-selected">
              <span className="eyebrow">searching for</span>
              <div className="row wrap gap-6" style={{ marginTop: 6 }}>
                {query.trim() && (
                  <button className="chip soft on" onClick={() => onQueryChange("")}>
                    “{query.trim()}”
                    <Icon name="close" size={10} strokeWidth={2.4} />
                  </button>
                )}
                {selected.map((tag) => (
                  <button key={tag} className="chip soft on" onClick={() => toggle(tag)}>
                    <span>{emojiFor(tag)}</span> {labelFor(tag)}
                    <Icon name="close" size={10} strokeWidth={2.4} />
                  </button>
                ))}
                <button className="chip ghost" onClick={clearFilters}>
                  clear all
                </button>
              </div>
            </div>
          )}

          {filtersActive && (
            <button
              className="find-see-results"
              onClick={() =>
                resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <Icon name="arrowRight" size={13} />
              See {filtered.length} {filtered.length === 1 ? "result" : "results"}
            </button>
          )}

          {tagGroups}

          {filtersActive ? (
            <>
              <div className="find-results" ref={resultsRef}>
                <div className="section-head">
                  <h2>Matches</h2>
                  <span className="tiny faint">{filtered.length}</span>
                </div>

                {filtered.length === 0 ? (
                  <EmptyState
                    emoji="🔍"
                    title="No saved recipes match that"
                    body="Try fewer tags, or take these filters to Discover to search recipes from the web."
                    action={
                      <div
                        className="row gap-8"
                        style={{ flexWrap: "wrap", justifyContent: "center" }}
                      >
                        <button
                          className="primary-btn"
                          style={{ width: "auto", padding: "11px 16px" }}
                          onClick={onOpenDiscover}
                        >
                          <Icon name="sparkle" size={15} /> Search the web
                        </button>
                        <button
                          className="secondary-btn"
                          style={{ width: "auto", padding: "11px 16px" }}
                          onClick={clearFilters}
                        >
                          Clear filters
                        </button>
                      </div>
                    }
                  />
                ) : (
                  <div className="find-list">
                    {filtered.map((recipe) => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        match={matches[recipe.id]}
                        onClick={() => onOpen(recipe)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {webHandoff}
            </>
          ) : (
            <>
              <div className="section-head" style={{ marginTop: 18 }}>
                <h2>Your library</h2>
                <button className="link" onClick={onOpenLibrary}>
                  browse all {recipes.length}
                </button>
              </div>

              {recent.length === 0 ? (
                <EmptyState
                  emoji="📖"
                  title="Your library is empty"
                  body="Add a recipe by link, photo or hand — then search it here."
                  action={
                    <button
                      className="primary-btn"
                      style={{ width: "auto", padding: "11px 16px" }}
                      onClick={onOpenLibrary}
                    >
                      Open the library
                    </button>
                  }
                />
              ) : (
                <div className="find-list">
                  {recent.map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      match={matches[recipe.id]}
                      onClick={() => onOpen(recipe)}
                    />
                  ))}
                </div>
              )}

              {webHandoff}
            </>
          )}
        </>
      ) : (
        <>
          <div className="tag-group">
            <span className="eyebrow">quick add the basics</span>
            <div className="row wrap gap-6">
              {quickAdds.map((item) => {
                const on = !!pantry[item.id];
                return (
                  <button
                    key={item.id}
                    className={`chip ${on ? "soft on" : ""}`}
                    onClick={() => togglePantry(item.id, item.name)}
                  >
                    <span>{item.emoji}</span> {item.name}
                    {!on && <Icon name="plus" size={10} />}
                  </button>
                );
              })}
            </div>
          </div>

          {pantryCount > 0 && (
            <div className="tag-group">
              <span className="eyebrow">in your kitchen</span>
              <div className="row wrap gap-6">
                {selectedPantry.map(({ entry, definition }) => (
                  <button
                    key={entry.id}
                    className="chip soft on"
                    onClick={() => togglePantry(entry.id, definition?.name ?? entry.name)}
                    title={`Remove ${definition?.name ?? entry.name}`}
                  >
                    <span>{definition?.emoji ?? "🥫"}</span>
                    {definition?.name ?? entry.name}
                    <Icon name="close" size={10} strokeWidth={2.4} />
                  </button>
                ))}
                {pantryCount > selectedPantry.length && (
                  <button className="chip ghost" onClick={onManagePantry}>
                    +{pantryCount - selectedPantry.length} more
                  </button>
                )}
              </div>
            </div>
          )}

          <button className="find-manage" onClick={onManagePantry} style={{ marginTop: 12 }}>
            <span className="mini-bubble">🧺</span>
            <span className="grow">
              <strong>{pantryCount > 0 ? "Manage your pantry" : "Open your pantry"}</strong>
              <span>
                {pantryCount > 0
                  ? "Quantities, use-by dates and your own ingredients"
                  : "Add what you have for honest matches"}
              </span>
            </span>
            <Icon name="chevronRight" size={16} className="faint" />
          </button>

          <div className="find-results" ref={resultsRef}>
            <div className="section-head" style={{ marginTop: 18 }}>
              <h2>
                {pantryCount > 0 ? "Ready from your kitchen" : "Recipes"}
              </h2>
              <span className="tiny faint">
                {filtered.length}
                {pantryCount > 0 && !showAllIngredients ? " matched" : ""}
              </span>
            </div>

            {pantryCount > 0 && (
              <div
                className="row"
                style={{ justifyContent: "flex-end", margin: "0 2px 6px" }}
              >
                <button
                  className="ghost-btn"
                  style={{ padding: "2px 4px" }}
                  onClick={() => setShowAllIngredients((value) => !value)}
                >
                  {showAllIngredients ? "Only my ingredients" : "Show everything"}
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <EmptyState
                emoji="🧺"
                title="Nothing uses those ingredients yet"
                body="Add another ingredient or two, or show everything in your library."
                action={
                  <div
                    className="row gap-8"
                    style={{ flexWrap: "wrap", justifyContent: "center" }}
                  >
                    <button
                      className="primary-btn"
                      style={{ width: "auto", padding: "11px 16px" }}
                      onClick={() => setShowAllIngredients(true)}
                    >
                      Show everything
                    </button>
                    <button
                      className="secondary-btn"
                      style={{ width: "auto", padding: "11px 16px" }}
                      onClick={onOpenDiscover}
                    >
                      <Icon name="sparkle" size={15} /> Search the web
                    </button>
                  </div>
                }
              />
            ) : (
              <div className="find-list">
                {filtered.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    match={matches[recipe.id]}
                    onClick={() => onOpen(recipe)}
                  />
                ))}
              </div>
            )}
          </div>

          {webHandoff}
        </>
      )}

      <p className="tiny faint center" style={{ marginTop: 22, lineHeight: 1.5 }}>
        {pantryCount > 0
          ? `${pantryCount} ${pantryCount === 1 ? "ingredient" : "ingredients"} in your kitchen · everything stays on this phone`
          : "No account, no cloud — your recipes and pantry stay on this phone."}
      </p>
    </div>
  );
}
