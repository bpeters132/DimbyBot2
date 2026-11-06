# Dependabot alerts without a Source PR use a Security Branch

ADR 0001 still governs Source PRs: cherry-pick them onto one Integration Branch and Supersede them when that pull request is created. A Source PR may be human-authored. The Cursor and Dependabot examples in ADR 0001 are not an allow-list. Dependabot alerts that have no Source PR are not cherry-picked. They are fixed with human-authored dependency bumps on a Security Branch so the two review units revert independently. Putting those bumps on the Integration Branch was rejected because there are no commits to cherry-pick.
