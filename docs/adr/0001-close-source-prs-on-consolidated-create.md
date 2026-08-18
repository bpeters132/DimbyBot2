# Close Source PRs when the Integration Branch pull request is created

We review Cursor and Dependabot changes as one Integration Branch PR from current `main`, not by merging Source PRs one-by-one. As soon as that consolidated PR exists, each Source PR is commented `Superseded by #N` and closed (Supersede on create). That keeps a single review unit for CodeRabbit and humans, and it prevents a leftover draft from landing after the batch already contains its commits. Keeping Source PRs open until the consolidated PR merges was rejected because those drafts can still be merged individually.
