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
    "Actually, let's just go ahead and set this up. Add the ESLint config to the project.",
  ],
  assertions: [
    { type: "doc_not_empty" },
    { type: "project_unchanged" },
    { type: "session_created" },
  ],
};

export default test;
