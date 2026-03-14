import { mkdtempSync, writeFileSync, cpSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runHarness } from "../../server/harness";
import { runAssertion, takeSnapshot } from "./assertions";
import type { TestCase, TestCaseResult } from "./types";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");
const DEFAULT_TIMEOUT = 120_000;

let keepArtifacts = false;

async function runTestCase(test: TestCase): Promise<TestCaseResult> {
  const tempDir = mkdtempSync(join(tmpdir(), `doku-test-${test.name}-`));
  const projectDir = join(tempDir, "project");
  const docPath = join(tempDir, "doc.md");

  try {
    // Copy fixture into project dir
    cpSync(join(FIXTURES_DIR, "simple-ts-app"), projectDir, {
      recursive: true,
    });

    // Create doc file
    writeFileSync(docPath, test.initialDocContent || "", "utf-8");

    // Snapshot project before run
    const snapshot = takeSnapshot(projectDir);

    const start = Date.now();

    // Run harness with timeout
    const result = await Promise.race([
      runHarness({
        prompt: test.prompt,
        docPath,
        mode: test.mode,
        cwd: projectDir,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Test timed out")), DEFAULT_TIMEOUT),
      ),
    ]);

    const durationMs = Date.now() - start;

    const testResult = { harness: result, projectDir };
    const assertions = test.assertions.map((a) =>
      runAssertion(a, testResult, snapshot),
    );

    return {
      name: test.name,
      passed: assertions.every((a) => a.passed),
      assertions,
      durationMs,
    };
  } catch (err) {
    return {
      name: test.name,
      passed: false,
      assertions: [],
      durationMs: 0,
      error: String(err),
    };
  } finally {
    if (keepArtifacts) {
      console.log(`    artifacts: ${tempDir}`);
    } else {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup best-effort
      }
    }
  }
}

// Discover and load test files
async function loadTests(filter?: string): Promise<TestCase[]> {
  const { readdirSync } = await import("fs");
  const testsDir = join(import.meta.dir, "tests");
  const files = readdirSync(testsDir).filter((f) => f.endsWith(".ts"));

  const tests: TestCase[] = [];
  for (const file of files) {
    const mod = await import(join(testsDir, file));
    const testCase = mod.default as TestCase;
    if (testCase && testCase.name) {
      if (!filter || testCase.name.includes(filter)) {
        tests.push(testCase);
      }
    }
  }

  return tests;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  keepArtifacts = args.includes("--keep");
  const testIdx = args.indexOf("--test");
  const filter = testIdx !== -1 ? args[testIdx + 1] : undefined;

  const tests = await loadTests(filter);

  if (tests.length === 0) {
    console.log("No tests found.");
    process.exit(0);
  }

  console.log(`Running ${tests.length} test(s)...\n`);

  const results: TestCaseResult[] = [];

  for (const test of tests) {
    process.stdout.write(`  ${test.name} ... `);
    const result = await runTestCase(test);
    results.push(result);

    if (result.passed) {
      console.log(`PASS (${(result.durationMs / 1000).toFixed(1)}s)`);
    } else {
      console.log(`FAIL (${(result.durationMs / 1000).toFixed(1)}s)`);
    }

    if (verbose || !result.passed) {
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
      for (const a of result.assertions) {
        const icon = a.passed ? "  ✓" : "  ✗";
        console.log(`    ${icon} ${a.message}`);
      }
    }
  }

  console.log();
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(
    `Results: ${passed} passed, ${failed} failed, ${results.length} total`,
  );

  process.exit(failed > 0 ? 1 : 0);
}

main();
