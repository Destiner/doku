import type { TestCase } from "../types";

const test: TestCase = {
  name: "research-codebase",
  mode: "research",
  prompt: "research the TypeScript config in this project",
  assertions: [
    { type: "doc_not_empty" },
    { type: "doc_contains", pattern: /tsconfig|compilerOptions/i },
    { type: "project_unchanged" },
  ],
};

export default test;
