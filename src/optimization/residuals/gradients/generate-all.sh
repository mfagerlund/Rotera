#!/bin/bash
# Generate TypeScript gradient functions from all .gs files
# Run from the Rotera project root

GRADIENT_DIR="src/optimization/residuals/gradients"
GS_CLI="node /c/Dev/gradient-script/dist/cli.js"

echo "Generating gradient functions..."

for gsfile in "$GRADIENT_DIR"/*.gs; do
  if [ -f "$gsfile" ]; then
    basename=$(basename "$gsfile" .gs)
    outfile="$GRADIENT_DIR/${basename}-gradient.ts"
    echo "  $basename.gs -> ${basename}-gradient.ts"
    $GS_CLI "$gsfile" > "$outfile" 2>/dev/null
  fi
done

echo "Done! Generated $(ls -1 "$GRADIENT_DIR"/*-gradient.ts 2>/dev/null | wc -l) files."
