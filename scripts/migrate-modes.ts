import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const projectsDir = join(homedir(), ".doku", "projects");

if (!existsSync(projectsDir)) {
  console.log("No projects directory found. Nothing to migrate.");
  process.exit(0);
}

const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(projectsDir, d.name));

let totalMigrated = 0;

for (const dir of projectDirs) {
  const metaPath = join(dir, "_meta.json");
  if (!existsSync(metaPath)) continue;

  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    console.warn(`Skipping invalid _meta.json: ${metaPath}`);
    continue;
  }

  let changed = false;
  for (const [id, doc] of Object.entries(meta.docs || {})) {
    const d = doc as Record<string, unknown>;
    if (!d.mode) {
      d.mode = "planning";
      changed = true;
      totalMigrated++;
    }
  }

  if (changed) {
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    console.log(`Migrated: ${metaPath}`);
  }
}

console.log(`Done. Migrated ${totalMigrated} document(s).`);
