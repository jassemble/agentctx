Rollback to a previous checkpoint.

## Steps

1. List available checkpoints:
   ```bash
   git tag -l "cp-*" --sort=-creatordate
   ```
   - If no checkpoints exist, tell the user and suggest running `/checkpoint` first

2. Determine which checkpoint to restore:
   - If argument provided, use it: $ARGUMENTS
     - Verify the tag exists: `git tag -l "{argument}"`
     - If the argument doesn't start with `cp-`, try prepending it: `cp-{argument}`
     - If the tag doesn't exist, show available checkpoints and stop
   - If no argument, show the list of checkpoints with their dates and commit messages:
     ```bash
     git tag -l "cp-*" --sort=-creatordate --format="%(refname:short) — %(creatordate:short) — %(contents:subject)"
     ```
     Ask the user to pick one

3. Show what will change:
   ```bash
   git log --oneline {checkpoint-tag}..HEAD
   ```
   - Print the number of commits that will be undone
   - Warn the user this is destructive

4. Before rollback, create a safety checkpoint:
   - Generate name: `pre-rollback-{timestamp}` where timestamp is `YYYYMMDD-HHmmss`
   - Stage all changes: `git add -A`
   - Commit (if there are changes): `git commit -m "checkpoint: pre-rollback safety save"`
   - Tag: `git tag cp-pre-rollback-{timestamp}`
   - Print: "Safety checkpoint created: cp-pre-rollback-{timestamp}"

5. Perform the rollback:
   ```bash
   git reset --hard {checkpoint-tag}
   ```

6. Print confirmation:
   ```
   Rolled back to: {checkpoint-tag}
   Commits undone: {count}

   Your pre-rollback state is saved at: cp-pre-rollback-{timestamp}
   To undo this rollback:
     /rollback cp-pre-rollback-{timestamp}
   ```

## Important
- Always create a safety checkpoint before rollback — never lose work
- `git reset --hard` discards uncommitted changes, which is why we stage and commit first
- The safety checkpoint ensures rollback is always reversible
- If the user has uncommitted changes that they haven't checkpointed, warn them before proceeding
