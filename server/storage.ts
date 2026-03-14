import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";

const ADJECTIVES = [
  "amber",
  "ancient",
  "arctic",
  "autumn",
  "azure",
  "bold",
  "brave",
  "bright",
  "bronze",
  "calm",
  "cedar",
  "clear",
  "clever",
  "cold",
  "coral",
  "cosmic",
  "crisp",
  "crystal",
  "curious",
  "daring",
  "dark",
  "dawn",
  "deep",
  "desert",
  "digital",
  "distant",
  "double",
  "dream",
  "dry",
  "dusk",
  "eager",
  "early",
  "emerald",
  "empty",
  "fading",
  "fair",
  "fallen",
  "far",
  "fast",
  "fierce",
  "final",
  "first",
  "fluid",
  "foggy",
  "forest",
  "fossil",
  "fresh",
  "frosty",
  "frozen",
  "gentle",
  "gilded",
  "glass",
  "golden",
  "grand",
  "green",
  "grey",
  "hazy",
  "hidden",
  "hollow",
  "humble",
  "hushed",
  "icy",
  "idle",
  "inner",
  "iron",
  "ivory",
  "jade",
  "keen",
  "kind",
  "last",
  "late",
  "light",
  "linen",
  "little",
  "living",
  "lone",
  "long",
  "lost",
  "low",
  "lunar",
  "marble",
  "mellow",
  "misty",
  "modern",
  "mossy",
  "muted",
  "narrow",
  "near",
  "noble",
  "north",
  "odd",
  "old",
  "open",
  "outer",
  "pale",
  "paper",
  "plain",
  "polar",
  "proud",
  "pure",
  "quiet",
  "rapid",
  "rare",
  "raw",
  "red",
  "remote",
  "rich",
  "rigid",
  "rising",
  "rocky",
  "rosy",
  "rough",
  "round",
  "royal",
  "ruby",
  "rugged",
  "rustic",
  "sacred",
  "sage",
  "sandy",
  "scarlet",
  "second",
  "secret",
  "shadow",
  "sharp",
  "sheer",
  "short",
  "shy",
  "silent",
  "silk",
  "silver",
  "simple",
  "sleek",
  "slim",
  "slow",
  "small",
  "smooth",
  "snowy",
  "soft",
  "solar",
  "solid",
  "south",
  "spare",
  "stark",
  "steady",
  "steel",
  "still",
  "stone",
  "strong",
  "subtle",
  "sunny",
  "super",
  "sweet",
  "swift",
  "tall",
  "third",
  "tidal",
  "timber",
  "tiny",
  "upper",
  "urban",
  "vast",
  "vivid",
  "warm",
  "west",
  "white",
  "wide",
  "wild",
  "wiry",
  "young",
] as const;

const NOUNS = [
  "arch",
  "atlas",
  "bay",
  "beam",
  "birch",
  "blade",
  "bloom",
  "bluff",
  "bolt",
  "bond",
  "bone",
  "book",
  "bower",
  "branch",
  "brass",
  "breeze",
  "brick",
  "bridge",
  "brook",
  "cairn",
  "cape",
  "cedar",
  "chalk",
  "chime",
  "cliff",
  "cloud",
  "coast",
  "coin",
  "colt",
  "core",
  "cove",
  "craft",
  "crane",
  "creek",
  "crest",
  "crow",
  "crystal",
  "dale",
  "dawn",
  "delta",
  "dew",
  "dock",
  "dome",
  "dove",
  "draft",
  "drift",
  "dune",
  "dust",
  "eagle",
  "echo",
  "edge",
  "elm",
  "ember",
  "fable",
  "falcon",
  "fern",
  "field",
  "finch",
  "fjord",
  "flame",
  "flare",
  "flint",
  "flora",
  "forge",
  "fort",
  "frost",
  "gate",
  "glade",
  "glen",
  "glow",
  "gorge",
  "grain",
  "grove",
  "gust",
  "hail",
  "harbor",
  "hare",
  "haven",
  "hawk",
  "haze",
  "heath",
  "hedge",
  "helm",
  "heron",
  "hill",
  "hive",
  "hollow",
  "horn",
  "hymn",
  "isle",
  "ivy",
  "jade",
  "lake",
  "lark",
  "laurel",
  "leaf",
  "ledge",
  "light",
  "lily",
  "loom",
  "lotus",
  "maple",
  "marsh",
  "mast",
  "meadow",
  "mesa",
  "mill",
  "mist",
  "moon",
  "moor",
  "moss",
  "moth",
  "mound",
  "nest",
  "oak",
  "oasis",
  "orbit",
  "otter",
  "owl",
  "palm",
  "path",
  "peak",
  "pearl",
  "petal",
  "pier",
  "pine",
  "plain",
  "plume",
  "pond",
  "port",
  "prism",
  "pulse",
  "quail",
  "quartz",
  "rain",
  "range",
  "raven",
  "reef",
  "ridge",
  "river",
  "robin",
  "rock",
  "root",
  "rose",
  "sage",
  "seal",
  "seed",
  "shade",
  "shell",
  "shore",
  "slate",
  "slope",
  "snow",
  "spark",
  "spire",
  "spray",
  "spring",
  "spur",
  "star",
  "stem",
  "stone",
  "storm",
  "sun",
  "swift",
  "thorn",
  "tide",
  "trail",
  "tree",
  "vale",
  "vault",
  "vine",
  "wave",
  "well",
  "willow",
  "wind",
  "wing",
  "wren",
] as const;

export function encodeProjectPath(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

export function getProjectDir(cwd?: string): string {
  const encoded = encodeProjectPath(cwd || process.cwd());
  const dir = join(homedir(), ".doku", "projects", encoded);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function generateDocId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateDocName(projectDir: string): string {
  const meta = getMetadata(projectDir);
  const existingNames = new Set(Object.values(meta.docs).map((d) => d.name));
  for (let i = 0; i < 1000; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const name = `${adj}-${noun}`;
    if (!existingNames.has(name)) return name;
  }
  return `doc-${Date.now()}`;
}

export type DocMode = "planning" | "research" | "general";

export interface SessionMeta {
  sessionId: string;
  createdAt: string;
  label?: string;
}

export interface DocMeta {
  name: string;
  mode: DocMode;
  sessions?: SessionMeta[];
  activeSessionIndex?: number;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMeta {
  docs: Record<string, DocMeta>;
  lastOpenedDoc?: string;
}

export function getMetadata(projectDir: string): ProjectMeta {
  const metaPath = join(projectDir, "_meta.json");
  if (!existsSync(metaPath)) return { docs: {} };
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8")) as ProjectMeta;
  } catch {
    return { docs: {} };
  }
}

export function setMetadata(projectDir: string, meta: ProjectMeta): void {
  const metaPath = join(projectDir, "_meta.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

export function getDocPath(projectDir: string, name: string): string {
  return join(projectDir, `${name}.md`);
}

export function resolveDocName(
  meta: ProjectMeta,
  docId: string,
): string | null {
  return meta.docs[docId]?.name ?? null;
}

export function getActiveSessionId(doc: DocMeta): string | null {
  if (!doc.sessions || doc.sessions.length === 0) return null;
  const idx = doc.activeSessionIndex ?? doc.sessions.length - 1;
  return doc.sessions[idx]?.sessionId ?? null;
}

export function listDocFiles(projectDir: string): string[] {
  if (!existsSync(projectDir)) return [];
  return readdirSync(projectDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}
