import type { TestCase } from "../types";

const test: TestCase = {
  name: "planning-followups-update-doc",
  mode: "planning",
  prompt:
    "Plan how to add a REST API to this project using Express. Start with the basic server setup and route structure.",
  followUps: [
    "Add an authentication section to the plan. We want to use JWT tokens — describe the middleware, token format, and expiration strategy.",
    "Add a database section. We'll use PostgreSQL with the pg library — include the schema for a users table and a posts table with columns and types.",
    "Add a rate limiting section. We want to use express-rate-limit with a sliding window of 100 requests per 15 minutes per IP.",
    "Add an error handling section. Define a custom AppError class and a global error handler middleware that returns JSON error responses with status codes.",
    "Add a logging section. We'll use Winston with three transports: console, a file for errors, and a file for combined logs. Include the exact configuration.",
  ],
  assertions: [
    { type: "doc_not_empty" },
    // Initial prompt
    { type: "doc_contains", pattern: /express/i },
    { type: "doc_contains", pattern: /route/i },
    // Follow-up 1: JWT auth
    { type: "doc_contains", pattern: /JWT/i },
    { type: "doc_contains", pattern: /middleware/i },
    { type: "doc_contains", pattern: /expir/i },
    // Follow-up 2: PostgreSQL schema
    { type: "doc_contains", pattern: /postgres/i },
    { type: "doc_contains", pattern: /users/i },
    { type: "doc_contains", pattern: /posts/i },
    // Follow-up 3: rate limiting
    { type: "doc_contains", pattern: /rate.limit/i },
    { type: "doc_contains", pattern: /100/i },
    // Follow-up 4: error handling
    { type: "doc_contains", pattern: /AppError/i },
    { type: "doc_contains", pattern: /error.handler/i },
    // Follow-up 5: Winston logging
    { type: "doc_contains", pattern: /Winston/i },
    { type: "doc_contains", pattern: /console/i },
    // Meta
    {
      type: "used_any_tool",
      tools: ["mcp__doku__write_document", "mcp__doku__edit_document"],
    },
    { type: "project_unchanged" },
    { type: "session_created" },
  ],
};

export default test;
