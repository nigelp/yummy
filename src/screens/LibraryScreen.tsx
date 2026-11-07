import { useMemo, useState } from "react";
import { useApp } from "../state/store";
import type { MatchResult, Recipe } from "../core/types";
import { Icon } from "../components/Icon";
import { RecipeTile } from "../components/RecipeCard";
import { Chip, EmptyState } from "../components/UI";
import { relativeDay } from "../lib/format";

type Filter = "all" | "favourites" | "cooked" | "web" | "photo";

export function LibraryScreen({
  matches,
  onOpen,
  onCapture,
}: {
  matches: Record<string, MatchResult>;
  onOpen: (recipe: Recipe) => void;
  onCapture: () => void;
}) {
  const recipes = useApp((s) => s.recipes);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const cooked = useMemo(
    () =>
      recipes
        .filter((recipe) => recipe.lastCooked)
        .sort(
          (a, b) =>
            new Date(b.lastCooked ?? 0).getTime() - new Date(a.lastCooked ?? 0).getTime()
        ),
    [recipes]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipes
      .filter((recipe) => {
        if (filter === "favourites" && !recipe.favorite) return false;
        if (filter === "cooked" && !recipe.cookCount) return false;
        if (filter === "web" && !(recipe.source === "web" || recipe.source === "featured")) return false;
        if (filter === "photo" && recipe.source !== "photo") return false;
        if (!needle) return true;
        return (
          recipe.title.toLowerCase().includes(needle) ||
          recipe.tags.some((tag) => tag.includes(needle)) ||
          recipe.ingredients.some((ingredient) => ingredient.item.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => {
        if (filter === "cooked") return (b.cookCount ?? 0) - (a.cookCount ?? 0);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [recipes, filter, query]);

  const totalCooks = recipes.reduce((sum, recipe) => sum + recipe.cookCount, 0);

  return (
    <div className="screen">
      <div className="screen-head">
        <div className="grow">
          <p className="eyebrow">your collection</p>
          <h1 className="title-xl" style={{ marginTop: 4 }}>
            Library
          </h1>
        </div>
        <button className="icon-btn" onClick={onCapture} aria-label="Add a recipe">
          <Icon name="plus" size={20} />
        </button>
      </div>

      <div className="library-stats">
        <div>
          <strong>{recipes.length}</strong>
          <span>recipes</span>
        </div>
        <div>
          <strong>{recipes.filter((r) => r.favorite).length}</strong>
          <span>favourites</span>
        </div>
        <div>
          <strong>{totalCooks}</strong>
          <span>cooks logged</span>
        </div>
      </div>

      <div className="search-wrap" style={{ marginTop: 12 }}>
        <Icon name="search" size={17} />
        <input
          className="input"
          placeholder="Search titles, tags or ingredients…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="chip-row" style={{ marginTop: 10 }}>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        <Chip active={filter === "favourites"} onClick={() => setFilter("favourites")}>♥ Favourites</Chip>
        <Chip active={filter === "cooked"} onClick={() => setFilter("cooked")}>Cooked</Chip>
        <Chip active={filter === "web"} onClick={() => setFilter("web")}>Saved from web</Chip>
        <Chip active={filter === "photo"} onClick={() => setFilter("photo")}>Photos</Chip>
      </div>

      {cooked.length > 0 && filter === "all" && !query && (
        <>
          <div className="section-head">
            <h2>Cook again</h2>
            <span className="tiny faint">recent favourites</span>
          </div>
          <div className="rail">
            {cooked.slice(0, 4).map((recipe) => (
              <button
                key={recipe.id}
                className="recent-card pressable"
                onClick={() => onOpen(recipe)}
              >
                <div className="row gap-8">
                  <span style={{ fontSize: 20 }}>{recipe.emoji}</span>
                  <div className="grow" style={{ textAlign: "left" }}>
                    <strong>{recipe.title}</strong>
                    <span className="tiny faint" style={{ display: "block" }}>
                      cooked {recipe.cookCount}× · {relativeDay(recipe.lastCooked)}
                    </span>
                  </div>
                </div>
                <Icon name="arrowRight" size={15} />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>{filter === "all" ? "Everything you've saved" : "Filtered"}</h2>
        <span className="tiny faint">{filtered.length}</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          emoji="📖"
          title={query ? "No matches in the library" : "Your library is feeling light"}
          body={
            query
              ? "Try a shorter word, or search for an ingredient like “lemon”."
              : "Share a recipe page from Chrome, snap a cookbook, or type one in. It all lives here, offline."
          }
          action={
            <button className="primary-btn" style={{ width: "auto", padding: "12px 18px" }} onClick={onCapture}>
              <Icon name="plus" size={16} /> Add a recipe
            </button>
          }
        />
      ) : (
        <div className="grid-grid">
          {filtered.map((recipe) => (
            <RecipeTile
              key={recipe.id}
              recipe={recipe}
              match={matches[recipe.id]}
              onClick={() => onOpen(recipe)}
            />
          ))}
          <button className="add-tile" onClick={onCapture}>
            <span className="plus-bubble">
              <Icon name="plus" size={22} />
            </span>
            <strong>Add a recipe</strong>
            <span className="tiny faint">link · photo · by hand</span>
          </button>
        </div>
      )}

      <p className="tiny faint center" style={{ marginTop: 24, lineHeight: 1.5 }}>
        Everything is stored on this phone. No account, no cloud, no snooping.
      </p>
    </div>
  );
}
