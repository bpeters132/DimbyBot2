# DimbyBot2

Ubiquitous language for this Discord music bot and how change is reviewed. Product terms belong here as they are resolved; this first pass records Contribution vocabulary from PR consolidation.

## Contribution

**Source PR**:
An open bot or automation pull request whose commits are cherry-picked onto the Integration Branch.
_Avoid_: original PR, constituent PR, wave PR

**Integration Branch**:
A `chore/consolidated-<topic>` branch created from current `main`, holding every confirmed Source PR as one review unit.
_Avoid_: wave branch, stack, batch branch

**Supersede**:
Closing a Source PR with a comment that names the Integration Branch pull request as soon as that pull request exists, so Source PRs cannot be merged one-by-one.
_Avoid_: close after merge, leave open
