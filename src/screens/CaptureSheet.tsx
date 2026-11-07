import { useEffect, useRef, useState } from "react";
import { coreCall, extractFromUrl, normalizeRecipe, recognizePhoto } from "../core/api";
import type { Ingredient, Recipe } from "../core/types";
import { useApp } from "../state/store";
import { Icon } from "../components/Icon";
import { Sheet, SheetHead, Stepper } from "../components/UI";
import { PhotoPicker } from "../components/PhotoPicker";

type Mode = "choose" | "link" | "draft";

function blankRecipe(servings: number): Recipe {
  return {
    id: `manual-${Date.now()}`,
    title: "",
    description: "",
    servings,
    ingredients: [],
    steps: [],
    tags: [],
    emoji: "✍️",
    art: "butter",
    source: "manual",
    favorite: false,
    cookCount: 0,
    notes: [],
    warnings: [],
    createdAt: new Date().toISOString(),
  };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.readAsDataURL(file);
  });
}

export function CaptureSheet({
  open,
  onClose,
  initialUrl,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialUrl?: string;
  onSaved: (recipe: Recipe) => void;
}) {
  const settings = useApp((s) => s.settings);
  const addRecipe = useApp((s) => s.addRecipe);
  const setToast = useApp((s) => s.setToast);

  const [mode, setMode] = useState<Mode>("choose");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState(settings.defaultServings);
  const [time, setTime] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialUrl ? "link" : "choose");
    setUrl(initialUrl ?? "");
    setError(null);
    setLoading(false);
    setDraft(null);
  }, [open, initialUrl]);

  const startDraft = (recipe: Recipe) => {
    setDraft(recipe);
    setTitle(recipe.title);
    setServings(recipe.servings || settings.defaultServings);
    setTime(recipe.timeMin ? String(recipe.timeMin) : "");
    setIngredientsText(recipe.ingredients.map((ingredient) => ingredient.raw).join("\n"));
    setStepsText(recipe.steps.join("\n"));
    setMode("draft");
  };

  const fetchLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const recipe = await extractFromUrl(url);
      startDraft(recipe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That page wouldn't give up its recipe.");
    } finally {
      setLoading(false);
    }
  };

  const scanPhoto = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const dataUrl = await readFile(file);
      const text = await recognizePhoto(dataUrl);
      const recipe = await coreCall<Recipe>("parse_ocr", { text });
      startDraft({ ...normalizeRecipe(recipe, "photo"), id: `photo-${Date.now()}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't read that photo.");
    } finally {
      setLoading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const save = async () => {
    setError(null);
    const lines = ingredientsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const steps = stepsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 2);
    if (!title.trim() && lines.length === 0) {
      setError("Give it a name, or add at least one ingredient.");
      return;
    }
    setLoading(true);
    try {
      const parsed = lines.length
        ? await coreCall<Ingredient[]>("parse_ingredients", { lines })
        : [];
      const base = draft ?? blankRecipe(settings.defaultServings);
      const recipe = normalizeRecipe(
        {
          ...base,
          id: base.id || `manual-${Date.now()}`,
          title: title.trim() || "My recipe",
          servings: servings || settings.defaultServings,
          timeMin: time ? Number(time) : undefined,
          ingredients: parsed,
          steps,
          createdAt: base.createdAt || new Date().toISOString(),
        },
        base.source ?? "manual"
      );
      addRecipe(recipe);
      setToast("Saved — it's in your library");
      onSaved(recipe);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that recipe.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Add a recipe">
      <SheetHead
        title="Add a recipe"
        subtitle="It stays on this phone"
        onClose={onClose}
      />

      {mode === "choose" && (
        <>
          <div className="stack gap-10">
            <button className="capture-option" onClick={() => setMode("link")}>
              <span className="emoji" style={{ background: "var(--peach-soft)" }}>
                🔗
              </span>
              <div className="grow">
                <h3>Paste a link</h3>
                <p>Drop in a recipe URL and we'll pull out the good bits.</p>
              </div>
              <Icon name="chevronRight" size={17} className="faint" />
            </button>

            <label className="capture-option" style={{ cursor: "pointer" }}>
              <span className="emoji" style={{ background: "var(--butter-soft)" }}>
                📷
              </span>
              <div className="grow">
                <h3>Scan a page</h3>
                <p>Snap a cookbook or handwritten card. Read on-device.</p>
              </div>
              <Icon name="chevronRight" size={17} className="faint" />
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(event) => void scanPhoto(event.target.files?.[0])}
              />
            </label>

            <button
              className="capture-option"
              onClick={() => startDraft({ ...blankRecipe(settings.defaultServings), title: "" })}
            >
              <span className="emoji" style={{ background: "var(--lilac-soft)" }}>
                ✍️
              </span>
              <div className="grow">
                <h3>By hand</h3>
                <p>Type the family favourites — we'll do the maths.</p>
              </div>
              <Icon name="pen" size={18} className="faint" />
            </button>
          </div>

          {error && (
            <div className="error-card">
              <Icon name="sparkle" size={15} />
              <span>{error}</span>
            </div>
          )}

          <p className="tiny faint center" style={{ marginTop: 18, lineHeight: 1.5 }}>
            On your phone, sharing a page from Chrome sends it straight here.
          </p>
        </>
      )}

      {mode === "link" && (
        <>
          <div className="field">
            <label>Recipe link</label>
            <input
              className="input"
              placeholder="https://…"
              value={url}
              autoFocus
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && !loading && void fetchLink()}
            />
          </div>
          <button className="primary-btn" disabled={loading || !url.trim()} onClick={() => void fetchLink()}>
            {loading ? "Reading the recipe…" : "Read this recipe"}
            {!loading && <Icon name="arrowRight" size={16} />}
          </button>
          {loading && (
            <div className="stack gap-8" style={{ marginTop: 16 }}>
              <div className="shimmer" style={{ height: 16, width: "70%" }} />
              <div className="shimmer" style={{ height: 16, width: "90%" }} />
              <div className="shimmer" style={{ height: 16, width: "55%" }} />
            </div>
          )}
          {error && (
            <div className="error-card">
              <Icon name="sparkle" size={15} />
              <span>{error}</span>
            </div>
          )}
          <button className="ghost-btn" style={{ marginTop: 12 }} onClick={() => { setMode("choose"); setError(null); }}>
            Try another way
          </button>
        </>
      )}

      {mode === "draft" && (
        <>
          {draft?.sourceUrl && (
            <div className="source-chip">
              <Icon name="link" size={12} /> {draft.sourceUrl.replace(/^https?:\/\/(www\.)?/, "").slice(0, 46)}
            </div>
          )}
          {draft?.warnings && draft.warnings.length > 0 && (
            <div className="warn-card" style={{ marginBottom: 12 }}>
              <Icon name="sparkle" size={15} />
              <div>
                {draft.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          )}

          <PhotoPicker
            image={draft?.image}
            emoji={draft?.emoji ?? "🍲"}
            art={draft?.art ?? "butter"}
            label="Photo of the dish"
            onChange={(image) =>
              setDraft((current) => (current ? { ...current, image } : current))
            }
          />

          <div className="field">
            <label>Recipe name</label>
            <input
              className="input"
              placeholder="Nonna's tomato pasta"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="row gap-10" style={{ marginBottom: 12 }}>
            <Stepper value={servings} onChange={setServings} min={1} max={20} />
            <div className="field grow" style={{ marginBottom: 0 }}>
              <label>Minutes</label>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                placeholder="30"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>Ingredients — one per line</label>
            <textarea
              className="input"
              rows={7}
              placeholder={"400 g spaghetti\n2 cloves garlic\n1 (400 g) can chopped tomatoes"}
              value={ingredientsText}
              onChange={(event) => setIngredientsText(event.target.value)}
            />
          </div>

          <div className="field">
            <label>Method — one step per line</label>
            <textarea
              className="input"
              rows={6}
              placeholder="Boil the pasta in well-salted water."
              value={stepsText}
              onChange={(event) => setStepsText(event.target.value)}
            />
          </div>

          {error && (
            <div className="error-card">
              <Icon name="sparkle" size={15} />
              <span>{error}</span>
            </div>
          )}

          <button className="primary-btn" disabled={loading} onClick={() => void save()}>
            <Icon name="check" size={17} />
            {loading ? "Saving…" : "Save to my library"}
          </button>
          <button
            className="ghost-btn"
            style={{ marginTop: 8 }}
            onClick={() => {
              if (draft?.sourceUrl) setMode("link");
              else setMode("choose");
            }}
          >
            Back
          </button>
        </>
      )}
    </Sheet>
  );
}
