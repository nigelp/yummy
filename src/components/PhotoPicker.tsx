import { useRef, useState } from "react";
import { fileToRecipePhoto } from "../lib/photo";
import { Icon } from "./Icon";
import { Art } from "./Art";

/**
 * A photo well for the recipe editor. Stores the photo as a compressed data
 * URL on the recipe, which keeps everything in the one local backup file.
 */
export function PhotoPicker({
  image,
  emoji,
  art,
  onChange,
  label = "Photo",
}: {
  image?: string;
  emoji: string;
  art: string;
  onChange: (image?: string) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await fileToRecipePhoto(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that photo");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="photo-field">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ paddingLeft: 2 }}>{label}</label>
        {image && (
          <button type="button" className="ghost-btn" style={{ padding: "2px 4px" }} onClick={() => onChange(undefined)}>
            Remove
          </button>
        )}
      </div>

      <button
        type="button"
        className={`photo-well ${image ? "has-photo" : ""}`}
        onClick={() => input.current?.click()}
        aria-label={image ? "Change recipe photo" : "Add a recipe photo"}
      >
        {image ? (
          <Art art={art} emoji={emoji} image={image} style={{ width: "100%", height: 150 }} />
        ) : (
          <div className="photo-empty">
            <span className="photo-bubble">
              <Icon name="camera" size={19} />
            </span>
            <strong>{busy ? "Reading photo…" : "Add a photo of the dish"}</strong>
            <span className="tiny faint">From your camera roll — resized for the app</span>
          </div>
        )}
        {busy && <div className="photo-loading">Preparing…</div>}
        {image && (
          <span className="photo-edit">
            <Icon name="camera" size={13} /> change
          </span>
        )}
      </button>

      {error && <p className="tiny" style={{ color: "#9c4a38", paddingLeft: 4 }}>{error}</p>}

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void pick(event.target.files?.[0])}
      />
    </div>
  );
}
