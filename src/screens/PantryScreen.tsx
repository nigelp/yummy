import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { catalogById, catalogItems, aisles } from "../data/catalog";
import { useApp } from "../state/store";
import type { MatchResult } from "../core/types";
import { Icon } from "../components/Icon";
import { Chip, EmptyState, Sheet, SheetHead, Stepper } from "../components/UI";
import { expiryLabel } from "../lib/format";

const BASICS = ["salt", "pepper", "olive_oil", "flour", "rice", "pasta", "egg", "milk"];

const EXPIRY_OPTIONS: Array<{ value: number | undefined; label: string }> = [
  { value: undefined, label: "No date" },
  { value: 0, label: "Use today" },
  { value: 2, label: "2 days" },
  { value: 5, label: "5 days" },
  { value: 10, label: "10 days" },
];

const QUICK_PICKS = ["tomato", "onion", "garlic", "egg", "milk", "butter", "pasta", "rice"];

const EMOJI_CHOICES = ["🥫", "🫙", "🍯", "🧴", "🌶️", "🧀", "🍞", "🍶", "🧂", "🥣", "🍋", "🫘"];

export function PantryScreen({
  matches,
  onSettings,
  onFindDinner,
}: {
  matches: Record<string, MatchResult>;
  onSettings: () => void;
  onFindDinner: () => void;
}) {
  const pantry = useApp((s) => s.pantry);
  const recipes = useApp((s) => s.recipes);
  const togglePantry = useApp((s) => s.togglePantry);
  const setPantryDetail = useApp((s) => s.setPantryDetail);
  const customPantry = useApp((s) => s.customPantry);
  const addCustomPantryItem = useApp((s) => s.addCustomPantryItem);
  const deleteCustomPantryItem = useApp((s) => s.deleteCustomPantryItem);
  const clearPantry = useApp((s) => s.clearPantry);

  const [query, setQuery] = useState("");
  const [aisle, setAisle] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customEmoji, setCustomEmoji] = useState("🥫");
  const [customAisle, setCustomAisle] = useState("pantry");

  const timer = useRef<number | null>(null);
  const longFired = useRef(false);

  const allItems = useMemo(() => {
    const custom = customPantry.map((item) => ({
      ...item,
      aliases: [] as string[],
      staple: false,
    }));
    return [...catalogItems, ...custom].sort((a, b) => a.name.localeCompare(b.name));
  }, [customPantry]);

  const selected = useMemo(
    () =>
      Object.values(pantry).map((entry) => ({
        entry,
        definition: allItems.find((item) => item.id === entry.id),
      })),
    [pantry, allItems]
  );

  const selectedCount = selected.length;
  const mealsReady = useMemo(
    () =>
      recipes.filter((recipe) => {
        const match = matches[recipe.id];
        return match && match.total > 0 && match.score >= 80;
      }).length,
    [matches, recipes]
  );

  const showGrid = gridOpen || query.trim().length > 0 || aisle !== "all";

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allItems
      .filter((item) => (aisle === "all" ? true : item.aisle === aisle))
      .filter(
        (item) =>
          !needle ||
          item.name.toLowerCase().includes(needle) ||
          (item.aliases ?? []).some((alias) => alias.includes(needle))
      );
  }, [allItems, aisle, query]);

  const item = detailId ? allItems.find((candidate) => candidate.id === detailId) : undefined;
  const entry = detailId ? pantry[detailId] : undefined;
  const isCustom = !!item && customPantry.some((custom) => custom.id === item.id);

  const startPress = (id: string) => {
    longFired.current = false;
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      setDetailId(id);
    }, 480);
  };
  const endPress = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const tapTile = (id: string, name: string) => {
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    togglePantry(id, name);
  };

  const toggleGrid = () => {
    if (showGrid) {
      setGridOpen(false);
      setQuery("");
      setAisle("all");
    } else {
      setGridOpen(true);
    }
  };

  const openAdd = (prefill?: string) => {
    setCustomName(prefill ?? "");
    setCustomEmoji("🥫");
    setCustomAisle(aisle === "all" ? "pantry" : aisle);
    setAddOpen(true);
  };

  const saveCustom = () => {
    const name = customName.trim();
    if (!name) return;
    addCustomPantryItem({ name, emoji: customEmoji, aisle: customAisle });
    setAddOpen(false);
    setCustomName("");
    setGridOpen(true);
    setAisle("all");
  };

  const addBasics = () => {
    for (const id of BASICS) {
      if (!pantry[id]) togglePantry(id, catalogById.get(id)?.name);
    }
  };

  return (
    <div className="screen pantry-screen">
      <div className="screen-head">
        <div className="brand">
          yummy<span className="dot" />
        </div>
        <div className="grow" />
        <button className="icon-btn" onClick={onSettings} aria-label="Settings">
          <Icon name="settings" size={19} />
        </button>
      </div>

      <div className="pantry-hero">
        <div className="hero-copy">
          <p className="eyebrow">your kitchen, right now</p>
          <h1 className="title-lg" style={{ marginTop: 6, maxWidth: 262 }}>
            Tap what you already have.
          </h1>
          <p className="sub" style={{ marginTop: 7, maxWidth: 262 }}>
            Search an ingredient, or open the shelf to browse.
          </p>
        </div>
        <div className="hero-emoji">
          <span>🥕</span>
          <span>🍋</span>
          <span>🥑</span>
          <span>🧄</span>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{selectedCount}</strong>
            <span>in the pantry</span>
          </div>
          <div className="rule" />
          <div>
            <strong>{mealsReady}</strong>
            <span>{mealsReady === 1 ? "meal ready" : "meals ready"}</span>
          </div>
        </div>
      </div>

      <div className="search-wrap">
        <Icon name="search" size={17} />
        <input
          className="input"
          placeholder={`Search ${allItems.length} pantry things…`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setGridOpen(true)}
        />
        {query && (
          <button className="icon-btn plain clear-search" onClick={() => setQuery("")}>
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      <div className="browse-bar">
        <button
          className={`browse-toggle ${showGrid ? "open" : ""}`}
          onClick={toggleGrid}
          aria-expanded={showGrid}
        >
          <span className="browse-bubble">
            <Icon name="basket" size={18} />
          </span>
          <span className="grow" style={{ textAlign: "left" }}>
            <strong>{showGrid ? "Hide the shelf" : "Browse ingredients"}</strong>
            <span className="tiny faint" style={{ display: "block" }}>
              {allItems.length} items · {aisles.length} aisles
            </span>
          </span>
          <span className={`browse-chevron ${showGrid ? "rotate" : ""}`}>
            <Icon name="chevronDown" size={18} />
          </span>
        </button>
        <button className="add-custom-btn" onClick={() => openAdd(query)} aria-label="Add a custom ingredient">
          <Icon name="plus" size={20} />
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="pantry-shelf">
          <span className="eyebrow">picked</span>
          <div className="row wrap gap-6">
            {selected.slice(0, 5).map(({ entry: picked, definition }) => (
              <button
                key={picked.id}
                className="chip soft on"
                onClick={() => togglePantry(picked.id, picked.name)}
                title={`Remove ${definition?.name ?? picked.name}`}
              >
                <span>{definition?.emoji ?? "🥫"}</span>
                {definition?.name ?? picked.name}
                <Icon name="close" size={10} strokeWidth={2.4} />
              </button>
            ))}
            {selectedCount > 5 && (
              <button className="chip ghost" onClick={() => setGridOpen(true)}>
                +{selectedCount - 5} more
              </button>
            )}
            <button className="chip ghost" onClick={clearPantry}>
              clear all
            </button>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {!showGrid && (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div className="quick-add">
              <span className="eyebrow">quick add</span>
              <div className="row wrap gap-6">
                {QUICK_PICKS.map((id) => {
                  const quick = allItems.find((candidate) => candidate.id === id);
                  if (!quick) return null;
                  const on = !!pantry[id];
                  return (
                    <button
                      key={id}
                      className={`chip ${on ? "soft on" : ""}`}
                      onClick={() => togglePantry(id, quick.name)}
                    >
                      <span>{quick.emoji}</span> {quick.name}
                    </button>
                  );
                })}
                <button className="chip ghost" onClick={() => openAdd()}>
                  <Icon name="plus" size={12} /> custom
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showGrid && (
          <motion.div
            key="grid"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div className="chip-row" style={{ marginTop: 10 }}>
              <Chip active={aisle === "all"} onClick={() => setAisle("all")}>
                All
              </Chip>
              {aisles.map((option) => (
                <Chip
                  key={option.id}
                  active={aisle === option.id}
                  onClick={() => setAisle(option.id)}
                  soft
                >
                  <span>{option.emoji}</span> {option.label}
                </Chip>
              ))}
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                emoji="🔍"
                title={query ? `No “${query}” yet` : "Nothing in that aisle"}
                body="Add it as your own ingredient and it will show up here and in recipe matching."
                action={
                  <button className="primary-btn" style={{ width: "auto", padding: "12px 18px" }} onClick={() => openAdd(query)}>
                    <Icon name="plus" size={16} /> Add “{query || "ingredient"}”
                  </button>
                }
              />
            ) : (
              <div className="tile-grid">
                {filtered.map((tile) => {
                  const on = !!pantry[tile.id];
                  const days = pantry[tile.id]?.daysLeft;
                  const custom = customPantry.some((candidate) => candidate.id === tile.id);
                  return (
                    <button
                      key={tile.id}
                      className={`tile ${on ? "on" : ""}`}
                      onPointerDown={() => startPress(tile.id)}
                      onPointerUp={endPress}
                      onPointerLeave={endPress}
                      onContextMenu={(event) => event.preventDefault()}
                      onClick={() => tapTile(tile.id, tile.name)}
                      aria-pressed={on}
                      title={`${tile.name}${on ? " — in your pantry" : ""}`}
                    >
                      {on ? (
                        <span className="check">
                          <Icon name="check" size={11} strokeWidth={3} />
                        </span>
                      ) : days !== undefined ? (
                        <span className="dot" />
                      ) : null}
                      <span className="emoji">{tile.emoji}</span>
                      <span className="name">{tile.name}</span>
                      {custom && <span className="custom-mark">mine</span>}
                      {pantry[tile.id]?.qty ? (
                        <span className="qty">
                          {pantry[tile.id]?.qty}
                          {pantry[tile.id]?.unit ? ` ${pantry[tile.id]?.unit}` : ""}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            <button className="add-custom-row" onClick={() => openAdd(query)}>
              <span className="plus-bubble small">
                <Icon name="plus" size={16} />
              </span>
              <span>
                <strong>Add your own ingredient</strong>
                <span className="tiny faint" style={{ display: "block" }}>
                  Gochujang, paneer, grandma's preserve…
                </span>
              </span>
              <Icon name="chevronRight" size={16} className="faint" />
            </button>

            <p className="tiny faint center" style={{ marginTop: 14 }}>
              Long-press any tile to add quantities or a use-by date.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedCount === 0 && (
        <div className="card" style={{ padding: 18, marginTop: 18 }}>
          <div className="row gap-12">
            <div className="mini-bubble">🌱</div>
            <div className="grow">
              <h3 className="title-md">Start with the basics</h3>
              <p className="small muted" style={{ marginTop: 3 }}>
                Salt, oil, rice, eggs — the things almost every recipe assumes.
              </p>
            </div>
          </div>
          <button className="secondary-btn" style={{ marginTop: 13 }} onClick={addBasics}>
            <Icon name="plus" size={16} /> Add 8 everyday ingredients
          </button>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="pantry-cta">
          <div className="pantry-cta-copy">
            <strong>{selectedCount}</strong>
            <span>{selectedCount === 1 ? "ingredient" : "ingredients"} picked</span>
          </div>
          <button className="primary-btn" style={{ width: "auto", padding: "12px 18px" }} onClick={onFindDinner}>
            Find a meal <Icon name="arrowRight" size={16} />
          </button>
        </div>
      )}

      <Sheet open={!!item} onClose={() => setDetailId(null)}>
        {item && (
          <>
            <SheetHead
              title={item.name}
              subtitle={isCustom ? "Your own ingredient" : "In your kitchen"}
              onClose={() => setDetailId(null)}
              right={<span style={{ fontSize: 34 }}>{item.emoji}</span>}
            />
            <div className="field">
              <label>How much have you got?</label>
              <div className="row gap-8">
                <input
                  className="input"
                  style={{ flex: 1 }}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  placeholder="e.g. 2"
                  value={entry?.qty ?? ""}
                  onChange={(event) =>
                    setPantryDetail(item.id, {
                      qty: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                />
                <input
                  className="input"
                  style={{ width: 94 }}
                  placeholder="unit"
                  value={entry?.unit ?? ""}
                  onChange={(event) => setPantryDetail(item.id, { unit: event.target.value })}
                />
              </div>
              <p className="tiny faint" style={{ paddingLeft: 4 }}>
                Optional — we'll warn you when a recipe needs more than you have.
              </p>
            </div>

            <div className="field">
              <label>Running out soon?</label>
              <div className="row wrap gap-6">
                {EXPIRY_OPTIONS.map((option) => (
                  <Chip
                    key={option.label}
                    active={(entry?.daysLeft ?? undefined) === option.value}
                    onClick={() => setPantryDetail(item.id, { daysLeft: option.value })}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
              {entry?.daysLeft !== undefined && (
                <p className="tiny" style={{ paddingLeft: 4, color: "#8a4a2a", fontWeight: 800 }}>
                  {expiryLabel(entry.daysLeft)} — we'll push recipes that use it.
                </p>
              )}
            </div>

            <div className="field">
              <label>Update</label>
              <div className="row gap-10">
                <Stepper
                  value={entry?.qty ?? 1}
                  min={0}
                  onChange={(value) => setPantryDetail(item.id, { qty: value })}
                  label="qty"
                />
                <button
                  className="secondary-btn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    togglePantry(item.id, item.name);
                    setDetailId(null);
                  }}
                >
                  <Icon name="trash" size={15} /> Take out of pantry
                </button>
              </div>
            </div>

            {isCustom && (
              <div className="custom-danger">
                <div>
                  <strong>Made this one yourself</strong>
                  <p className="tiny muted">
                    Deleting removes it from the shelf and from every pantry list.
                  </p>
                </div>
                <button
                  className="ghost-btn"
                  style={{ color: "#9c4a38" }}
                  onClick={() => {
                    if (window.confirm(`Delete “${item.name}” from your ingredients?`)) {
                      deleteCustomPantryItem(item.id);
                      setDetailId(null);
                    }
                  }}
                >
                  <Icon name="trash" size={14} /> Delete
                </button>
              </div>
            )}
          </>
        )}
      </Sheet>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)}>
        <SheetHead
          title="Add an ingredient"
          subtitle="For anything the shelf doesn't know about"
          onClose={() => setAddOpen(false)}
        />
        <div className="field">
          <label>Name</label>
          <input
            className="input"
            autoFocus
            placeholder="Gochujang, paneer, sourdough starter…"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && saveCustom()}
          />
        </div>
        <div className="field">
          <label>Icon</label>
          <div className="emoji-choices">
            {EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`emoji-choice ${customEmoji === emoji ? "on" : ""}`}
                onClick={() => setCustomEmoji(emoji)}
                aria-label={`Use ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Aisle</label>
          <div className="row wrap gap-6">
            {aisles.map((option) => (
              <Chip
                key={option.id}
                active={customAisle === option.id}
                onClick={() => setCustomAisle(option.id)}
                soft
              >
                {option.emoji} {option.label}
              </Chip>
            ))}
          </div>
        </div>
        <button className="primary-btn" disabled={!customName.trim()} onClick={saveCustom}>
          <Icon name="plus" size={16} /> Add to my pantry
        </button>
      </Sheet>
    </div>
  );
}
