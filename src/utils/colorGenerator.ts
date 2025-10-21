const PREDEFINED_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2',
  '#F8B739',
  '#52B788',
  '#E63946',
  '#A8DADC',
  '#457B9D',
  '#F1FAEE',
  '#E76F51',
  '#2A9D8F',
  '#E9C46A',
  '#F4A261',
  '#264653'
]

export function generateWorldPointColor(index: number): string {
  if (index < PREDEFINED_COLORS.length) {
    return PREDEFINED_COLORS[index]
  }

  const hue = (index * 137.508) % 360
  const saturation = 70 + (index % 3) * 10
  const lightness = 50 + (index % 2) * 10

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}
