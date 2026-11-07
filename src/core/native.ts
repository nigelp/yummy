import { Capacitor, registerPlugin } from "@capacitor/core";

interface CorePlugin {
  call(options: {
    method: string;
    payload: Record<string, unknown>;
  }): Promise<{ raw: string }>;
}

interface OcrPlugin {
  recognize(options: { image: string }): Promise<{ text: string }>;
}

interface SharePlugin {
  getShared(): Promise<{ text: string | null }>;
  addListener(
    eventName: "shared",
    listener: (data: { text: string }) => void
  ): Promise<{ remove: () => void }>;
}

export const Core = registerPlugin<CorePlugin>("YummyCore");
export const Ocr = registerPlugin<OcrPlugin>("Ocr");
export const ShareReceiver = registerPlugin<SharePlugin>("ShareReceiver");

export const isNative = Capacitor.isNativePlatform();

/** Call the Rust engine and unwrap { ok, data | error }. */
export async function nativeCall<T>(
  method: string,
  payload: Record<string, unknown>
): Promise<T> {
  const result = await Core.call({ method, payload });
  const envelope = JSON.parse(result.raw) as
    | { ok: true; data: T }
    | { ok: false; error: string };
  if (!envelope.ok) throw new Error(envelope.error);
  return envelope.data;
}
