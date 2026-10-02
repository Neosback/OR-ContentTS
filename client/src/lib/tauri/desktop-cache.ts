import { isTauriRuntime } from "./is-tauri";

export async function pickSystemCacheDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const selected = await dialog.open({
      directory: true,
      multiple: false,
      recursive: true,
      title: "Choose cache folder",
    });
    return typeof selected === "string" ? selected : null;
  } catch {
    return null;
  }
}
