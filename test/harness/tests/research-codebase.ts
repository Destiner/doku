import type { TestCase } from "../types";

const test: TestCase = {
  name: "research-codebase",
  mode: "research",
  prompt: "research the TypeScript config in this project",
  assertions: [
    { type: "doc_not_empty" },
    { type: "doc_contains", pattern: /tsconfig|compilerOptions/i },
    {
      type: "used_any_tool",
      tools: ["mcp__doku__write_document", "mcp__doku__edit_document"],
    },
    { type: "project_unchanged" },
  ],
};

export default test;
