#!/bin/bash
# Sync current worktree branch through main
# Usage: bash sync-worktrees.sh

set -e  # Exit on any error

MAIN_BRANCH="main"

echo "=== Syncing current branch through $MAIN_BRANCH ==="

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

# Commit current changes if any
if [[ -n $(git status -s) ]]; then
    echo "Committing current changes..."
    git add .
    git commit -m "WIP: auto-commit before sync"
fi

# Push current branch
echo "Pushing $CURRENT_BRANCH..."
git push origin $CURRENT_BRANCH

# Fetch all latest changes
echo "Fetching latest changes..."
git fetch origin

# Merge main into current branch
echo "Merging $MAIN_BRANCH into $CURRENT_BRANCH..."
git merge origin/$MAIN_BRANCH -m "Sync: merge $MAIN_BRANCH into $CURRENT_BRANCH"

# Push updated current branch
echo "Pushing updated $CURRENT_BRANCH..."
git push origin $CURRENT_BRANCH

echo "=== Sync complete for $CURRENT_BRANCH! ==="
