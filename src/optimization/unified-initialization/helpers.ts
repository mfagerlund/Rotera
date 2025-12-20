import * as vec3 from '../../utils/vec3'
import { random } from '../seeded-random'

/**
 * Generate a random unit vector (uniformly distributed on the unit sphere)
 */
export function randomUnitVector(): [number, number, number] {
  let vec: [number, number, number]
  let len: number
  do {
    vec = [
      random() * 2 - 1,
      random() * 2 - 1,
      random() * 2 - 1
    ]
    len = vec3.magnitude(vec)
  } while (len === 0 || len > 1)

  return vec3.normalize(vec)
}
