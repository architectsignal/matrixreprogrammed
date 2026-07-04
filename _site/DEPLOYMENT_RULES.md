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
