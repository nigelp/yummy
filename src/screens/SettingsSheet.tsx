import { useRef, useState } from "react";
import { useApp } from "../state/store";
import { exportRecipes, parseBackup } from "../lib/backup";
import { catalogItems, substitutions } from "../data/catalog";
import { Icon } from "../components/Icon";
import { Sheet, SheetHead, Switch, Segmented, Stepper } from "../components/UI";

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const clearShopping = useApp((s) => s.clearShopping);
  const clearPantry = useApp((s) => s.clearPantry);
  const resetApp = useApp((s) => s.resetApp);
  const setToast = useApp((s) => s.setToast);
  const recipes = useApp((s) => s.recipes);
  const importRecipes = useApp((s) => s.importRecipes);
  const shopping = useApp((s) => s.shopping);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dataBusy, setDataBusy] = useState(false);
  const [importNote, setImportNote] = useState<{ text: string; error?: boolean } | null>(null);

  const handleExport = async () => {
    setDataBusy(true);
    setImportNote(null);
    try {
      const shared = await exportRecipes(recipes);
      setToast(shared ? "Recipe backup ready" : "Export cancelled");
    } catch {
      setToast("Couldn't export those recipes");
    } finally {
      setDataBusy(false);
    }
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    setDataBusy(true);
    setImportNote(null);
    try {
      const imported = parseBackup(await file.text());
      const { added, skipped } = importRecipes(imported);
      const note = skipped
        ? `Imported ${added} · ${skipped} already in your library`
        : `Imported ${added} ${added === 1 ? "recipe" : "recipes"}`;
      setImportNote({ text: note });
      setToast(note);
    } catch (error) {
      const message = error instanceof Error ? error.message : "That file couldn't be imported.";
      setImportNote({ text: message, error: true });
      setToast("Import failed");
    } finally {
      setDataBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Settings">
      <SheetHead title="Settings" subtitle="Make Yummy cook the way you do" onClose={onClose} />

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <strong>Measurements</strong>
            <p className="tiny muted">How amounts are written</p>
          </div>
        </div>
        <div style={{ padding: "0 0 12px" }}>
          <Segmented
            value={settings.system}
            options={[
              { value: "metric", label: "Grams & millilitres" },
              { value: "imperial", label: "Cups & ounces" },
            ]}
            onChange={(system) => setSettings({ system })}
          />
        </div>

        <div className="settings-row">
          <div>
            <strong>Default servings</strong>
            <p className="tiny muted">New recipes start here</p>
          </div>
          <Stepper
            value={settings.defaultServings}
            onChange={(defaultServings) => setSettings({ defaultServings })}
            min={1}
            max={12}
            label="people"
          />
        </div>

        <div className="settings-row">
          <div>
            <strong>Assume the staples</strong>
            <p className="tiny muted">Salt, pepper, oil, flour, sugar, water</p>
          </div>
          <Switch
            checked={settings.useStaples}
            onChange={(useStaples) => setSettings({ useStaples })}
            label="Assume the staples"
          />
        </div>

        <div className="settings-row">
          <div>
            <strong>Suggest swaps</strong>
            <p className="tiny muted">Buttermilk → milk + lemon, and friends</p>
          </div>
          <Switch
            checked={settings.substitutions}
            onChange={(substitutions) => setSettings({ substitutions })}
            label="Suggest swaps"
          />
        </div>
      </div>

      <div className="section-head">
        <h2>Recipe backup</h2>
        <span className="tiny faint">{recipes.length} on this phone</span>
      </div>
      <div className="settings-card">
        <button
          className="settings-action"
          disabled={dataBusy || recipes.length === 0}
          onClick={() => void handleExport()}
        >
          <Icon name="download" size={17} />
          <span className="grow">Export recipes</span>
          <span className="tiny faint">JSON</span>
        </button>
        <button
          className="settings-action"
          disabled={dataBusy}
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="upload" size={17} />
          <span className="grow">{dataBusy ? "Working…" : "Import recipes"}</span>
          <span className="tiny faint">merge</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => void handleImport(event.target.files?.[0])}
        />
      </div>
      {importNote && (
        <p
          className="tiny"
          style={{
            marginTop: 7,
            paddingLeft: 4,
            fontWeight: 700,
            color: importNote.error ? "#9c4a38" : "#4f7a2a",
          }}
        >
          {importNote.text}
        </p>
      )}
      <p className="tiny faint" style={{ marginTop: 7, paddingLeft: 4 }}>
        Includes photos, notes and favourites. Importing skips recipes already in your library.
      </p>

      <div className="section-head">
        <h2>Your data</h2>
        <span className="tiny faint">{recipes.length} recipes · on this phone</span>
      </div>
      <div className="settings-card">
        <button
          className="settings-action"
          onClick={() => {
            if (window.confirm("Clear the shopping list?")) {
              clearShopping();
              setToast("Shopping list cleared");
            }
          }}
        >
          <Icon name="list" size={17} />
          <span className="grow">Clear shopping list</span>
          <span className="tiny faint">{shopping.length} item{shopping.length === 1 ? "" : "s"}</span>
        </button>
        <button
          className="settings-action"
          onClick={() => {
            if (window.confirm("Empty your pantry? Recipes stay.")) {
              clearPantry();
              setToast("Pantry emptied");
            }
          }}
        >
          <Icon name="basket" size={17} />
          <span className="grow">Empty pantry</span>
        </button>
        <button
          className="settings-action"
          onClick={() => {
            if (window.confirm("Reset everything? Recipes you've saved will be removed.")) {
              resetApp();
              onClose();
            }
          }}
        >
          <Icon name="trash" size={17} />
          <span className="grow" style={{ color: "#9c4a38" }}>
            Reset the whole app
          </span>
        </button>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 18 }}>
        <p className="eyebrow">made for your kitchen</p>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.55 }}>
          Yummy keeps every recipe, pantry note and shopping list on this phone. The parsing,
          scaling and matching engine is written in Rust and runs right here — no account, no
          uploads.
        </p>
        <p className="tiny faint" style={{ marginTop: 10 }}>
          Engine v0.1 · {catalogItems.length} pantry ingredients · {substitutions.length} built-in swaps
        </p>
      </div>
    </Sheet>
  );
}
