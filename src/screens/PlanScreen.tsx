import { useMemo, useState } from "react";
import { useApp } from "../state/store";
import type { MatchResult, Recipe } from "../core/types";
import { Icon } from "../components/Icon";
import { Art } from "../components/Art";
import { EmptyState, Sheet, SheetHead, ScorePill } from "../components/UI";
import { formatTime, todayKey, weekDays } from "../lib/format";

export function PlanScreen({
  matches,
  onOpen,
}: {
  matches: Record<string, MatchResult>;
  onOpen: (recipe: Recipe) => void;
}) {
  const plan = useApp((s) => s.plan);
  const recipes = useApp((s) => s.recipes);
  const planRecipe = useApp((s) => s.planRecipe);
  const unplanRecipe = useApp((s) => s.unplanRecipe);
  const addMissing = useApp((s) => s.addMissingToShopping);
  const setToast = useApp((s) => s.setToast);

  const [selected, setSelected] = useState(todayKey());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const week = weekDays(7);
  const dayRecipes = (plan[selected] ?? [])
    .map((id) => recipes.find((recipe) => recipe.id === id))
    .filter((recipe): recipe is Recipe => !!recipe);

  const plannedIds = useMemo(() => Array.from(new Set(Object.values(plan).flat())), [plan]);
  const missingTotal = plannedIds.reduce(
    (sum, id) => sum + (matches[id]?.missing.length ?? 0),
    0
  );
  const plannedRecipes = plannedIds
    .map((id) => recipes.find((recipe) => recipe.id === id))
    .filter((recipe): recipe is Recipe => !!recipe);

  const pickable = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...recipes, ...[]]
      .filter((recipe) => !needle || recipe.title.toLowerCase().includes(needle))
      .sort(
        (a, b) =>
          (matches[b.id]?.score ?? 0) - (matches[a.id]?.score ?? 0) ||
          a.title.localeCompare(b.title)
      );
  }, [recipes, query, matches]);

  const buildWeekList = () => {
    if (!plannedRecipes.length) return;
    let added = 0;
    for (const recipe of plannedRecipes) {
      const match = matches[recipe.id];
      if (!match || match.missing.length === 0) continue;
      addMissing(recipe, match.missing);
      added += match.missing.length;
    }
    setToast(
      added === 0
        ? "Your pantry already covers the whole week"
        : `${added} item${added === 1 ? "" : "s"} for the week ${added === 1 ? "is" : "are"} on your list`
    );
  };

  return (
    <div className="screen">
      <div className="screen-head">
        <div className="grow">
          <p className="eyebrow">{plannedIds.length ? `${plannedIds.length} meals planned` : "a calm week ahead"}</p>
          <h1 className="title-xl" style={{ marginTop: 4 }}>
            Meal plan
          </h1>
        </div>
        {plannedIds.length > 0 && (
          <button
            className="icon-btn"
            aria-label="Clear plan"
            onClick={() => {
              if (window.confirm("Clear the whole week?")) {
                useApp.setState({ plan: {} });
                setToast("Week cleared");
              }
            }}
          >
            <Icon name="trash" size={18} />
          </button>
        )}
      </div>

      <div className="week-strip">
        {week.map((day) => {
          const count = (plan[day.key] ?? []).length;
          return (
            <button
              key={day.key}
              className={`week-day ${selected === day.key ? "on" : ""} ${day.isToday ? "today" : ""}`}
              onClick={() => setSelected(day.key)}
            >
              <span className="dow">{day.dow}</span>
              <span className="num">{day.num}</span>
              <span className={`pip ${count ? "filled" : ""}`} />
            </button>
          );
        })}
      </div>

      <div className="section-head">
        <h2>{week.find((day) => day.key === selected)?.label ?? "That day"}</h2>
        <button className="link" onClick={() => setPickerOpen(true)}>
          + add meal
        </button>
      </div>

      {dayRecipes.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="🗓"
            title="Nothing planned yet"
            body="Drop a recipe in — we'll work out what you need to buy, aisle by aisle."
            action={
              <button className="primary-btn" style={{ width: "auto", padding: "12px 18px" }} onClick={() => setPickerOpen(true)}>
                <Icon name="plus" size={16} /> Choose a recipe
              </button>
            }
          />
        </div>
      ) : (
        <div className="stack gap-10">
          {dayRecipes.map((recipe) => (
            <div key={recipe.id} className="plan-meal">
              <button className="plan-meal-main" onClick={() => onOpen(recipe)}>
                <Art
                  art={recipe.art}
                  emoji={recipe.emoji}
                  image={recipe.image}
                  style={{ width: 58, height: 58, borderRadius: 16, flex: "none" }}
                />
                <div className="grow" style={{ minWidth: 0, textAlign: "left" }}>
                  <strong>{recipe.title}</strong>
                  <span className="tiny faint" style={{ display: "block" }}>
                    {formatTime(recipe.timeMin)} · serves {recipe.servings}
                  </span>
                </div>
                {matches[recipe.id] && (
                  <ScorePill
                    score={matches[recipe.id].score}
                    have={matches[recipe.id].have}
                    total={matches[recipe.id].total}
                  />
                )}
              </button>
              <button
                className="icon-btn plain"
                onClick={() => unplanRecipe(selected, recipe.id)}
                aria-label="Remove from plan"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="week-list-card">
        <div className="row gap-10">
          <span style={{ fontSize: 26 }}>🧺</span>
          <div className="grow">
            <strong>Shop for the week</strong>
            <p className="tiny muted" style={{ marginTop: 2 }}>
              {plannedIds.length === 0
                ? "Plan a meal or two and we'll gather what's missing."
                : missingTotal === 0
                  ? "Your pantry already covers everything planned."
                  : `${missingTotal} missing ingredients across ${plannedIds.length} meals.`}
            </p>
          </div>
        </div>
        <button
          className="primary-btn"
          style={{ marginTop: 12 }}
          disabled={plannedIds.length === 0}
          onClick={buildWeekList}
        >
          <Icon name="list" size={16} /> Build shopping list
        </button>
      </div>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <SheetHead
          title={`Add to ${week.find((day) => day.key === selected)?.dow ?? "the plan"}`}
          subtitle="Sorted by how ready they are"
          onClose={() => setPickerOpen(false)}
        />
        <input
          className="input"
          placeholder="Search your library…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="stack gap-10" style={{ marginTop: 14 }}>
          {pickable.map((recipe) => (
            <button
              key={recipe.id}
              className="plan-pick-row"
              onClick={() => {
                planRecipe(selected, recipe.id);
                setPickerOpen(false);
                setQuery("");
                setToast(`Added to ${week.find((day) => day.key === selected)?.dow}`);
              }}
            >
              <Art
                art={recipe.art}
                emoji={recipe.emoji}
                image={recipe.image}
                style={{ width: 46, height: 46, borderRadius: 13, flex: "none" }}
              />
              <div className="grow" style={{ textAlign: "left" }}>
                <strong>{recipe.title}</strong>
                <span className="tiny faint" style={{ display: "block" }}>
                  {formatTime(recipe.timeMin)}
                </span>
              </div>
              {matches[recipe.id] && (
                <ScorePill
                  score={matches[recipe.id].score}
                  have={matches[recipe.id].have}
                  total={matches[recipe.id].total}
                />
              )}
            </button>
          ))}
          {pickable.length === 0 && (
            <p className="small muted center" style={{ padding: 20 }}>
              No recipes match that search.
            </p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
