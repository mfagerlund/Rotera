/**
 * Unified candidate testing system.
 * Replaces the three nested retry mechanisms with a single candidate generation + probe approach.
 *
 * Instead of:
 * - 3 random seed attempts × 4 inference branches × 2 alignment options = up to 24 full solves
 *
 * We now:
 * 1. Generate all candidates upfront (seed × branch × alignment)
 * 2. Run lightweight probes (50-100 iterations) on each
 * 3. Pick best candidate based on probe residual
 * 4. Run FULL optimization only on winner
 */

import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { generateAllInferenceBranches, InferenceBranch } from '../inference-branching';
import { log, logDebug, setCandidateProgress } from '../optimization-logger';
import type { OptimizeProjectOptions } from './types';

/**
 * A candidate represents a specific combination of:
 * - Random seed (for camera perturbation and randomized solves)
 * - Inference branch (sign choices for axis-aligned lines)
 * - Alignment sign (for Essential Matrix ambiguous cases)
 */
export interface OptimizationCandidate {
  seed: number;
  branch: InferenceBranch | null;
  alignmentSign: 'positive' | 'negative' | undefined;
  perturbCameras: number | undefined;
  description: string;
}

/**
 * Result from probing a candidate
 */
export interface ProbeResult {
  candidate: OptimizationCandidate;
  residual: number;
  converged: boolean;
}

/**
 * Generate all candidates to test.
 * Returns a single default candidate if no branching/retry is needed.
 */
export function generateAllCandidates(
  project: Project,
  options: OptimizeProjectOptions
): OptimizationCandidate[] {
  const { maxAttempts = 3, autoInitializeCameras = true, autoInitializeWorldPoints = true } = options;

  // Check if we should skip candidate generation
  // 1. Recursive call (already testing a candidate)
  // 2. No auto-initialization (pure constraint solve - no ambiguity to resolve)
  if (options._skipCandidateTesting || (!autoInitializeCameras && !autoInitializeWorldPoints)) {
    return [{
      seed: options._seed ?? 42,
      branch: options._branch ?? null,
      alignmentSign: options._alignmentSign,
      perturbCameras: options._perturbCameras,
      description: 'single-candidate',
    }];
  }

  const candidates: OptimizationCandidate[] = [];

  // Generate inference branches
  const branches = generateAllInferenceBranches(project);
  const hasMultipleBranches = branches.length > 1;

  // Determine if we might have alignment ambiguity
  // (We won't know for sure until after camera initialization, but we can pre-generate both options)
  // Only count enabled viewpoints
  const viewpointCount = Array.from(project.viewpoints).filter(vp => vp.enabledInSolve).length;
  const mightUseEssentialMatrix = viewpointCount === 2; // Heuristic: EM used for 2-camera case

  // For each random seed / attempt
  const attempts = maxAttempts > 1 ? [1, 2, 3] : [1];

  // For each inference branch (or single default branch)
  const branchesToTest = hasMultipleBranches ? branches : [null];

  for (const attempt of attempts) {
    // Use deterministic seeds like old multi-attempt system
    const seed = attempt === 1 ? 42 : attempt === 2 ? 12345 : 98765 + attempt;
    // Camera perturbation for retry attempts (helps escape local minima in EM cases)
    const perturbScale = attempt > 1 ? 0.5 * attempt : undefined;

    for (const branch of branchesToTest) {
      // For Essential Matrix cases, test both alignment signs
      if (mightUseEssentialMatrix) {
        candidates.push({
          seed,
          branch,
          alignmentSign: 'positive',
          perturbCameras: perturbScale,
          description: makeDescription(seed, branch, 'positive'),
        });

        candidates.push({
          seed,
          branch,
          alignmentSign: 'negative',
          perturbCameras: perturbScale,
          description: makeDescription(seed, branch, 'negative'),
        });
      } else {
        candidates.push({
          seed,
          branch,
          alignmentSign: undefined,
          perturbCameras: perturbScale,
          description: makeDescription(seed, branch, undefined),
        });
      }
    }
  }

  // If only one candidate, don't log as "testing candidates"
  if (candidates.length === 1) {
    return candidates;
  }

  log(`[Candidates] Generated ${candidates.length} candidates (attempts=${attempts.length}, branches=${branchesToTest.length}, alignments=${mightUseEssentialMatrix ? 2 : 1})`);

  return candidates;
}

/**
 * Create a human-readable description for a candidate
 */
function makeDescription(
  seed: number,
  branch: InferenceBranch | null,
  alignmentSign: 'positive' | 'negative' | undefined
): string {
  const parts: string[] = [];

  parts.push(`seed=${seed}`);

  if (branch && branch.choices.length > 0) {
    parts.push(`branch=[${branch.choices.slice(0, 2).join(', ')}${branch.choices.length > 2 ? '...' : ''}]`);
  }

  if (alignmentSign) {
    parts.push(`align=${alignmentSign}`);
  }

  return parts.join(', ');
}

/**
 * Save current project state for restoration
 */
export function saveProjectState(project: Project): {
  worldPoints: Map<WorldPoint, [number, number, number] | undefined>;
  viewpoints: Map<Viewpoint, { position: [number, number, number]; rotation: [number, number, number, number]; focalLength: number }>;
  inferredXyz: Map<WorldPoint, [number | null, number | null, number | null]>;
} {
  const worldPoints = new Map<WorldPoint, [number, number, number] | undefined>();
  const viewpoints = new Map<Viewpoint, { position: [number, number, number]; rotation: [number, number, number, number]; focalLength: number }>();
  const inferredXyz = new Map<WorldPoint, [number | null, number | null, number | null]>();

  for (const wp of project.worldPoints) {
    const point = wp as WorldPoint;
    worldPoints.set(point, point.optimizedXyz ? [...point.optimizedXyz] as [number, number, number] : undefined);
    inferredXyz.set(point, [...point.inferredXyz] as [number | null, number | null, number | null]);
  }

  for (const vp of project.viewpoints) {
    const viewpoint = vp as Viewpoint;
    viewpoints.set(viewpoint, {
      position: [...viewpoint.position] as [number, number, number],
      rotation: [...viewpoint.rotation] as [number, number, number, number],
      focalLength: viewpoint.focalLength,
    });
  }

  return { worldPoints, viewpoints, inferredXyz };
}

/**
 * Restore project state
 */
export function restoreProjectState(
  project: Project,
  state: {
    worldPoints: Map<WorldPoint, [number, number, number] | undefined>;
    viewpoints: Map<Viewpoint, { position: [number, number, number]; rotation: [number, number, number, number]; focalLength: number }>;
    inferredXyz: Map<WorldPoint, [number | null, number | null, number | null]>;
  }
): void {
  for (const [wp, xyz] of state.worldPoints) {
    wp.optimizedXyz = xyz;
  }

  for (const [vp, vpState] of state.viewpoints) {
    vp.position = vpState.position;
    vp.rotation = vpState.rotation;
    vp.focalLength = vpState.focalLength;
  }

  for (const [wp, inferred] of state.inferredXyz) {
    wp.inferredXyz = inferred;
  }
}

/**
 * Test all candidates and return the best one.
 * This is the main entry point that replaces the three nested retry mechanisms.
 *
 * @param project The project to optimize
 * @param options Optimization options
 * @param optimizeProject The optimization function to use for testing
 * @returns The best result, or null if candidate testing is disabled
 */
export async function testAllCandidates(
  project: Project,
  options: OptimizeProjectOptions,
  optimizeProject: (project: Project, options: OptimizeProjectOptions) => Promise<any>
): Promise<any | null> {
  // Generate all candidates
  const candidates = generateAllCandidates(project, options);

  // If only one candidate, skip testing (normal single solve)
  if (candidates.length === 1) {
    return null;
  }

  // Use residual (sum of squared errors) as the quality metric, NOT median
  // A low median can hide catastrophic outliers (e.g., 4 points at 1414px)
  // Strict threshold ensures we test all candidates unless one is truly excellent
  // (For most scenes, this means all candidates are tested and the best is selected)
  const GOOD_ENOUGH_THRESHOLD = 10.0;
  // Probes are fast exploratory runs - cap at 200 for speed
  // When there are multiple candidates, probe iterations are always capped for speed
  // The user's maxIterations setting applies when there's only one candidate
  const PROBE_ITERATIONS = Math.min(options.maxIterations ?? 200, 200);

  // Save original state
  const originalState = saveProjectState(project);

  let bestResidual = Infinity;
  let bestCandidate: OptimizationCandidate | null = null;

  // Test each candidate with lightweight probes
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    // Update candidate progress for UI
    setCandidateProgress(i + 1, candidates.length);

    // Restore to original state before each probe to ensure independence
    // This prevents probes from benefiting from previous probes' partial convergence,
    // which would make the winning probe non-reproducible in the full run
    restoreProjectState(project, originalState);

    // Run probe with reduced iterations
    const probeResult = await optimizeProject(project, {
      ...options,
      maxIterations: PROBE_ITERATIONS,
      maxAttempts: 1,
      verbose: false,
      _skipCandidateTesting: true,
      _skipBranching: true,
      _branch: candidate.branch ?? undefined,
      _seed: candidate.seed,
      _alignmentSign: candidate.alignmentSign,
      _perturbCameras: candidate.perturbCameras,
      _attempt: 1, // Mark as non-first to skip multi-attempt
    });

    const residual = probeResult.residual ?? Infinity;
    logDebug(`[Candidate] #${i + 1}/${candidates.length}: ${candidate.description} → residual=${residual.toFixed(1)}`);

    // Track best candidate by residual
    if (residual < bestResidual) {
      bestResidual = residual;
      bestCandidate = candidate;
    }

    // If good enough, return the probe result directly
    // The project state is already at the good solution - no need to re-run
    if (residual < GOOD_ENOUGH_THRESHOLD) {
      logDebug(`[Candidate] #${i + 1} is good enough (residual=${residual.toFixed(1)} < ${GOOD_ENOUGH_THRESHOLD})`);
      setCandidateProgress(0, 0);

      log(`[Candidate] Early winner: ${candidate.description} - using probe result directly`);
      // Return the probe result - project state is already good
      return probeResult;
    }
  }

  // Clear candidate progress - done testing
  setCandidateProgress(0, 0);

  // Re-run full optimization with best candidate's parameters
  // This case means no probe was good enough (< 10.0), but we still want to use the best one
  if (bestCandidate) {
    log(`[Candidate] Best probe: ${bestCandidate.description} (residual=${bestResidual.toFixed(1)})`);
    log(`[Candidate] Re-running full optimization with best candidate...`);

    // Restore to original state (not best probe state) for a clean full run
    // The best probe might have been partially converged - we want a complete run
    restoreProjectState(project, originalState);

    const fullResult = await optimizeProject(project, {
      ...options,
      // Keep user's maxIterations for full run
      _skipCandidateTesting: true,
      _skipBranching: true,
      _branch: bestCandidate.branch ?? undefined,
      _seed: bestCandidate.seed,
      _alignmentSign: bestCandidate.alignmentSign,
      _perturbCameras: bestCandidate.perturbCameras,
      _attempt: 1,
    });

    return fullResult;
  }

  return null;
}
