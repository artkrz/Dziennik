# Repository conventions

Rules for AI assistants working in this repository. They override default
behaviour and any general guidance that contradicts them.

## Language

**English** for everything a developer reads: code, identifiers, comments,
commit messages, branch names, PR titles and descriptions, CI configuration
and its output, and design notes under `docs/`.

**Polish** for two things only:

- **The application UI** — every user-facing string in `app/frontend`. The
  users are Polish parents.
- **`README.md`** — written for those same people, so they can decide whether
  to run this at all.

**Polish that is data, not prose, and must not be translated:** patterns that
match Librus's own Polish content. The reply-prefix regex in
`app/backend/src/threads.js` (`re|odp|fw|fwd|pd|odpowiedź`) matches real
subject lines; "translating" it silently breaks message threading. The same
applies to any selector or marker keyed to Librus's markup.

## Git

- **Never commit directly to `master`.** Create a branch first.
- Branch names: short, descriptive, kebab-case. No `feature/`, `release/` or
  `hotfix/` prefixes. One task per branch.
- **A pull request is the only way work reaches `master`.** Do not merge
  locally into it, and do not push to it.
- **Ask before opening a PR.** Never ask about merging into `master` or
  pushing to it — those are not options to offer.

## Subagents

Use the subagent workflow by default. No need to ask first.

## Verification

Claims of success need evidence. The suites and CI exist because this project
has already shipped a bug that 94 passing backend tests could not see — a
successful HTTP 200 carrying empty data. Run the thing, read the output, and
say what actually happened rather than what should have happened.
