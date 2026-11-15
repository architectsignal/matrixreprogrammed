# Deployment Rules

Production deploys are gated.

## Rule

Do not deploy production until the page or site has been tested and is working.

## Workflow

1. Make changes on a non-production branch.
2. Run the `Test Site` GitHub Action.
3. Confirm the full build and pressure tests pass.
4. Review the generated `_site` artifact if needed.
5. Run `Deploy Production` manually only after tests pass.
6. Type `DEPLOY` in the workflow confirmation field.

## Cloudflare setting required

Cloudflare automatic builds from GitHub should be disabled, or production should be moved away from automatic pushes to `main`.

Recommended production model:

- GitHub Actions runs tests on branches and pull requests.
- GitHub Actions manual `Deploy Production` workflow performs the Cloudflare deploy.
- Cloudflare should not auto-deploy every push to `main`.

## Required GitHub secrets

Set these repository secrets before using the deploy workflow:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The deploy workflow will not deploy unless the build and pressure tests pass first.

## Scheduled GitHub Actions maintenance

GitHub automatically disables scheduled workflows in a public repository after 60 days without repository activity. Scheduled runs alone do not keep the repository active. See [GitHub's workflow guidance](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

When GitHub sends an inactivity warning:

1. Check the repository's last push and the affected workflow states. For this repository, `gh api repos/architectsignal/matrixreprogrammed --jq .pushed_at` and `gh workflow list --all` show those facts.
2. Make a real, reviewed source or documentation improvement on a branch and merge it into `main` before the inactivity cutoff. Do not dispatch a production deploy or weaken an audit to address the warning.
3. Confirm that the repository's `pushed_at` time advanced and the affected workflows are still active. If a workflow was already disabled, run `gh workflow enable WORKFLOW_FILE` and verify its next scheduled run.
4. Treat workflow activation and audit success separately. Investigate failed checks under their normal evidence and release gates.
