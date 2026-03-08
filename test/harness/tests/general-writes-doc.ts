import type { TestCase } from "../types";

const test: TestCase = {
  name: "general-writes-doc",
  mode: "general",
  prompt: "write a README-style overview of this project",
  assertions: [
    { type: "doc_not_empty" },
    { type: "doc_contains", pattern: /typescript|utils|index/i },
    { type: "project_unchanged" },
  ],
};

export default test;
