import type { TestCase } from "../types";

const test: TestCase = {
  name: "general-writes-doc",
  mode: "general",
  prompt: "write a README-style overview of this project",
  assertions: [
    { type: "doc_not_empty" },
    { type: "doc_contains", pattern: /typescript|utils|index/i },
    {
      type: "used_any_tool",
      tools: ["mcp__doku__write_document", "mcp__doku__edit_document"],
    },
    { type: "project_unchanged" },
  ],
};

export default test;
