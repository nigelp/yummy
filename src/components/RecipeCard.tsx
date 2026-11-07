import type { MatchResult, Recipe } from "../core/types";
import { formatTime } from "../lib/format";
import { Art } from "./Art";
import { Icon } from "./Icon";
import { ScorePill } from "./UI";

function missingLine(match?: MatchResult): string {
  if (!match) return "Tap to open";
  if (match.missing.length === 0) return "Everything's in your kitchen";
  const first = match.missing[0].item;
  if (match.missing.length === 1) return `Just need ${first.toLowerCase()}`;
  return `${first} + ${match.missing.length - 1} more to grab`;
}

export function RecipeCard({
  recipe,
  match,
  onClick,
}: {
  recipe: Recipe;
  match?: MatchResult;
  onClick: () => void;
}) {
  return (
    <button
      className="recipe-card pressable"
      onClick={onClick}
      style={{ width: "100%", textAlign: "left", border: undefined }}
    >
      <Art art={recipe.art} emoji={recipe.emoji} image={recipe.image} />
      <div className="body">
        <h3>{recipe.title}</h3>
        <div className="meta">
          {recipe.timeMin ? (
            <span>
              <Icon name="clock" size={13} /> {formatTime(recipe.timeMin)}
            </span>
          ) : null}
          <span>
            <Icon name="users" size={13} /> {recipe.servings}
          </span>
          {recipe.cookCount > 0 && (
            <span>
              <Icon name="spoon" size={13} /> {recipe.cookCount}×
            </span>
          )}
        </div>
        <div className="row gap-6" style={{ marginTop: 1 }}>
          {match && <ScorePill score={match.score} have={match.have} total={match.total} />}
          {match && match.expiringUsed.length > 0 && (
            <span className="score-pill" style={{ background: "#ebf4dc", color: "#4f7a2a" }}>
              <Icon name="leaf" size={11} /> use it up
            </span>
          )}
        </div>
        <p className="tiny muted" style={{ lineHeight: 1.3 }}>
          {missingLine(match)}
        </p>
      </div>
      <Icon name="chevronRight" size={17} className="faint" />
    </button>
  );
}

export function RecipeTile({
  recipe,
  match,
  onClick,
}: {
  recipe: Recipe;
  match?: MatchResult;
  onClick: () => void;
}) {
  return (
    <button
      className="tile-card pressable"
      onClick={onClick}
      style={{ textAlign: "left", width: "100%", border: 0, padding: 0 }}
    >
      <Art art={recipe.art} emoji={recipe.emoji} image={recipe.image} style={{ height: 104 }} />
      <div style={{ padding: "9px 10px 11px" }}>
        <h4
          className="serif"
          style={{
            fontSize: 14.5,
            lineHeight: 1.15,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: 34,
          }}
        >
          {recipe.title}
        </h4>
        <div className="meta" style={{ marginTop: 5, fontSize: 10.5 }}>
          {recipe.timeMin ? (
            <span>
              <Icon name="clock" size={12} /> {formatTime(recipe.timeMin)}
            </span>
          ) : null}
          {match && <ScorePill score={match.score} />}
        </div>
      </div>
    </button>
  );
}

export function MealCard({
  recipe,
  match,
  onClick,
}: {
  recipe: Recipe;
  match?: MatchResult;
  onClick: () => void;
}) {
  return (
    <button className="meal-card pressable" onClick={onClick} style={{ textAlign: "left" }}>
      <Art art={recipe.art} emoji={recipe.emoji} image={recipe.image} style={{ height: 92 }} />
      <div className="meal-card-body">
        <strong>{recipe.title}</strong>
        <span className="tiny faint">
          {recipe.timeMin ? `${formatTime(recipe.timeMin)} · ` : ""}
          {recipe.cuisine ?? "Home cooking"}
          {recipe.source === "featured" ? " · web" : ""}
        </span>
        {match && <ScorePill score={match.score} />}
      </div>
    </button>
  );
}

export function FeaturedCard({
  recipe,
  match,
  onClick,
}: {
  recipe: Recipe;
  match?: MatchResult;
  onClick: () => void;
}) {
  return (
    <button
      className="featured-card pressable"
      onClick={onClick}
      style={{ textAlign: "left" }}
    >
      <Art art={recipe.art} emoji={recipe.emoji} image={recipe.image} style={{ height: 156 }} />
      <div className="badge">
        <Icon name="sparkle" size={11} /> web
      </div>
      {match && (
        <div className="score-float">
          <ScorePill score={match.score} />
        </div>
      )}
      <div className="caption">
        <strong>{recipe.title}</strong>
        <span>
          {recipe.timeMin ? `${formatTime(recipe.timeMin)} · ` : ""}
          {recipe.cuisine ?? "Home cooking"}
        </span>
      </div>
    </button>
  );
}
