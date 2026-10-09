#!/usr/bin/env bash
# The catalog's working state (what the weekly rebuild, the contributions run and the daily job
# index carry from one run to the next), kept as the "state" release of $DATA_REPO.
#
#   state.sh restore   download and unpack it; fails if it exists but can't be downloaded.
#                      Sets the step output restored=true|false.
#   state.sh save      pack and upload it; every workflow saves the same files, so none wipes another's
#
# Needs GH_TOKEN and DATA_REPO. Run from the repo root.
set -euo pipefail

output() { if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "$1" >> "$GITHUB_OUTPUT"; fi; }

cd scripts/catalog
TARBALL="${RUNNER_TEMP:-/tmp}/catalog-state.tar.gz"

# Every file any run keeps. Missing ones are skipped.
FILES=(
  out/checks.jsonl
  out/index-all.jsonl
  out/index-etags.json
  out/resolved.json
  out/resolved-bulk.json
  out/probe.jsonl
  out/probe-found.json
  raw/commoncrawl/boards.json
  raw/wayback/boards.json
)

case "${1:-}" in
  restore)
    if ! gh release view state -R "$DATA_REPO" > /dev/null 2>&1; then
      echo "No saved state yet: this run starts from scratch (slow, once)."
      output restored=false
      exit 0
    fi
    # The state exists: failing to fetch it must stop the run, or its save would overwrite good state.
    gh release download state -R "$DATA_REPO" -p catalog-state.tar.gz -D "$(dirname "$TARBALL")" --clobber
    tar xzf "$TARBALL"
    echo "Restored the saved state."
    output restored=true
    ;;
  save)
    [ -d out ] || { echo "Nothing to save."; exit 0; }
    (cd ../.. && pnpm exec tsx scripts/catalog/compact.ts)
    present=()
    for f in "${FILES[@]}"; do if [ -f "$f" ]; then present+=("$f"); fi; done
    tar czf "$TARBALL" "${present[@]}"
    gh release view state -R "$DATA_REPO" > /dev/null 2>&1 ||
      gh release create state -R "$DATA_REPO" --prerelease --title "Catalog working state" --notes "Internal: lets the catalog runs skip boards checked recently."
    gh release upload state "$TARBALL" -R "$DATA_REPO" --clobber
    echo "Saved: ${present[*]}"
    ;;
  *)
    echo "usage: state.sh restore|save" >&2
    exit 2
    ;;
esac
