import { Share } from "@capacitor/share";
import { isNative } from "../core/native";
import type { Recipe } from "../core/types";

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

function shareText(recipe: Recipe): string {
  const link = recipe.sourceUrl ?? recipe.videoUrl;
  return link ? `${recipe.title} — ${link}` : `${recipe.title} — saved in Yummy`;
}

/**
 * Share a recipe through the Android share sheet, or copy a link on the web.
 * Cancellation is a normal outcome, not an error worth shouting about.
 */
export async function shareRecipe(recipe: Recipe): Promise<ShareOutcome> {
  const text = shareText(recipe);

  try {
    if (isNative) {
      const available = await Share.canShare().catch(() => ({ value: false }));
      if (available.value) {
        await Share.share({
          title: recipe.title,
          text,
          dialogTitle: "Share recipe",
        });
        return "shared";
      }
    } else if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: recipe.title, text });
      return "shared";
    }
  } catch (error) {
    if (error instanceof Error && /cancel|abort|dismiss/i.test(`${error.name} ${error.message}`)) {
      return "cancelled";
    }
    // Fall through to the clipboard when the native sheet can't open.
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    // Older WebViews (and a browser preview without clipboard permission)
    // can still copy through a temporary textarea.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(area);
      return copied ? "copied" : "failed";
    } catch {
      return "failed";
    }
  }
}
