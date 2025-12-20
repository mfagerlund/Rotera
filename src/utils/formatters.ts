/**
 * Format a 3D coordinate array for display.
 * Uses brackets and dashes for null values: [0.00, -, 0.00]
 */
export function formatXyz(
  xyz: [number | null, number | null, number | null] | null | undefined,
  decimals: number = 2
): string {
  if (!xyz) return '-'
  if (xyz.every(v => v === null)) return '-'
  return '[' + xyz.map(v => v !== null ? v.toFixed(decimals) : '-').join(', ') + ']'
}
