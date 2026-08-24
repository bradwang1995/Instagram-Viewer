# Repository Release Instructions

- After every completed repository change, run the relevant validation, commit all in-scope changes, push the current branch, and redeploy through the repository's configured deployment workflow.
- Treat this as standing authorization for commit, push, and redeploy; do not ask for separate confirmation each time.
- Wait for the deployment to finish and verify the production result before reporting completion.
- Preserve unrelated user changes and never include them in a release unless the user explicitly places them in scope.
- If validation, credentials, branch protection, push, deployment, or production verification blocks the release, report the exact blocker instead of claiming completion.
