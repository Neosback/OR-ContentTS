/** Compares TOML block text ignoring line-ending style and trailing whitespace. */
export function sameDefinitionText(a: string, b: string): boolean {
    const normalize = (text: string): string =>
        text
            .split(/\r?\n/)
            .map((line) => line.trimEnd())
            .join("\n")
            .trim();
    return normalize(a) === normalize(b);
}
