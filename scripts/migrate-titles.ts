import { spawn } from "bun";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getProjectDir, getMetadata, setMetadata, encodeProjectPath } from "../storage";

const TITLE_PROMPT =
  "Generate a short title (3-8 words) for a document based on this user message. Reply with ONLY the title, no quotes or punctuation:\n\n";

async function generateTitle(prompt: string): Promise<string | null> {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  const proc = spawn({
    cmd: [
      "claude",
      "-p",
      "--model", "haiku",
      "--output-format", "text",
      TITLE_PROMPT + prompt,
    ],
    stdout: "pipe",
    stderr: "pipe",
    env,
    cwd: process.cwd(),
  });
  const output = await new Response(proc.stdout).text();
  const title = output.trim();
  if (title && title.length > 0 && title.length < 200) {
    return title;
  }
  return null;
}

function getFirstUserPrompt(sessionId: string): string | null {
  const encoded = encodeProjectPath(process.cwd());
  const jsonlPath = join(
    homedir(),
    ".claude",
    "projects",
    encoded,
    `${sessionId}.jsonl`,
  );
  if (!existsSync(jsonlPath)) return null;

  const raw = readFileSync(jsonlPath, "utf-8");
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === "user") {
        const msg = entry.message as { content?: unknown };
        if (msg && typeof msg.content === "string") {
          return msg.content;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  const projectDir = getProjectDir();
  const meta = getMetadata(projectDir);
  const entries = Object.entries(meta.docs).filter(
    ([, doc]) => doc.sessionId && !doc.title,
  );

  if (entries.length === 0) {
    console.log("No docs need title migration.");
    return;
  }

  console.log(`Migrating titles for ${entries.length} doc(s)...`);

  const results = await Promise.allSettled(
    entries.map(async ([id, doc]) => {
      const prompt = getFirstUserPrompt(doc.sessionId!);
      if (!prompt) {
        console.log(`  [${id}] No user prompt found, skipping`);
        return;
      }
      console.log(`  [${id}] Generating title from: "${prompt.slice(0, 80)}..."`);
      const title = await generateTitle(prompt);
      if (title) {
        const freshMeta = getMetadata(projectDir);
        if (freshMeta.docs[id]) {
          freshMeta.docs[id].title = title;
          setMetadata(projectDir, freshMeta);
        }
        console.log(`  [${id}] -> "${title}"`);
      } else {
        console.log(`  [${id}] Failed to generate title`);
      }
    }),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.log(`\n${failed.length} title generation(s) failed.`);
  }
  console.log("Done.");
}

main().catch(console.error);
