/** Map-space artwork geometry and pointer hit testing; server world.py owns game adjacency. */
export const WORLD_WIDTH = 960
export const WORLD_HEIGHT = 600
export const REGION_IDS = [
  'highlands', 'north', 'northeast',
  'west', 'capital', 'east',
  'forest', 'south', 'bay',
]
// Shared corner coordinates keep province borders watertight.
const CORNERS = [
  [[85, 110], [352, 72], [628, 92], [871, 112]],
  [[66, 234], [365, 221], [611, 245], [896, 233]],
  [[86, 386], [345, 395], [640, 380], [881, 388]],
  [[97, 515], [351, 541], [619, 520], [866, 503]],
]
export function edge(row: number, col: number, direction: 'right' | 'down'): number[] {
  const start = direction === 'right' ? CORNERS[row][col + 1] : CORNERS[row + 1][col]
  const end = CORNERS[row + 1][col + 1]
  return [...start, ...end]
}
export const REGIONS = Object.fromEntries(REGION_IDS.map((id, index) => {
  const row = Math.floor(index / 3)
  const col = index % 3
  return [id, [CORNERS[row][col], CORNERS[row][col + 1], CORNERS[row + 1][col + 1], CORNERS[row + 1][col]].flat()]
})) as Record<string, number[]>
export function insidePolygon(x: number, y: number, polygon: number[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
    const xi = polygon[i], yi = polygon[i + 1]
    const xj = polygon[j], yj = polygon[j + 1]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
