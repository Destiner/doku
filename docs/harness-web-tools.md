# Harness: Web Tools Limitation

WebSearch and WebFetch are **deferred tools** in Claude Code. They aren't loaded by default — the model must first call `ToolSearch` to discover and load them, then call the actual tool.

In the UI (server.ts chat proxy), this works fine. A typical research flow looks like:

```
Read doc → ToolSearch → WebSearch → WebSearch → WebFetch → WebFetch
```

In the **harness** (`-p` pipe mode), Claude skips web tools entirely and hallucinates answers instead — even for real-time queries like "top Hacker News stories right now." The `toolsUsed` array comes back empty.

This means the `research-web` test (asserting `used_any_tool: ["WebSearch", "WebFetch"]`) is not viable in the current harness setup. The test has been removed.

The `used_any_tool` assertion type is kept in the harness for future use if this is resolved.

## Possible fixes

- Pass `--allowedTools WebSearch,WebFetch` to pre-load them (if supported in pipe mode)
- Add `ToolSearch` to the system prompt instructions so Claude knows to discover web tools
- Investigate whether deferred tool discovery works differently in pipe mode vs interactive mode
