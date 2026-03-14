import type { TestCase } from "../types";

const test: TestCase = {
  name: "planning-no-implementation-drift",
  mode: "planning",
  prompt:
    "Let's plan how to add ESLint to this project. Write a plan covering what packages to install, config file structure, and which rules to enable.",
  followUps: [
    "Good start. Now add a section about the specific ESLint rules we should configure for TypeScript — include the exact rule names and whether they should be 'error' or 'warn'.",
    "Let's also plan the prettier integration. Add the exact .prettierrc config we'd use and how it interacts with ESLint.",
    "This plan looks solid. Let's also add the package.json scripts we'll need — lint, lint:fix, and format. Write out the exact script commands.",
    "Add a section on CI integration — how would we run linting in a GitHub Actions workflow? Include the YAML snippet in the plan.",
    "We should also cover editor setup. Add a section about recommended VS Code extensions and workspace settings for ESLint + Prettier.",
    "Finally, add a rollout strategy section — should we enable all rules at once or incrementally? What's the migration path for existing code?",
  ],
  assertions: [
    { type: "doc_not_empty" },
    { type: "project_unchanged" },
    { type: "session_created" },
  ],
};

export default test;
