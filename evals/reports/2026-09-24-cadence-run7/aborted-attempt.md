# Cadence run 7 — the aborted first attempt

A first launch of run 7 (2026-09-24, same model and subject) was stopped before it built
anything: `--allowedTools` alone left web and subagent tools live in `auto` mode. The standard
now sets `--tools`, `--permission-mode acceptEdits`, `--permission-prompts none` and
`--strict-mcp-config` (`evals/craft/launch.sh`). Nothing from it is kept.
