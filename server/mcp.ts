import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";

const DOC_PATH = process.env.DOC_PATH;
if (!DOC_PATH) {
  console.error("DOC_PATH environment variable is required");
  process.exit(1);
}

const server = new McpServer({ name: "doku", version: "1.0.0" });

server.tool("read_document", "Read the current document content", {}, () => {
  let content = "";
  if (existsSync(DOC_PATH)) {
    content = readFileSync(DOC_PATH, "utf-8");
  }
  return { content: [{ type: "text", text: content }] };
});

server.tool(
  "write_document",
  "Overwrite the entire document with new content",
  { content: z.string() },
  ({ content }) => {
    writeFileSync(DOC_PATH, content, "utf-8");
    return {
      content: [{ type: "text", text: `Wrote ${content.length} chars` }],
    };
  },
);

server.tool(
  "edit_document",
  "Search and replace text in the document",
  { old_text: z.string(), new_text: z.string() },
  ({ old_text, new_text }) => {
    if (!existsSync(DOC_PATH)) {
      return {
        content: [{ type: "text", text: "Error: document does not exist" }],
        isError: true,
      };
    }
    const content = readFileSync(DOC_PATH, "utf-8");
    const idx = content.indexOf(old_text);
    if (idx === -1) {
      return {
        content: [
          {
            type: "text",
            text: `Error: old_text not found in document. Make sure you're using the exact text from the document.`,
          },
        ],
        isError: true,
      };
    }
    const updated =
      content.slice(0, idx) + new_text + content.slice(idx + old_text.length);
    writeFileSync(DOC_PATH, updated, "utf-8");
    return {
      content: [
        {
          type: "text",
          text: `Replaced ${old_text.length} chars with ${new_text.length} chars`,
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
