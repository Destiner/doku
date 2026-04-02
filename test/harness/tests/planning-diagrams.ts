import type { TestCase } from "../types";

const test: TestCase = {
  name: "planning-diagrams",
  mode: "planning",
  prompt:
    "create a plan for a user authentication system. include diagrams showing the auth flow and component architecture",
  assertions: [
    { type: "doc_not_empty" },
    { type: "doc_contains", pattern: /```mermaid/i },
    {
      type: "used_any_tool",
      tools: ["mcp__doku__write_document", "mcp__doku__edit_document"],
    },
    { type: "project_unchanged" },
  ],
};

export default test;
