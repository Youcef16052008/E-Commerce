/**
 * docs:check — documentation ↔ filesystem parity.
 *
 * Guards docs/architecture.md §11 (folder structure) against drift:
 *   1. every path named in the §11 code block must exist on disk;
 *   2. every directory under src/ (top level, features/*, server/*, shared/*)
 *      must be named somewhere in that block.
 *
 * Run: npm run docs:check   (also wired in CI after typecheck)
 * Exits non-zero with a report when the doc and the tree disagree.
 */
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const DOC = join(ROOT, "docs", "architecture.md");

/** Extract the fenced code block that follows the "## 11." heading. */
function extractSection11(markdown: string): string {
  const heading = markdown.match(/^## 11\.\s+Structure de dossiers\s*$/m);
  if (!heading) {
    throw new Error("docs/architecture.md: heading '## 11. Structure de dossiers' not found");
  }
  const after = markdown.slice(heading.index! + heading[0].length);
  const block = after.match(/```[^\n]*\n([\s\S]*?)```/);
  if (!block) {
    throw new Error("docs/architecture.md §11: no fenced code block after the heading");
  }
  return block[1];
}

/**
 * Turn tree lines into repo-relative paths.
 * Handles `├── name/`, `│   ├── name/`, multi-token lines, bare roots (`src/`),
 * trailing comments. Only directory tokens (ending in `/`) are tracked —
 * the guard is about folders, not individual files.
 */
function parseTreePaths(block: string): string[] {
  const paths: string[] = [];
  const stack: string[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trimEnd(); // strip trailing comment
    if (!line.trim()) continue;

    const m = line.match(/^([│|\s]*)(?:[├└]──)?\s*(.*)$/);
    if (!m) continue;
    const [, prefix, rest] = m;
    const tokens = rest.split(/\s+/).filter((t) => t.endsWith("/"));
    if (tokens.length === 0) continue;

    const hasGlyph = /[├└]──/.test(line);
    const level = Math.floor(prefix.length / 4) + (hasGlyph ? 1 : 0);

    if (level === 0) {
      // Bare root (src/, tests/, docs/) resets the stack and stays as parent.
      stack.length = 0;
      for (const token of tokens) {
        stack.push(token);
        paths.push(stack.join(""));
      }
      if (tokens.length > 1) stack.length = 1; // keep first token as root
    } else {
      // All tokens on a tree line sit at the same depth under the same parent.
      for (const token of tokens) {
        stack.length = level; // keep ancestors 0..level-1
        stack.push(token);
        paths.push(stack.join(""));
      }
    }
  }
  return paths;
}

/** Directories we require to be documented: src top level + one level below. */
function documentedRequiredDirs(): string[] {
  const required: string[] = [];
  const src = join(ROOT, "src");
  for (const child of readdirSync(src)) {
    if (!statSync(join(src, child)).isDirectory()) continue;
    required.push(`src/${child}/`);
    for (const grand of readdirSync(join(src, child))) {
      if (!statSync(join(src, child, grand)).isDirectory()) continue;
      required.push(`src/${child}/${grand}/`);
    }
  }
  return required;
}

function main(): void {
  const markdown = readFileSync(DOC, "utf8");
  const block = extractSection11(markdown);
  const docPaths = parseTreePaths(block);
  const errors: string[] = [];

  // 1. Documented path → disk.
  for (const p of docPaths) {
    if (!existsSync(join(ROOT, p))) {
      errors.push(`documented but missing on disk: ${p}`);
    }
  }

  // 2. Disk → documented (only dirs the doc is expected to cover).
  const mentioned = new Set(docPaths);
  for (const dir of documentedRequiredDirs()) {
    if (!mentioned.has(dir)) {
      errors.push(`exists in src/ but undocumented in §11: ${dir}`);
    }
  }

  if (errors.length > 0) {
    console.error(`docs:check FAILED — docs/architecture.md §11 vs filesystem (${errors.length})`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`docs:check OK — ${docPaths.length} documented paths exist, src/ fully documented.`);
}

main();
