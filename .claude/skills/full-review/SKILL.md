---
name: full-review
description: Use when the user asks for a full or complete code review of the Into The Fray project, a cleanup pass over the whole repository (Go backend, Svelte web app, card packs, build and CI), or to run the full review again.
---

# Full review

Runs a complete review of the repository (simplification, dead code,
accuracy of the docs and memory against the code, duplication across
modules and between Go and TypeScript, workaround cleanup, every
recommendation applied). The review instructions are in `brief.md`, next to
this file; this file decides where the review runs.

## Where it runs

- **Casper available** (`$CASPER_WORKSPACE_ID` set and `casper` on the
  `PATH`): delegated to a separate Claude Code instance in a new Casper
  workspace, while this session waits and reports. Follow "Delegated" below.
- **Otherwise**: in the foreground, in this session and this checkout, on
  the current branch: no worktree, no `casper` call, no background agent
  running the whole review (the reviewer and code-writer subagents the
  brief calls for are expected). Read `brief.md` and follow it yourself, in
  its foreground mode (its placeholders stay unfilled).

## Delegated

1. **Base**: `main`, unless the user names another ref. Check that the
   checkout holding it has no uncommitted changes the review should see
   (the workspace only gets committed work): find its path in
   `git worktree list`, then run `git -C <that path> status --porcelain`.
2. **Prompt file and instance**, in one Bash call: shell variables do not
   survive from one call to the next. The call writes the prompt file
   outside the repository with the placeholders filled, then creates a
   workspace on branch `review-$stamp` that launches Claude Code on it.
   Read the `casper` skill's workspace reference first. Set `base` to the
   chosen ref:

   ```bash
   base=main
   stamp="$(date +%Y%m%d-%H%M%S)"
   prompt="/tmp/intothefray-review-$stamp.md"
   done_file="/tmp/intothefray-review-$stamp.done"
   brief="$(git rev-parse --show-toplevel)/.claude/skills/full-review/brief.md"
   sed -e "s|{{DONE_FILE}}|$done_file|g" -e "s|{{BASE}}|$base|g" \
     "$brief" > "$prompt"
   casper workspace new "review-$stamp" --base "$base" \
     --command "claude \"Read the instructions in $prompt and follow them.\""
   echo "base=$base stamp=$stamp done_file=$done_file"
   ```

   Note the values the last line prints, and the `path` the `casper`
   command prints (the review worktree): the next steps use them
   literally. Casper runs the `setup` script of `.casper.json`
   (`scripts/casper.sh setup`): it writes the workspace's own ports to
   `.env.casper`, so its dev stack collides with no other one, and installs
   the web and Go dependencies. If `casper workspace new` fails, tell the
   user and offer to run the review in the foreground instead.
3. **Watch**: a background Bash command that ends when the file is written,
   so this session is woken up, plus the sidebar progress bar (the task
   tool if this harness has one, otherwise the `casper` skill's progress
   reference), cleared when `DONE` arrives:

   ```bash
   until [ -s "<done_file>" ]; do sleep 60; done; sleep 5; cat "<done_file>"
   ```

   The review takes hours: parallel reviewers, then one code-writer per
   fix, each one verified.
4. **When the file arrives**, run
   `casper notify --message="The full review needs your attention"`, then:
   - first line `DONE`: verify on the review branch
     (`git log <base>..review-<stamp>`,
     `git -C <worktree> status --porcelain` empty,
     `make -C <worktree> check`), then relay the report's sections to the
     user, starting with the main findings, the user-visible changes, the
     manual checks and the open questions. Do not merge: the user decides.
     The workspace's containers stay up until it is deleted (its
     `teardown` script stops them).
   - first line `BLOCKED`: tell the user what the instance needs (it waits
     for the answer in its own session) and run `casper status set
     blocked`. Keep the progress bar up and watch again: the instance
     overwrites the same file, which is no longer empty, so wait for it to
     change:

     ```bash
     m="$(stat -f %m "<done_file>")"
     until [ "$(stat -f %m "<done_file>")" != "$m" ]; do sleep 60; done
     sleep 5; cat "<done_file>"
     ```

## Common mistakes

- Passing the brief inline in `--command`: it is retyped as keystrokes, so
  quotes and newlines break. Always go through the prompt file.
- Putting the prompt file inside the repository: it could get committed.
- Splitting step 2 over several Bash calls: `$prompt` and `$done_file` are
  empty in the later ones.
- Without Casper, reaching for a worktree: the review runs here, in the
  foreground.
- Reviewing a stale base: merge or commit pending work on `main` first.
- Looking for `docs/` in the review worktree: it is gitignored and lives in
  the main checkout only; `brief.md` says how to reach it.
