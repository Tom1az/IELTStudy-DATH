# Working with Claude Code on IELTStudy

Claude Code follows the files and settings in this repo. Write a rule down once and it applies in every session, for every teammate.

## Files that control the agent

| File | Scope | What it controls | Committed? |
| --- | --- | --- | --- |
| `CLAUDE.md` | Team | Loaded into every session: project context, repo map, commands, hard rules. **The strongest lever.** | Yes |
| `backend/CLAUDE.md` (and later `frontend/`, `ml/`) | Team, per folder | Extra conventions, loaded when working in that folder | Yes |
| `CLAUDE.local.md` | You only | Personal notes, e.g. "I own the frontend; explain in Vietnamese" | No (gitignored) |
| `.claude/settings.json` | Team | **Permissions** (allow / ask / deny for commands and files) and **hooks** (commands the harness runs automatically, e.g. Prettier after each edit) | Yes |
| `.claude/settings.local.json` | You only | Personal permission overrides | No (gitignored) |
| `.claude/hooks/*.mjs` | Team | Scripts the hooks run | Yes |
| `.claude/commands/*.md` or `.claude/skills/<name>/SKILL.md` | Team | Reusable workflows you trigger with `/name`, e.g. `/new-endpoint` | Yes |
| `.claude/agents/*.md` | Team | Custom subagents with limited tools, e.g. a read-only `db-reviewer` | Yes |
| `.mcp.json` | Team | External tool connections, e.g. a Postgres/Supabase or GitHub MCP server | Yes (no secrets) |
| `docs/ROADMAP.md`, `backend/src/docs/openapi.yaml`, `specs.md` | Team | Source-of-truth documents Claude reads before coding | Yes |

## What the current settings enforce

- **Runs without asking:** `npm run *`, `npm install`, `npm test`, `tsc`, `prisma contract emit`, and read-only git commands.
- **Asks you first:**
  - `git commit`, `git checkout`, `git reset`
  - `prisma db` / `prisma migration`, `psql`
  - editing `schema.prisma`
- **Blocked:** `git push`, `rm -rf`, reading or writing `.env`.
- **Hook:** every file Claude edits under `backend/` is formatted with Prettier.

## Habits that keep you in control

1. **Plan mode first** (Shift+Tab, or `/plan`). Claude researches and proposes, and nothing is edited until you approve.
2. **One roadmap task per session.** Use `/clear` between unrelated tasks so old context doesn't leak in.
3. **Point at a reference.** For example: "follow the pattern in `backend/src/routes/user.ts`". Claude copies existing patterns, so keep the good ones clean.
4. **Tests are the contract.** "Make these tests pass" gives Claude a way to verify itself. "Make it work" doesn't.
5. **Review before merging.** Use `/code-review` and `/security-review` on the branch. Claude commits or pushes only when asked.
6. **Pick the effort level per task** (`/effort`). The table in `CLAUDE.md` → "Effort guide" maps each kind of roadmap task to a level.
7. **Fix the rule, not just the output.** If Claude repeats a mistake, add a line to `CLAUDE.md` so it never happens again.
