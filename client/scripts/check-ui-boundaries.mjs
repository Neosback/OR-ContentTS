import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const root = process.cwd();
const uiRoot = resolve(root, "src/ui");
const entry = resolve(root, "src/main.ts");

const forbiddenPackages = [
    /^react(?:\/|$)/,
    /^react-dom(?:\/|$)/,
    /^dockview-react(?:\/|$)/,
];

const sourceExtensions = new Set([".svelte", ".ts", ".js", ".mts", ".mjs"]);
const importPattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)["']([^"']+)["']/g;

function walk(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walk(path));
        else if (sourceExtensions.has(extname(entry.name))) files.push(path);
    }
    return files;
}

function resolvesToTsx(fromFile, specifier) {
    if (!specifier.startsWith(".")) return false;
    const target = resolve(dirname(fromFile), specifier);
    return existsSync(target + ".tsx") || existsSync(join(target, "index.tsx")) || target.endsWith(".tsx");
}

const files = [...walk(uiRoot), entry];
const violations = [];

for (const file of files) {
    const source = readFileSync(file, "utf8");
    let match;

    while ((match = importPattern.exec(source)) !== null) {
        const specifier = match[1];

        if (forbiddenPackages.some((pattern) => pattern.test(specifier))) {
            violations.push(`${file}: forbidden UI dependency "${specifier}"`);
        }

        if (resolvesToTsx(file, specifier)) {
            violations.push(`${file}: active Svelte UI resolves "${specifier}" to TSX`);
        }
    }

    if (/\bReact\./.test(source)) {
        violations.push(`${file}: active Svelte UI references the React namespace`);
    }
}

if (violations.length > 0) {
    console.error("Svelte UI architecture boundary failed:\n");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exit(1);
}

console.log(`Svelte UI architecture boundary passed (${files.length} files scanned).`);
