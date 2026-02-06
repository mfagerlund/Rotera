import * as vec3 from '../../utils/vec3'
import { random, type SeededRng } from '../seeded-random'

/**
 * Generate a random unit vector (uniformly distributed on the unit sphere)
 */
export function randomUnitVector(rng?: SeededRng): [number, number, number] {
  const r = rng ? () => rng.random() : random
  let vec: [number, number, number]
  let len: number
  do {
    vec = [
      r() * 2 - 1,
      r() * 2 - 1,
      r() * 2 - 1
    ]
    len = vec3.magnitude(vec)
  } while (len === 0 || len > 1)

  return vec3.normalize(vec)
}
