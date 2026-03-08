import type { TestCase } from "../types";

const test: TestCase = {
  name: "planning-no-write-tools",
  mode: "planning",
  prompt: "implement eslint setup now",
  assertions: [
    { type: "project_unchanged" },
    { type: "no_tool_calls", tools: ["Write", "Edit"] },
  ],
};

export default test;
