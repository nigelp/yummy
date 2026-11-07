import { useMemo, useState } from "react";
import { aisles, catalogItems } from "../data/catalog";
import { useApp } from "../state/store";
import { Icon } from "../components/Icon";
import { EmptyState } from "../components/UI";
import type { ShoppingItem } from "../core/types";
import { aisleEmoji, aisleLabel } from "../data/catalog";

function aisleForText(text: string): string {
  const needle = text.trim().toLowerCase();
  if (!needle) return "other";
  const found = catalogItems.find(
    (item) =>
      item.name.toLowerCase().includes(needle) ||
      item.aliases.some((alias) => alias.includes(needle) || needle.includes(alias))
  );
  return found?.aisle ?? "other";
}

export function ListScreen() {
  const shopping = useApp((s) => s.shopping);
  const toggleShopping = useApp((s) => s.toggleShopping);
  const removeShopping = useApp((s) => s.removeShopping);
  const addShoppingItem = useApp((s) => s.addShoppingItem);
  const clearChecked = useApp((s) => s.clearChecked);
  const clearShopping = useApp((s) => s.clearShopping);
  const setToast = useApp((s) => s.setToast);
  const [text, setText] = useState("");

  const checkedCount = shopping.filter((item) => item.checked).length;
  const progress = shopping.length ? Math.round((checkedCount / shopping.length) * 100) : 0;

  const groups = useMemo(() => {
    const order = aisles.map((a) => a.id);
    const known = aisles.map((aisle) => ({
      ...aisle,
      items: shopping.filter((item) => item.aisle === aisle.id),
    }));
    const extra = shopping.filter((item) => !order.includes(item.aisle));
    if (extra.length) known.push({ id: "other", label: "Other", emoji: "🧺", items: extra });
    return known.filter((group) => group.items.length > 0);
  }, [shopping]);

  const share = async () => {
    const lines: string[] = ["🛒 Yummy shopping list", ""];
    for (const group of groups) {
      lines.push(`${aisleEmoji(group.id)} ${aisleLabel(group.id)}`);
      for (const item of group.items) {
        lines.push(`${item.checked ? "✓" : "•"} ${item.text}`);
      }
      lines.push("");
    }
    const body = lines.join("\n").trim();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Yummy shopping list", text: body });
      } else {
        await navigator.clipboard.writeText(body);
        setToast("List copied to the clipboard");
      }
    } catch {
      setToast("Couldn't share that just now");
    }
  };

  const add = () => {
    if (!text.trim()) return;
    addShoppingItem(text, aisleForText(text));
    setText("");
    setToast("Added to the list");
  };

  return (
    <div className="screen">
      <div className="screen-head">
        <div className="grow">
          <p className="eyebrow">
            {shopping.length ? `${shopping.length - checkedCount} still to find` : "nothing to carry"}
          </p>
          <h1 className="title-xl" style={{ marginTop: 4 }}>
            Shopping
          </h1>
        </div>
        <button className="icon-btn" onClick={share} aria-label="Share list">
          <Icon name="share" size={19} />
        </button>
      </div>

      {shopping.length > 0 && (
        <div className="list-progress-card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong className="small">{progress}% done</strong>
            <span className="tiny faint">
              {checkedCount} of {shopping.length} checked
            </span>
          </div>
          <div className="list-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="row gap-8" style={{ marginTop: 12 }}>
        <input
          className="input grow"
          placeholder="Add anything — milk, birthday candles…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
        />
        <button className="icon-btn" onClick={add} aria-label="Add item">
          <Icon name="plus" size={19} />
        </button>
      </div>

      {shopping.length === 0 ? (
        <EmptyState
          emoji="🧺"
          title="The list is empty"
          body="Open any recipe that's missing a few things and tap the list button. We'll sort it by aisle for you."
        />
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.id}>
              <div className="aisle-header">
                <span>{group.emoji}</span> {group.label}
                <span className="grow" />
                <span className="tiny faint">{group.items.length}</span>
              </div>
              {group.items.map((item: ShoppingItem) => (
                <div key={item.id} className={`list-row ${item.checked ? "checked" : ""}`}>
                  <button
                    className={`check-circle ${item.checked ? "on" : ""}`}
                    onClick={() => toggleShopping(item.id)}
                    aria-label={item.checked ? "Uncheck" : "Check"}
                  >
                    {item.checked && <Icon name="check" size={12} strokeWidth={3} />}
                  </button>
                  <div className="grow">
                    <p className="label">{item.text}</p>
                    {item.recipeTitle && (
                      <span className="from">for {item.recipeTitle}</span>
                    )}
                  </div>
                  <button
                    className="icon-btn plain"
                    onClick={() => removeShopping(item.id)}
                    aria-label="Remove item"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}

          <div className="row gap-8" style={{ marginTop: 20 }}>
            {checkedCount > 0 && (
              <button className="secondary-btn" onClick={clearChecked}>
                Clear {checkedCount} checked
              </button>
            )}
            <button
              className="ghost-btn grow"
              onClick={() => {
                if (window.confirm("Empty the whole shopping list?")) {
                  clearShopping();
                  setToast("List cleared");
                }
              }}
            >
              Empty list
            </button>
          </div>
        </>
      )}
    </div>
  );
}
