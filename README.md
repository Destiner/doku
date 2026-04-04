# Doku

> A better plan mode

A document editor with an integrated Claude Code chat panel — think, plan, and write with AI right next to your docs.

Doku runs as a local web app. It stores Markdown documents per directory, so each project gets its own workspace. Claude Code is embedded as a chat panel that can read and edit your documents directly.

## Getting Started

Run from any directory:

```sh
npx doku-app@latest
```

This opens Doku in your browser, scoped to the current working directory. Documents are stored at `~/.doku/projects/`.

### Switching Directories

Use the directory picker in the top bar to switch between project directories. Each directory has its own set of documents and chat sessions.

### Document Types

Doku supports three document types:

- **Planning** — roadmaps, architecture decisions, implementation plans
- **Research** — investigation notes, comparisons, findings
- **General** — freeform documents for anything else

Pick the type when creating a new document. Each type gives Claude context about how to assist you.

### Managing Documents

- Create new documents from the file selector dropdown
- Switch between documents using the dropdown
- Delete documents via the delete button
- Documents are plain `.md` files — you can also edit them outside of Doku

### Chat

The chat panel on the right runs Claude Code as a subprocess. It can read and edit the current document and maintains conversation history across sessions.

## Development

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed

### Setup

```sh
git clone <repo-url>
cd doku
bun install
```

### Running

```sh
bun run dev
```

Starts the backend on port 39483 and Vite dev server on port 51738. The frontend proxies API requests to the backend.

### Quality Checks

```sh
bun run typecheck   # Type check frontend and server
bun run lint        # Lint with ESLint (auto-fix)
bun run format      # Format with Prettier
bun run test        # Run tests with Vitest
```

### Building

```sh
bun run build       # Build frontend to dist/
bun run start       # Start production server (serves frontend from dist/)
```

### Project Structure

```
server/
  index.ts             # HTTP server, CRUD API, SSE file watcher, chat proxy
  harness.ts           # Claude Code CLI subprocess wrapper
  storage.ts           # Project dir resolution, doc name generation, metadata
  storage-provider.ts  # Storage abstraction (filesystem + ephemeral)
src/
  pages/               # HomePage, DocPage
  components/          # MarkdownEditor, ChatPanel, FileSelector, etc.
  contexts/            # CwdContext
  hooks/               # Custom React hooks
```

### Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Frontend**: React + Vite
- **AI**: Claude Code CLI (spawned as subprocess)
- **Styling**: CSS
- **Markdown**: react-markdown + remark-gfm + Shiki (syntax highlighting)

## License

MIT
