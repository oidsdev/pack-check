# Pack Check on pull requests

Example workflow: [example-pack-check.yml](.github/workflows/example-pack-check.yml).

Copy it to `.github/workflows/pack-check.yml` in the repository that holds your prompt packs. The file in this repository sits under `docs/`, so GitHub does not run it here. On a pull request that touches `packs/`, the job checks each markdown file, posts the report as a pull request comment, and fails if a pack has a missing section or a red flag.

The runner is [github-action/check.mjs](github-action/check.mjs). It boots `app.js` the same way the tests do, through `window.__packCheck`. It does not start a server and it does not send the pack anywhere.

## Secrets

None. Do not add a personal access token, an API key, or any other repository secret.

The checker only reads markdown under `packs/`. Posting the comment uses the `GITHUB_TOKEN` Actions creates for the job. You do not add that token as a secret. The workflow sets:

- `contents: read` for the checkout
- `pull-requests: write` so that token can post and update one comment

## Trigger

`pull_request`, types `opened`, `synchronize`, and `reopened`, limited to:

- `packs/**`
- `.github/workflows/pack-check.yml`

A pull request that does not touch those paths does not run the job. To also run on pushes to the default branch, add a `push` trigger with the same `paths` list. The comment step only runs for `pull_request`.

Fork pull requests: the default token cannot write comments on a fork. The comment step is skipped when the head repository is not this one. The check still runs, and critical findings still fail the job.

## What fails the job

Critical (job fails):

- A section marked Missing
- Any red flag: win-rate theater, martingale language, track-record fabrication, no disclosure, or no stop-loss language
- A file under 50 characters (the page refuses these too)

Not critical (job stays green):

- A section marked Weak. The comment still lists it.
- A pull request with no markdown under `packs/`

Marks in the comment match Copy report on the page: `[x]` pass, `[~]` weak, `[ ]` missing. A later push to the same pull request updates that comment. The body starts with an HTML marker, `<!-- pack-check-report -->`, so the job can find it.

## Walkthrough

1. In the packs repository, add a markdown file under `packs/`. Use the blank template from the Pack Check page, or a pack you already have.
2. Copy `docs/.github/workflows/example-pack-check.yml` from this repository to `.github/workflows/pack-check.yml` in the packs repository. The `paths` filter expects that filename.
3. Leave the second checkout (`repository: oidsdev/pack-check`) in place. `npm ci` in that checkout installs `jsdom` (a devDependency; do not pass `--omit=dev`). The job runs `node docs/github-action/check.mjs` with `PACK_DIR` set to your `packs/` directory. Set the checkout `ref` to a commit if you do not want the default branch.
4. Open a pull request that adds or edits a file under `packs/`.
5. In the Actions tab, open the Pack Check run. The Check packs job checks out your repository and pack-check, runs `npm ci` in the pack-check checkout, then runs the checker. Annotations on the run name the file when something is missing or flagged.
6. On the pull request, open the comment headed "Pack Check report". The table lists each file, its score, and pass or fail. Under that, each file has the verdict, the seven section lines, and any red-flag quotes.
7. If a pack failed, the last step exits 1 and the job is red. Edit the pack and push. The same comment updates. When no file is critical, that step is skipped and the job is green.
8. Run the same check locally from a checkout of this repository:

```sh
npm ci
node docs/github-action/check.mjs packs
```

Pass files or directories as arguments. With no arguments, the script checks `packs/` in the current directory, or `PACK_DIR` if that variable is set. Exit 0 means nothing critical. Exit 1 means at least one critical finding. The markdown report is written to `pack-check-report.md`, or to `REPORT_PATH` if set.

## Same repository

If the packs live in this repository, replace the pack-check checkout, its install step, and the run step with:

```yaml
      - name: Install dependencies
        run: npm ci

      - name: Run pack-check
        id: check
        continue-on-error: true
        env:
          PACK_DIR: packs
          REPORT_PATH: pack-check-report.md
        run: node docs/github-action/check.mjs
```

Point the comment step's `REPORT_PATH` at `pack-check-report.md` in the workspace. Keep the fail step as written.
