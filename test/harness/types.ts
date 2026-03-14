import type { DocMode } from "../../server/storage";
import type { HarnessResult } from "../../server/harness";

export interface TestCase {
  name: string;
  mode: DocMode;
  prompt: string;
  followUps?: string[];
  initialDocContent?: string;
  maxTurns?: number;
  assertions: Assertion[];
}

export type Assertion =
  | { type: "doc_not_empty" }
  | { type: "doc_contains"; pattern: string | RegExp }
  | { type: "doc_not_contains"; pattern: string | RegExp }
  | { type: "project_unchanged" }
  | { type: "project_file_exists"; path: string }
  | { type: "project_file_not_exists"; path: string }
  | { type: "project_file_contains"; path: string; pattern: string | RegExp }
  | { type: "no_tool_calls"; tools: string[] }
  | { type: "used_tool"; tool: string }
  | { type: "used_any_tool"; tools: string[] }
  | { type: "session_created" }
  | { type: "custom"; fn: (result: TestResult) => boolean; label: string };

export interface TestResult {
  harness: HarnessResult;
  projectDir: string;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  message: string;
}

export interface TestCaseResult {
  name: string;
  passed: boolean;
  assertions: AssertionResult[];
  durationMs: number;
  error?: string;
}
