Create a named checkpoint (commit + tag) for easy rollback.

## Steps

1. Determine the checkpoint name:
   - If argument provided, use it: $ARGUMENTS
   - Otherwise, auto-generate from the current branch name and timestamp:
     - Get branch: `git branch --show-current`
     - Get timestamp: current date/time as `YYYYMMDD-HHmmss`
     - Name: `{branch}-{timestamp}` (replace `/` with `-` in branch name)

2. Sanitize the name: replace spaces and special characters with hyphens, lowercase everything

3. Stage all changes:
   ```bash
   git add -A
   ```

4. Check if there are staged changes to commit:
   ```bash
   git diff --cached --quiet
   ```
   - If no changes, print "No changes to checkpoint" and stop
   - If there are changes, proceed

5. Create the commit:
   ```bash
   git commit -m "checkpoint: {name}"
   ```

6. Create the git tag:
   ```bash
   git tag "cp-{name}"
   ```

7. Print confirmation:
   ```
   Checkpoint created: {name}
   Commit: {short-hash}
   Tag: cp-{name}

   To rollback to this point later:
     /rollback cp-{name}

   Or manually:
     git reset --hard cp-{name}
   ```

## Important
- Checkpoints are local-only — they are not pushed to remote
- Tag names must be valid git ref names (no spaces, no `..`, no `~`, etc.)
- If the tag already exists, append a counter: `cp-{name}-2`, `cp-{name}-3`, etc.
- This command is non-destructive — it only adds a commit and tag on top of current state
