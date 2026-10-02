import { isTauriRuntime } from "./is-tauri";

export async function pickSystemDirectory(
  title = "Choose folder",
): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const selected = await dialog.open({
      directory: true,
      multiple: false,
      recursive: true,
      title,
    });
    return typeof selected === "string" ? selected : null;
  } catch {
    return null;
  }
}

export function pickSystemCacheDirectory(): Promise<string | null> {
  return pickSystemDirectory("Choose cache folder");
}

export function pickOpenRuneProjectDirectory(): Promise<string | null> {
  return pickSystemDirectory("Choose OpenRune Server root");
}
