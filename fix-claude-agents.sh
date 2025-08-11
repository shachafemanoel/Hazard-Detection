#!/usr/bin/env bash
set -euo pipefail

say() { printf "👉 %s\n" "$*"; }
ok()  { printf "✅ %s\n" "$*"; }
warn(){ printf "⚠️  %s\n" "$*"; }

ROOT="$(pwd)"
ME="$(basename "$ROOT")"

# 1) Ensure target folder exists
mkdir -p ".claude/agents"

# 2) If a nested "<repo>/<repo>/.claude/agents" exists, move files up
if [ -d "$ME/.claude/agents" ]; then
  say "Found nested $ME/.claude/agents → moving its files to .claude/agents/"
  shopt -s nullglob
  for f in "$ME/.claude/agents/"*; do
    base="$(basename "$f")"
    if [ -e ".claude/agents/$base" ]; then
      # choose the newer file to keep
      if [ "$f" -nt ".claude/agents/$base" ]; then
        mv -f "$f" ".claude/agents/$base"
        say "Replaced newer: $base"
      else
        say "Keeping existing: $base (older nested skipped)"
      fi
    else
      mv "$f" ".claude/agents/"
      say "Moved: $base"
    fi
  done
  shopt -u nullglob

  # Try to remove empty leftovers
  rmdir "$ME/.claude/agents" 2>/dev/null || true
  rmdir "$ME/.claude" 2>/dev/null || true
  rmdir "$ME" 2>/dev/null || true
fi

# 3) Also rescue agents from any other accidental nested dirs (defensive)
find . -type d -path "./*/.claude/agents" ! -path "./.claude/agents" | while read -r dir; do
  say "Rescuing agents from $dir"
  shopt -s nullglob
  for f in "$dir"/*; do
    base="$(basename "$f")"
    if [ -e ".claude/agents/$base" ]; then
      if [ "$f" -nt ".claude/agents/$base" ]; then
        mv -f "$f" ".claude/agents/$base"; say "Replaced newer: $base"
      else
        say "Keeping existing: $base"
      fi
    else
      mv "$f" ".claude/agents/"; say "Moved: $base"
    fi
  done
  shopt -u nullglob
  # attempt to clean empty parents
  rmdir "$dir" 2>/dev/null || true
  parent="$(dirname "$dir")"
  rmdir "$parent" 2>/dev/null || true
done

# 4) Optional: scrub stray literal "EOF" lines that might have been written into files
scrub_count=0
for md in .claude/agents/*.md; do
  [ -f "$md" ] || continue
  if tail -n 1 "$md" | grep -qx 'EOF'; then
    say "Scrubbing trailing EOF in $md"
    # remove only the LAST line if it's exactly 'EOF'
    tmp="$md.tmp.$$"
    head -n -1 "$md" > "$tmp"
    mv "$tmp" "$md"
    scrub_count=$((scrub_count+1))
  fi
done
[ "$scrub_count" -gt 0 ] && ok "Scrubbed EOF in $scrub_count file(s)"

# 5) Show result
ok "Final agent files:"
ls -1 .claude/agents || true
ok "Done."
