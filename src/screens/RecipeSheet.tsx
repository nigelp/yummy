import { useEffect, useMemo, useRef, useState } from "react";
import { scale } from "../core/api";
import type { MatchResult, Recipe, ScaleResult } from "../core/types";
import { useApp } from "../state/store";
import { Icon } from "../components/Icon";
import { Art } from "../components/Art";
import { Sheet, SheetHead, ScoreRing, Segmented, Stepper } from "../components/UI";
import { formatTime, relativeDay, weekDays } from "../lib/format";
import { fileToRecipePhoto } from "../lib/photo";

export function RecipeSheet({
  recipe,
  match,
  onClose,
  onCook,
  onPlanDone,
}: {
  recipe: Recipe;
  match?: MatchResult;
  onClose: () => void;
  onCook: (recipe: Recipe) => void;
  onPlanDone: () => void;
}) {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const addMissing = useApp((s) => s.addMissingToShopping);
  const addNote = useApp((s) => s.addNote);
  const deleteRecipe = useApp((s) => s.deleteRecipe);
  const saveFeatured = useApp((s) => s.saveFeatured);
  const updateRecipe = useApp((s) => s.updateRecipe);
  const planRecipe = useApp((s) => s.planRecipe);
  const setToast = useApp((s) => s.setToast);

  const [servings, setServings] = useState(recipe.servings);
  const [scaled, setScaled] = useState<ScaleResult | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setServings(recipe.servings);
    setChecked(new Set());
    setScaled(null);
  }, [recipe.id]);

  useEffect(() => {
    let alive = true;
    scale(recipe, servings, settings.system)
      .then((result) => {
        if (alive) setScaled(result);
      })
      .catch(() => {
        if (alive) setScaled(null);
      });
    return () => {
      alive = false;
    };
  }, [recipe, servings, settings.system]);

  const isSaved = recipe.source !== "featured";
  const notes = useMemo(() => recipe.notes ?? [], [recipe.notes]);
  const missing = match?.missing ?? [];
  const days = weekDays(7);

  const changePhoto = async (file?: File) => {
    if (!file) return;
    setToast("Preparing your photo…");
    try {
      const image = await fileToRecipePhoto(file);
      updateRecipe(recipe.id, { image });
      setToast("Recipe photo updated");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not use that photo");
    } finally {
      if (photoInput.current) photoInput.current.value = "";
    }
  };

  const addAllMissing = () => {
    if (missing.length === 0) {
      setToast("Your pantry already covers this one");
      return;
    }
    addMissing(recipe, missing);
  };

  return (
    <Sheet open onClose={onClose} full label={recipe.title}>
      <div className="recipe-hero">
        <Art art={recipe.art} emoji={recipe.emoji} image={recipe.image} />
        <div className="recipe-hero-actions">
          <button className="icon-btn glass" onClick={onClose} aria-label="Back">
            <Icon name="chevronLeft" size={20} />
          </button>
          <div className="grow" />
          {isSaved && (
            <button
              className="icon-btn glass"
              onClick={() => photoInput.current?.click()}
              aria-label="Add or change recipe photo"
            >
              <Icon name="camera" size={18} />
            </button>
          )}
          {isSaved && (
            <button
              className={`icon-btn glass ${recipe.favorite ? "liked" : ""}`}
              onClick={() => toggleFavorite(recipe.id)}
              aria-label="Favourite"
            >
              <Icon name="heart" size={18} fill={recipe.favorite} />
            </button>
          )}
          <button
            className="icon-btn glass"
            onClick={() => {
              const text = `${recipe.title} — ${recipe.sourceUrl ?? "saved in Yummy"}`;
              if (navigator.share) void navigator.share({ title: recipe.title, text });
              else {
                void navigator.clipboard?.writeText(text);
                setToast("Link copied");
              }
            }}
            aria-label="Share recipe"
          >
            <Icon name="share" size={18} />
          </button>
        </div>
      </div>

      {isSaved && (
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => void changePhoto(event.target.files?.[0])}
        />
      )}

      <div className="recipe-body">
        <p className="eyebrow">
          {[recipe.cuisine, ...recipe.tags.slice(0, 2)].filter(Boolean).join(" · ") || "home cooking"}
        </p>
        <h1 className="title-xl" style={{ marginTop: 5 }}>
          {recipe.title}
        </h1>
        {recipe.description && (
          <p className="sub" style={{ marginTop: 8 }}>
            {recipe.description}
          </p>
        )}
        <div className="meta" style={{ marginTop: 11, gap: 13 }}>
          {recipe.timeMin ? (
            <span>
              <Icon name="clock" size={14} /> {formatTime(recipe.timeMin)}
            </span>
          ) : null}
          <span>
            <Icon name="users" size={14} /> serves {recipe.servings}
          </span>
          {recipe.cookCount > 0 && (
            <span>
              <Icon name="spoon" size={14} /> cooked {recipe.cookCount}×
            </span>
          )}
        </div>

        {recipe.warnings && recipe.warnings.length > 0 && (
          <div className="warn-card">
            <Icon name="sparkle" size={15} />
            <div>
              {recipe.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        )}

        {match && (
          <div className="match-card">
            <ScoreRing score={match.score} size={48} />
            <div className="grow">
              <strong className="match-title">
                {match.score >= 100
                  ? "You can cook this right now"
                  : match.score >= 60
                    ? `Almost there — ${missing.length} to find`
                    : `${missing.length} ingredients to pick up`}
              </strong>
              <p className="tiny muted" style={{ marginTop: 2 }}>
                {match.have} of {match.total} ingredients in your kitchen
                {match.expiringUsed.length > 0 ? " · uses food that needs eating" : ""}
              </p>
              {missing.length > 0 && (
                <div className="stack gap-6" style={{ marginTop: 9 }}>
                  {missing.slice(0, 4).map((item) => (
                    <div key={`${item.canonicalId}-${item.item}`} className="missing-line">
                      <span className="missing-dot" />
                      <span>
                        {item.qtyText ? `${item.qtyText} ` : ""}
                        {item.item}
                        {item.sub && (
                          <em style={{ display: "block", fontSize: 10.5, color: "#4f7a2a" }}>
                            swap in: {item.sub.text}
                          </em>
                        )}
                      </span>
                    </div>
                  ))}
                  {missing.length > 4 && (
                    <span className="tiny faint">+{missing.length - 4} more</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="ingredient-toolbar">
          <Stepper value={servings} onChange={setServings} min={1} max={20} />
          <Segmented
            value={settings.system}
            options={[
              { value: "metric", label: "g / ml" },
              { value: "imperial", label: "cups / oz" },
            ]}
            onChange={(system) => setSettings({ system })}
          />
        </div>

        <div className="section-head" style={{ marginTop: 18 }}>
          <h2>Ingredients</h2>
          <span className="tiny faint">
            scaled for {servings}
          </span>
        </div>
        <div className="card" style={{ padding: "4px 15px" }}>
          {!scaled &&
            recipe.ingredients.map((ingredient) => (
              <div key={ingredient.raw} className="ingredient-row">
                <div className="shimmer" style={{ height: 14, width: "70%" }} />
              </div>
            ))}
          {scaled?.ingredients.map((ingredient, index) => {
            const on = checked.has(index);
            return (
              <div
                key={`${ingredient.text}-${index}`}
                className={`ingredient-row ${on ? "on" : ""}`}
                onClick={() => {
                  const next = new Set(checked);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  setChecked(next);
                }}
                role="button"
              >
                <span className={`check-circle ${on ? "on" : ""}`}>
                  {on && <Icon name="check" size={12} strokeWidth={3} />}
                </span>
                <div className="grow">
                  <p className="name">{ingredient.text}</p>
                  {ingredient.optional && <span className="aside">optional</span>}
                </div>
              </div>
            );
          })}
        </div>

        {scaled?.notes.map((noteText) => (
          <p key={noteText} className="cook-note">
            <Icon name="sparkle" size={13} /> {noteText}
          </p>
        ))}

        <div className="section-head">
          <h2>Method</h2>
          <span className="tiny faint">
            {recipe.steps.length} {recipe.steps.length === 1 ? "step" : "steps"}
          </span>
        </div>
        <div className="card" style={{ padding: "14px 15px 4px" }}>
          {recipe.steps.map((step, index) => (
            <div className="step-row" key={`${index}-${step.slice(0, 12)}`}>
              <span className="step-num">{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>

        {isSaved && (
          <>
            <div className="section-head">
              <h2>Your notes</h2>
              <span className="tiny faint">{notes.length ? `${notes.length} saved` : "optional"}</span>
            </div>
            <div className="row gap-8">
              <input
                className="input"
                placeholder="Less sugar next time…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && note.trim()) {
                    addNote(recipe.id, note.trim());
                    setNote("");
                    setToast("Note saved");
                  }
                }}
              />
              <button
                className="icon-btn"
                onClick={() => {
                  if (!note.trim()) return;
                  addNote(recipe.id, note.trim());
                  setNote("");
                  setToast("Note saved");
                }}
                aria-label="Save note"
              >
                <Icon name="plus" size={18} />
              </button>
            </div>
            {notes.length > 0 && (
              <div className="stack gap-6" style={{ marginTop: 9 }}>
                {notes.map((entry) => (
                  <div key={entry.id} className="note-row">
                    <Icon name="pen" size={13} />
                    <div>
                      <p>{entry.text}</p>
                      <span className="tiny faint">{relativeDay(entry.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {recipe.sourceUrl && (
          <a
            className="source-link"
            href={recipe.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="link" size={14} /> Open the original recipe
          </a>
        )}

        {isSaved && (
          <button
            className="ghost-btn"
            style={{ marginTop: 16, color: "#9c4a38" }}
            onClick={() => {
              if (window.confirm(`Remove “${recipe.title}” from your library?`)) {
                deleteRecipe(recipe.id);
                onClose();
              }
            }}
          >
            <Icon name="trash" size={14} /> Remove from my library
          </button>
        )}
      </div>

      <div className="recipe-actions">
        <button
          className="icon-btn"
          onClick={() => setPlanOpen((v) => !v)}
          aria-label="Add to meal plan"
        >
          <Icon name="calendar" size={19} />
        </button>
        <button className="secondary-btn" style={{ width: "auto", padding: "13px 14px" }} onClick={addAllMissing}>
          <Icon name="list" size={16} />
        </button>
        {isSaved ? (
          <button className="primary-btn grow" onClick={() => onCook(recipe)}>
            <Icon name="flame" size={17} /> Start cooking
          </button>
        ) : (
          <button
            className="primary-btn grow"
            onClick={() => {
              saveFeatured(recipe.id);
              setToast("Saved to your library");
            }}
          >
            <Icon name="heart" size={17} /> Save this recipe
          </button>
        )}
      </div>

      {planOpen && (
        <div className="plan-picker">
          <p className="tiny muted" style={{ marginBottom: 8 }}>
            Which night?
          </p>
          <div className="row wrap gap-6">
            {days.map((day) => (
              <button
                key={day.key}
                className="chip"
                onClick={() => {
                  planRecipe(day.key, recipe.id);
                  setPlanOpen(false);
                  setToast(`Planned for ${day.dow}`);
                  onPlanDone();
                }}
              >
                {day.dow} {day.num}
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
