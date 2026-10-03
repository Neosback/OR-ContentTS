import { pickAndGrantFolder } from "./desktop-access";
import { isTauriRuntime } from "./is-tauri";

/** Opens the native folder picker and grants the chosen folder to the app (see desktop-access.ts). */
export async function pickSystemDirectory(
  title = "Choose folder",
  defaultPath?: string,
): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await pickAndGrantFolder({ title, defaultPath });
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
