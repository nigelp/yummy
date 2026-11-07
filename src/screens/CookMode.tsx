import { useEffect, useMemo, useRef, useState } from "react";
import { scale } from "../core/api";
import type { Recipe, ScaleResult } from "../core/types";
import { useApp } from "../state/store";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/UI";

interface CookTimer {
  id: number;
  label: string;
  endsAt: number;
  notified?: boolean;
}

function suggestedMinutes(text: string): number | null {
  const match = text.match(/(\d+)(?:\s*[–-]\s*\d+)?\s*(minutes?|mins?|hours?|hrs?)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 240) return null;
  return /hour|hr/i.test(match[2]) ? value * 60 : value;
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.2);
    window.setTimeout(() => void ctx.close(), 1400);
    navigator.vibrate?.([160, 90, 160]);
  } catch {
    /* silence is fine */
  }
}

function mmss(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function CookMode({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const logCook = useApp((s) => s.logCook);
  const setToast = useApp((s) => s.setToast);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const [scaled, setScaled] = useState<ScaleResult | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [now, setNow] = useState(Date.now());
  const timerId = useRef(0);

  useEffect(() => {
    let alive = true;
    scale(recipe, recipe.servings, settings.system)
      .then((result) => alive && setScaled(result))
      .catch(() => alive && setScaled(null));
    return () => {
      alive = false;
    };
  }, [recipe, settings.system]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let sentinel: { release?: () => Promise<void> } | undefined;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: string) => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((lock) => {
        sentinel = lock;
      })
      .catch(() => undefined);
    return () => {
      void sentinel?.release?.();
    };
  }, []);

  useEffect(() => {
    const due = timers.filter((timer) => !timer.notified && timer.endsAt <= now);
    if (due.length === 0) return;
    beep();
    setTimers((current) =>
      current.map((timer) =>
        timer.endsAt <= now ? { ...timer, notified: true } : timer
      )
    );
  }, [now, timers]);

  const stepText = recipe.steps[step] ?? "";
  const minutes = useMemo(() => suggestedMinutes(stepText), [stepText]);
  const progress = recipe.steps.length ? ((step + 1) / recipe.steps.length) * 100 : 0;

  const startTimer = () => {
    if (!minutes) return;
    timerId.current += 1;
    const timer: CookTimer = {
      id: timerId.current,
      label: `${minutes} min`,
      endsAt: Date.now() + minutes * 60 * 1000,
    };
    setTimers((current) => [...current, timer]);
    setToast(`Timer set for ${minutes} minute${minutes === 1 ? "" : "s"}`);
  };

  const next = () => {
    if (step >= recipe.steps.length - 1) setFinished(true);
    else setStep((value) => value + 1);
  };

  return (
    <div className="cook-mode">
      <div className="cook-head">
        <button className="icon-btn" onClick={onClose} aria-label="Leave cook mode">
          <Icon name="close" size={19} />
        </button>
        <div className="grow">
          <p className="tiny faint" style={{ fontWeight: 800 }}>
            cooking · serves {recipe.servings}
          </p>
          <p style={{ fontWeight: 900, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {recipe.title}
          </p>
        </div>
        <button
          className={`icon-btn ${showIngredients ? "active" : ""}`}
          onClick={() => setShowIngredients((value) => !value)}
          aria-label="Show ingredients"
        >
          <Icon name="basket" size={19} />
        </button>
      </div>

      <div className="cook-progress" aria-hidden>
        <span style={{ width: `${finished ? 100 : progress}%` }} />
      </div>

      {finished ? (
        <div className="cook-done">
          <div className="confetti">🎉</div>
          <p className="eyebrow">that's dinner</p>
          <h1 className="title-xl" style={{ marginTop: 8 }}>
            Smells
            <br />
            delicious.
          </h1>
          <p className="sub" style={{ marginTop: 10 }}>
            {recipe.title} · {recipe.servings} servings. Add a note about what you'd change next
            time from the recipe page.
          </p>
          <button
            className="primary-btn"
            style={{ marginTop: 26 }}
            onClick={() => {
              logCook(recipe.id);
              setToast("Logged — enjoy every bite");
              onClose();
            }}
          >
            <Icon name="check" size={17} /> Log this cook
          </button>
          <button className="ghost-btn" style={{ marginTop: 8 }} onClick={() => setFinished(false)}>
            Back to the steps
          </button>
        </div>
      ) : (
        <>
          <div className="cook-step">
            <p className="step-label">
              Step {step + 1} of {recipe.steps.length}
            </p>
            <p className="text">{stepText}</p>
            {minutes && (
              <button className="timer-suggest" onClick={startTimer}>
                <Icon name="timer" size={16} /> Start a {minutes} minute timer
              </button>
            )}
          </div>

          {showIngredients && (
            <div className="cook-ingredients-card">
              <div className="row" style={{ marginBottom: 6 }}>
                <strong className="small grow">Everything you need</strong>
                <span className="tiny faint">{scaled ? `${recipe.servings} servings` : ""}</span>
              </div>
              {scaled?.ingredients.map((ingredient, index) => (
                <div
                  key={`${ingredient.text}-${index}`}
                  className="cook-ing-row"
                  onClick={() => {
                    const nextChecked = new Set(checked);
                    if (nextChecked.has(index)) nextChecked.delete(index);
                    else nextChecked.add(index);
                    setChecked(nextChecked);
                  }}
                >
                  <span className={`check-circle ${checked.has(index) ? "on" : ""}`}>
                    {checked.has(index) && <Icon name="check" size={11} strokeWidth={3} />}
                  </span>
                  <span className={checked.has(index) ? "done" : ""}>{ingredient.text}</span>
                </div>
              ))}
            </div>
          )}

          {timers.length > 0 && (
            <div className="timer-tray" style={{ position: "static", transform: "none", width: "100%" }}>
              {timers.map((timer) => {
                const remaining = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
                return (
                  <button
                    key={timer.id}
                    className={`timer-pill ${remaining === 0 ? "low" : ""}`}
                    onClick={() => setTimers((current) => current.filter((t) => t.id !== timer.id))}
                    title="Tap to dismiss"
                  >
                    <Icon name="timer" size={13} />
                    {remaining === 0 ? "done" : mmss(remaining)}
                  </button>
                );
              })}
            </div>
          )}

          <div className="cook-nav">
            <button
              className="icon-btn"
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              aria-label="Previous step"
            >
              <Icon name="chevronLeft" size={20} />
            </button>
            <button className="primary-btn grow" onClick={next}>
              {step >= recipe.steps.length - 1 ? (
                <>
                  <Icon name="check" size={17} /> Finish cooking
                </>
              ) : (
                <>
                  Next step <Icon name="arrowRight" size={17} />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function CookModeSheet(props: { recipe: Recipe; onClose: () => void }) {
  return (
    <Sheet open onClose={props.onClose} full label="Cook mode">
      <CookMode {...props} />
    </Sheet>
  );
}
