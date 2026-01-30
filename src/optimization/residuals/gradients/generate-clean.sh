#!/bin/bash
# Generate clean TypeScript gradient functions from all .gs files
# Strips warning messages that gradient-script outputs to stderr

GRADIENT_DIR="src/optimization/residuals/gradients"
GS_CLI="node /c/Dev/gradient-script/dist/cli.js"

echo "Generating clean gradient functions..."

for gsfile in "$GRADIENT_DIR"/*.gs; do
  if [ -f "$gsfile" ]; then
    basename=$(basename "$gsfile" .gs)
    outfile="$GRADIENT_DIR/${basename}-gradient.ts"
    # Generate only stdout (the actual code), ignore stderr (warnings)
    $GS_CLI "$gsfile" 2>/dev/null > "$outfile"
    echo "  $basename.gs -> ${basename}-gradient.ts"
  fi
done

echo "Done! Generated $(ls -1 "$GRADIENT_DIR"/*-gradient.ts 2>/dev/null | wc -l) files."
