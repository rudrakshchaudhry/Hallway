---
name: ship-pr
description: Verify the current change, open a small PR, wait for Qodo's review and address it
---
1. Run pnpm typecheck, pnpm lint and pnpm test. Fix every failure.
2. Run the reviewer subagent. Fix high and medium findings. If the change touches
   apps/web UI, also run the ui-verifier subagent at 390x844 and fix what it reports.
3. Commit with a conventional message, push the branch, and run gh pr create with a
   description in three parts: What, Why, How tested.
4. Wait about 3 minutes, then read Qodo's review with gh pr view --comments. For each
   finding, fix it in a new commit that names it, or reply with why not.
   Append each real fix to docs/QODO_CATCHES.md (PR link, finding, fix).
5. Tell the human the PR is ready to merge. Do not merge it yourself.
