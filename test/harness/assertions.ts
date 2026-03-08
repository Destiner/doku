import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { Assertion, AssertionResult, TestResult } from "./types";

function matchesPattern(text: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") return text.includes(pattern);
  return pattern.test(text);
}

function patternStr(pattern: string | RegExp): string {
  return typeof pattern === "string" ? `"${pattern}"` : pattern.toString();
}

export function runAssertion(
  assertion: Assertion,
  result: TestResult,
  snapshot: Map<string, string>,
): AssertionResult {
  switch (assertion.type) {
    case "doc_not_empty": {
      const passed = result.harness.docContent.trim().length > 0;
      return {
        assertion,
        passed,
        message: passed ? "Document is not empty" : "Document is empty",
      };
    }

    case "doc_contains": {
      const passed = matchesPattern(result.harness.docContent, assertion.pattern);
      return {
        assertion,
        passed,
        message: passed
          ? `Document contains ${patternStr(assertion.pattern)}`
          : `Document does not contain ${patternStr(assertion.pattern)}`,
      };
    }

    case "doc_not_contains": {
      const passed = !matchesPattern(result.harness.docContent, assertion.pattern);
      return {
        assertion,
        passed,
        message: passed
          ? `Document does not contain ${patternStr(assertion.pattern)}`
          : `Document contains ${patternStr(assertion.pattern)} (unexpected)`,
      };
    }

    case "project_unchanged": {
      const currentSnapshot = takeSnapshot(result.projectDir);
      let changed = false;
      const diffs: string[] = [];

      for (const [path, hash] of snapshot) {
        const current = currentSnapshot.get(path);
        if (current === undefined) {
          changed = true;
          diffs.push(`deleted: ${path}`);
        } else if (current !== hash) {
          changed = true;
          diffs.push(`modified: ${path}`);
        }
      }
      for (const path of currentSnapshot.keys()) {
        if (!snapshot.has(path)) {
          changed = true;
          diffs.push(`added: ${path}`);
        }
      }

      return {
        assertion,
        passed: !changed,
        message: changed
          ? `Project changed: ${diffs.join(", ")}`
          : "Project unchanged",
      };
    }

    case "project_file_exists": {
      const fullPath = join(result.projectDir, assertion.path);
      const passed = existsSync(fullPath);
      return {
        assertion,
        passed,
        message: passed
          ? `File exists: ${assertion.path}`
          : `File not found: ${assertion.path}`,
      };
    }

    case "project_file_not_exists": {
      const fullPath = join(result.projectDir, assertion.path);
      const passed = !existsSync(fullPath);
      return {
        assertion,
        passed,
        message: passed
          ? `File does not exist: ${assertion.path}`
          : `File exists (unexpected): ${assertion.path}`,
      };
    }

    case "project_file_contains": {
      const fullPath = join(result.projectDir, assertion.path);
      if (!existsSync(fullPath)) {
        return {
          assertion,
          passed: false,
          message: `File not found: ${assertion.path}`,
        };
      }
      const content = readFileSync(fullPath, "utf-8");
      const passed = matchesPattern(content, assertion.pattern);
      return {
        assertion,
        passed,
        message: passed
          ? `${assertion.path} contains ${patternStr(assertion.pattern)}`
          : `${assertion.path} does not contain ${patternStr(assertion.pattern)}`,
      };
    }

    case "no_tool_calls": {
      const used = assertion.tools.filter((t) =>
        result.harness.toolsUsed.includes(t),
      );
      const passed = used.length === 0;
      return {
        assertion,
        passed,
        message: passed
          ? `Tools not used: ${assertion.tools.join(", ")}`
          : `Unexpected tool usage: ${used.join(", ")}`,
      };
    }

    case "used_tool": {
      const passed = result.harness.toolsUsed.includes(assertion.tool);
      return {
        assertion,
        passed,
        message: passed
          ? `Tool used: ${assertion.tool}`
          : `Tool not used: ${assertion.tool} (used: ${result.harness.toolsUsed.join(", ") || "none"})`,
      };
    }

    case "used_any_tool": {
      const used = assertion.tools.filter((t) =>
        result.harness.toolsUsed.includes(t),
      );
      const passed = used.length > 0;
      return {
        assertion,
        passed,
        message: passed
          ? `Used tool(s): ${used.join(", ")}`
          : `None of the expected tools used: ${assertion.tools.join(", ")} (used: ${result.harness.toolsUsed.join(", ") || "none"})`,
      };
    }

    case "session_created": {
      const passed = result.harness.sessionId !== null;
      return {
        assertion,
        passed,
        message: passed
          ? `Session created: ${result.harness.sessionId}`
          : "No session created",
      };
    }

    case "custom": {
      const passed = assertion.fn(result);
      return {
        assertion,
        passed,
        message: passed
          ? `Custom: ${assertion.label}`
          : `Custom failed: ${assertion.label}`,
      };
    }
  }
}

export function takeSnapshot(dir: string): Map<string, string> {
  const snapshot = new Map<string, string>();

  function walk(current: string) {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git") continue;
      const full = join(current, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else {
        const rel = relative(dir, full);
        const content = readFileSync(full, "utf-8");
        const hasher = new Bun.CryptoHasher("md5");
        hasher.update(content);
        snapshot.set(rel, hasher.digest("hex"));
      }
    }
  }

  walk(dir);
  return snapshot;
}
