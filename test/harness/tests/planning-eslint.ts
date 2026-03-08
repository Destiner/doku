import type { TestCase } from "../types";

const test: TestCase = {
  name: "planning-eslint",
  mode: "planning",
  prompt: "let's set up eslint",
  assertions: [
    { type: "doc_not_empty" },
    { type: "doc_contains", pattern: /eslint/i },
    { type: "project_unchanged" },
  ],
};

export default test;
