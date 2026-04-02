import type { TestCase } from "../types";

const test: TestCase = {
  name: "research-web",
  mode: "research",
  prompt: "research the latest TypeScript 5.x features",
  assertions: [
    { type: "doc_not_empty" },
    { type: "doc_contains", pattern: /typescript/i },
    { type: "used_any_tool", tools: ["WebSearch", "WebFetch"] },
    {
      type: "used_any_tool",
      tools: ["mcp__doku__write_document", "mcp__doku__edit_document"],
    },
    { type: "project_unchanged" },
  ],
};

export default test;
