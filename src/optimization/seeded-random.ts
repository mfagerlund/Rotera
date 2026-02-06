/**
 * Seeded Pseudo-Random Number Generator
 *
 * Provides deterministic random numbers for reproducible optimization results.
 * Uses a Linear Congruential Generator (LCG) algorithm.
 *
 * Two modes of usage:
 *   1. Global functions: random(), randomRange(), randomInt() - shared state
 *   2. Scoped instances: createRng(offset) - independent streams per phase
 *
 * Scoped RNG isolates random streams so that changes in one phase
 * (e.g., adding a world point) don't shift the random sequence in another.
 */

let masterSeed = 42
let state = Date.now()

/**
 * Independent random number generator with its own LCG state.
 * Created via createRng(offset) for phase-isolated random streams.
 */
export class SeededRng {
  private state: number

  constructor(seed: number) {
    this.state = seed | 0
  }

  random(): number {
    this.state = (this.state * 1664525 + 1013904223) | 0
    return (this.state >>> 0) / 0x100000000
  }

  randomRange(min: number, max: number): number {
    return min + this.random() * (max - min)
  }

  randomInt(min: number, max: number): number {
    return Math.floor(min + this.random() * (max - min + 1))
  }
}

/**
 * Create a scoped RNG instance seeded from masterSeed + offset.
 * Each phase uses a unique offset to get an independent stream.
 */
export function createRng(offset: number = 0): SeededRng {
  return new SeededRng(masterSeed + offset)
}

/**
 * Set the random seed for reproducible results.
 * Call this before optimization to get deterministic behavior.
 */
export function setSeed(seed: number): void {
  masterSeed = seed
  state = seed | 0
}

/**
 * Generate a random number in [0, 1) using LCG algorithm.
 * Replace Math.random() calls with this for reproducible results.
 */
export function random(): number {
  // LCG parameters (same as glibc)
  state = (state * 1664525 + 1013904223) | 0
  return (state >>> 0) / 0x100000000
}

/**
 * Generate a random number in a range [min, max).
 */
export function randomRange(min: number, max: number): number {
  return min + random() * (max - min)
}

/**
 * Generate a random integer in [min, max] (inclusive).
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(min + random() * (max - min + 1))
}
