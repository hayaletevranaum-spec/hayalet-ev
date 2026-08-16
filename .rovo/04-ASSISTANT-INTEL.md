# Assistant Intel

Hayalet Ev uses local code intelligence as an assistant comfort layer. The current core is `codebase-memory-mcp`, but it is invoked through `scripts/assistant-intel.mjs` instead of the upstream installer so project rules, MCP config, hooks, and AGENTS.md stay under our control.

## Commands

- `npm run intel:setup` downloads the pinned local binary into `data/assistant-intel/bin/`.
- `npm run intel:index` indexes the repository into `data/assistant-intel/cache/codebase-memory-mcp`.
- `npm run intel:projects` lists indexed projects.
- `npm run intel:search -- "memory bootstrap policy"` runs graph-backed discovery.
- `npm run intel:search -- memory bootstrap policy --path mcp-server --limit 8` searches a subproject; missing subproject indexes are created on demand.
- `npm run intel:trace -- registerAllTools --path mcp-server` traces callers and callees.
- `npm run intel:changes` maps dirty files to indexed symbols.

## Why Not The Upstream Installer

The upstream installer can write MCP entries, hooks, skills, and assistant instruction files for several agents. That is useful in a blank project, but Hayalet Ev already has its own mode protocol, memory layer, and AGENTS.md approval rules. This wrapper keeps the engine local and fast while leaving integration choices explicit.

## Retired Metadata

The old generated comment index, DOM manifest, system snapshot, version snapshot, and context pack were retired after the code graph became the primary navigation layer. Use `npm run intel:search`, `npm run intel:trace`, and runtime MCP discovery instead of regenerating those projections.

`.rovo/_metadata/CHARACTER.md` remains user-authored runtime profile data.
