/**
 * Seeded Pseudo-Random Number Generator
 *
 * Provides deterministic random numbers for reproducible optimization results.
 * Uses a Linear Congruential Generator (LCG) algorithm.
 *
 * Usage:
 *   import { random, setSeed, getSeed } from './seeded-random'
 *
 *   setSeed(42)  // Set seed before optimization
 *   const value = random()  // Get next random number [0, 1)
 */

let state = Date.now()

/**
 * Set the random seed for reproducible results.
 * Call this before optimization to get deterministic behavior.
 */
export function setSeed(seed: number): void {
  state = seed | 0
}

/**
 * Get the current seed/state (useful for debugging).
 */
export function getSeed(): number {
  return state
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
