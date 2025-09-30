#!/bin/bash
# Sync both worktrees through main
# Usage: bash sync-worktrees.sh

set -e  # Exit on any error

WORKTREE1="C:/Dev/Pictorigo-oddjob"
WORKTREE2="C:/Dev/Pictorigo-scaramanga"
MAIN_WORKTREE="C:/Dev/Pictorigo"
MAIN_BRANCH="main"

sync_worktree() {
    local worktree=$1
    echo ""
    echo "=== Syncing $worktree ==="
    cd "$worktree"

    local branch=$(git branch --show-current)
    echo "Current branch: $branch"

    # Commit current changes if any
    if [[ -n $(git status -s) ]]; then
        echo "Committing current changes..."
        git add .
        git commit -m "WIP: auto-commit before sync"
    fi

    # Push current branch
    echo "Pushing $branch..."
    git push origin $branch
}

echo "=== Starting full worktree sync ==="

# Sync both feature branches
sync_worktree "$WORKTREE1"
sync_worktree "$WORKTREE2"

# Update main
echo ""
echo "=== Updating main branch ==="
cd "$MAIN_WORKTREE"
git fetch origin
git merge origin/Pictorigo-oddjob -m "Sync: merge Pictorigo-oddjob into main"
git merge origin/Pictorigo-scaramanga -m "Sync: merge Pictorigo-scaramanga into main"
git push origin main

# Pull main back into both branches
cd "$WORKTREE1"
echo ""
echo "=== Updating Pictorigo-oddjob from main ==="
git fetch origin
git merge origin/$MAIN_BRANCH -m "Sync: merge main into Pictorigo-oddjob"
git push origin Pictorigo-oddjob

cd "$WORKTREE2"
echo ""
echo "=== Updating Pictorigo-scaramanga from main ==="
git fetch origin
git merge origin/$MAIN_BRANCH -m "Sync: merge main into Pictorigo-scaramanga"
git push origin Pictorigo-scaramanga

echo ""
echo "=== Full sync complete! ==="
