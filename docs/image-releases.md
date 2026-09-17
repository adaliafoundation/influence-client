# Image releases and deployment requests

Server and client use the same release entry points:

| Actions workflow | Trigger | GitHub environment | Image tags |
| --- | --- | --- | --- |
| Release prerelease image | Push to main or manual run on main | prerelease | stack-prerelease-COMMIT and stack-prerelease |
| Release production image | Manual run on main with a full main-history commit SHA | production | production-COMMIT, production, latest |

`docker-stack-prerelease.yaml` calls `docker-release.yaml` with `channel: prerelease`.
The manual entry point defaults to production. Tests, image scans, smoke checks,
and signing precede channel promotion. The same commit can be released separately
in both channels; immutable channel/commit tags cannot be overwritten. If publication succeeded
but the webhook failed, use the published digest and inspect the host before
retrying deployment; a full release rerun refuses to overwrite the immutable tag.

The environment job is named **Publish prerelease image and request deployment**
or **Publish production image** in both repositories. Configure each GitHub
environment to allow the main branch. Keep production's required reviewers;
prerelease should have no reviewers or wait timer for automatic releases.

In the prerelease environment, configure variable `STACK_PRERELEASE_WEBHOOK_URL`
and secret `STACK_PRERELEASE_WEBHOOK_TOKEN` when the host is ready. Leave the URL
unset during initial host preparation. Environment variables and secrets are
available to the environment job, not the image build jobs.

Only a release matching the current head of main advances the prerelease alias.
The notification step also checks that the alias still matches its image digest.
A blank webhook URL skips notification while still publishing the image.

A green GitHub environment entry means publication and any configured deployment
request succeeded. The webhook only acknowledges the request; it does not wait
for the host's integration tests, backup, container updates, or health checks.
Check the host's journal and stack status to confirm deployment completion.
Production host deployment remains manual using the released immutable digest.

## Existing client releases

Previously published `release-COMMIT` tags remain valid immutable deployment
references. New releases use channel-specific tags so releasing a commit to
prerelease does not prevent a later production release of that commit. The
production/latest aliases are now explicitly promoted by the production job;
production hosts remain pinned until an operator updates them.
