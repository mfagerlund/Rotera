/**
 * Unified candidate testing system.
 * Tests all combinations of (strategy × seed × branch × alignment) with lightweight probes,
 * then runs full optimization on the winner.
 *
 * Strategy-as-candidate: instead of the orchestrator's if/else tree picking ONE init strategy,
 * we enumerate all viable strategies and let probe residuals objectively pick the best one.
 */

import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { generateAllInferenceBranches, InferenceBranch } from '../inference-branching';
import { canInitializeWithVanishingPoints } from '../vanishing-points';
import { log, logDebug, setCandidateProgress } from '../optimization-logger';
import { OPTIMIZE_PROJECT_DEFAULTS, type OptimizeProjectOptions } from './types';
import { getViableStrategies, STRATEGIES, type InitStrategyId } from '../camera-initialization/init-strategy';

/**
 * A candidate represents a specific combination of:
 * - Init strategy (vp-pnp, stepped-vp, essential-matrix, late-pnp-only)
 * - Random seed (for camera perturbation and randomized solves)
 * - Inference branch (sign choices for axis-aligned lines)
 * - Alignment sign (for Essential Matrix ambiguous cases)
 */
export interface OptimizationCandidate {
  initStrategy: InitStrategyId | undefined;
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
  const { maxAttempts = OPTIMIZE_PROJECT_DEFAULTS.maxAttempts, autoInitializeCameras = true, autoInitializeWorldPoints = true } = options;

  // Check if we should skip candidate generation
  // 1. Recursive call (already testing a candidate)
  // 2. No auto-initialization (pure constraint solve - no ambiguity to resolve)
  if (options._skipCandidateTesting || (!autoInitializeCameras && !autoInitializeWorldPoints)) {
    return [{
      initStrategy: options._initStrategy,
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
  const branchesToTest: (InferenceBranch | null)[] = hasMultipleBranches ? branches : [null];

  // Seed attempts
  const attempts = maxAttempts > 1 ? [1, 2, 3] : [1];

  // Compute viable strategies from project state
  const viewpointArray = (Array.from(project.viewpoints) as Viewpoint[]).filter(vp => vp.enabledInSolve);
  const worldPointSet = new Set(Array.from(project.worldPoints) as WorldPoint[]);
  const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
  const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());

  // When autoInitializeCameras is true, the orchestrator will reinitialize ALL cameras
  // regardless of their current position. So for strategy selection, treat all cameras
  // as uninitialized. Previously this checked position===[0,0,0], which caused the
  // strategy system to not activate for post-solve files (cameras had non-zero positions),
  // falling back to legacy VP-PnP only cascade.
  const uninitializedCameras = autoInitializeCameras ? viewpointArray : viewpointArray.filter(vp =>
    vp.position[0] === 0 && vp.position[1] === 0 && vp.position[2] === 0
  );

  let viableStrategies: InitStrategyId[] = [];

  // Strategy selection only for multi-camera projects (2+ cameras).
  // Single-camera projects don't have the multi-camera initialization ambiguity
  // (VP vs stepped-VP vs essential matrix) that strategies are designed to resolve.
  // The legacy cascade handles single-camera init well.
  if (autoInitializeCameras && uninitializedCameras.length >= 2) {
    const canAnyUseVPStrict = uninitializedCameras.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: false })
    );
    const canAnyUseVPRelaxed = uninitializedCameras.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: true })
    );

    viableStrategies = getViableStrategies({
      uninitializedCameras,
      worldPoints: worldPointSet,
      lockedPoints,
      canAnyUseVPStrict,
      canAnyUseVPRelaxed,
    });
  }

  // If we have multiple viable strategies, generate candidates per strategy
  if (viableStrategies.length > 1) {
    for (const strategy of viableStrategies) {
      const strategyDef = STRATEGIES[strategy];

      // VP-based strategies are deterministic from geometry - only use seed 42
      // EM is sensitive to starting point - vary all seeds
      const seedsForStrategy = strategyDef.isDeterministic ? [attempts[0]] : attempts;

      for (const attempt of seedsForStrategy) {
        const seed = attempt === 1 ? 42 : attempt === 2 ? 12345 : 98765 + attempt;
        const perturbScale = attempt > 1 ? 0.5 * attempt : undefined;

        for (const branch of branchesToTest) {
          if (strategyDef.hasAlignmentAmbiguity) {
            candidates.push({
              initStrategy: strategy,
              seed,
              branch,
              alignmentSign: 'positive',
              perturbCameras: perturbScale,
              description: makeDescription(strategy, seed, branch, 'positive'),
            });
            candidates.push({
              initStrategy: strategy,
              seed,
              branch,
              alignmentSign: 'negative',
              perturbCameras: perturbScale,
              description: makeDescription(strategy, seed, branch, 'negative'),
            });
          } else {
            candidates.push({
              initStrategy: strategy,
              seed,
              branch,
              alignmentSign: undefined,
              perturbCameras: perturbScale,
              description: makeDescription(strategy, seed, branch, undefined),
            });
          }
        }
      }
    }

    log(`[Candidates] Generated ${candidates.length} candidates (strategies=${viableStrategies.join(',')}, branches=${branchesToTest.length})`);
  } else {
    // Single or no viable strategy - fall back to old behavior (no strategy dimension)
    // The legacy orchestrator cascade handles strategy selection
    const mightUseEssentialMatrix = viewpointArray.length === 2;

    for (const attempt of attempts) {
      const seed = attempt === 1 ? 42 : attempt === 2 ? 12345 : 98765 + attempt;
      const perturbScale = attempt > 1 ? 0.5 * attempt : undefined;

      for (const branch of branchesToTest) {
        if (mightUseEssentialMatrix) {
          candidates.push({
            initStrategy: undefined,
            seed,
            branch,
            alignmentSign: 'positive',
            perturbCameras: perturbScale,
            description: makeDescription(undefined, seed, branch, 'positive'),
          });
          candidates.push({
            initStrategy: undefined,
            seed,
            branch,
            alignmentSign: 'negative',
            perturbCameras: perturbScale,
            description: makeDescription(undefined, seed, branch, 'negative'),
          });
        } else {
          candidates.push({
            initStrategy: undefined,
            seed,
            branch,
            alignmentSign: undefined,
            perturbCameras: perturbScale,
            description: makeDescription(undefined, seed, branch, undefined),
          });
        }
      }
    }

    log(`[Candidates] Generated ${candidates.length} candidates (attempts=${attempts.length}, branches=${branchesToTest.length}, alignments=${mightUseEssentialMatrix ? 2 : 1})`);
  }

  return candidates;
}

/**
 * Create a human-readable description for a candidate
 */
function makeDescription(
  strategy: InitStrategyId | undefined,
  seed: number,
  branch: InferenceBranch | null,
  alignmentSign: 'positive' | 'negative' | undefined
): string {
  const parts: string[] = [];

  if (strategy) {
    parts.push(strategy);
  }

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
 * Complete camera state for save/restore.
 * Includes ALL fields that could be modified during optimization.
 */
interface SavedViewpointState {
  position: [number, number, number];
  rotation: [number, number, number, number];
  focalLength: number;
  principalPointX: number;
  principalPointY: number;
  aspectRatio: number;
  skewCoefficient: number;
  radialDistortion: [number, number, number];
  tangentialDistortion: [number, number];
  enabledInSolve: boolean;
  isZReflected: boolean;
  isPoseLocked: boolean;
}

/**
 * Save current project state for restoration
 */
export function saveProjectState(project: Project): {
  worldPoints: Map<WorldPoint, [number, number, number] | undefined>;
  viewpoints: Map<Viewpoint, SavedViewpointState>;
  inferredXyz: Map<WorldPoint, [number | null, number | null, number | null]>;
} {
  const worldPoints = new Map<WorldPoint, [number, number, number] | undefined>();
  const viewpoints = new Map<Viewpoint, SavedViewpointState>();
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
      principalPointX: viewpoint.principalPointX,
      principalPointY: viewpoint.principalPointY,
      aspectRatio: viewpoint.aspectRatio,
      skewCoefficient: viewpoint.skewCoefficient,
      radialDistortion: [...viewpoint.radialDistortion] as [number, number, number],
      tangentialDistortion: [...viewpoint.tangentialDistortion] as [number, number],
      enabledInSolve: viewpoint.enabledInSolve,
      isZReflected: viewpoint.isZReflected,
      isPoseLocked: viewpoint.isPoseLocked,
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
    viewpoints: Map<Viewpoint, SavedViewpointState>;
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
    vp.principalPointX = vpState.principalPointX;
    vp.principalPointY = vpState.principalPointY;
    vp.aspectRatio = vpState.aspectRatio;
    vp.skewCoefficient = vpState.skewCoefficient;
    vp.radialDistortion = vpState.radialDistortion;
    vp.tangentialDistortion = vpState.tangentialDistortion;
    vp.enabledInSolve = vpState.enabledInSolve;
    vp.isZReflected = vpState.isZReflected;
    vp.isPoseLocked = vpState.isPoseLocked;
  }

  for (const [wp, inferred] of state.inferredXyz) {
    wp.inferredXyz = inferred;
  }
}

/**
 * Build probe options for a candidate optimization run.
 */
function buildProbeOptions(
  candidate: OptimizationCandidate,
  options: OptimizeProjectOptions,
  maxIterations: number
): OptimizeProjectOptions {
  return {
    ...options,
    maxIterations,
    maxAttempts: 1,
    verbose: false,
    _skipCandidateTesting: true,
    _skipBranching: true,
    _branch: candidate.branch ?? undefined,
    _seed: candidate.seed,
    _alignmentSign: candidate.alignmentSign,
    _perturbCameras: candidate.perturbCameras,
    _initStrategy: candidate.initStrategy,
    _attempt: 1,
  };
}

/**
 * Test all candidates and return the best one.
 *
 * If candidate count > 24, uses two-tier probing:
 * - Tier 1 (50 iterations): All candidates, keep top 8
 * - Tier 2 (200 iterations): Top 8, pick best
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
    log(`[Candidates] Only 1 candidate - skipping candidate testing, running single solve`);
    return null;
  }

  // Use residual (sum of squared errors) as the quality metric
  const GOOD_ENOUGH_THRESHOLD = 10.0;

  // Save original state
  const originalState = saveProjectState(project);

  let candidatesToTest = candidates;
  const useTwoTier = candidates.length > 24;

  // Tier 1: Quick probes to narrow down if too many candidates
  if (useTwoTier) {
    const TIER1_ITERATIONS = 50;
    log(`[Candidates] Two-tier probing: ${candidates.length} candidates, tier1=${TIER1_ITERATIONS} iter`);

    const tier1Results: { candidate: OptimizationCandidate; residual: number }[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      setCandidateProgress(i + 1, candidates.length);
      restoreProjectState(project, originalState);

      try {
        const probeResult = await optimizeProject(project, buildProbeOptions(candidate, options, TIER1_ITERATIONS));
        tier1Results.push({ candidate, residual: probeResult.residual ?? Infinity });
      } catch {
        tier1Results.push({ candidate, residual: Infinity });
      }
    }

    // Sort by residual and keep top 8
    tier1Results.sort((a, b) => a.residual - b.residual);
    const top = tier1Results.slice(0, 8);
    candidatesToTest = top.map(t => t.candidate);
    log(`[Candidates] Tier 1 done. Top 8 residuals: [${top.map(t => t.residual.toFixed(1)).join(', ')}]`);
  }

  // Main probing (tier 2 if two-tier, otherwise single-tier)
  const PROBE_ITERATIONS = Math.min(options.maxIterations ?? 200, 200);

  let bestResidual = Infinity;
  let bestCandidate: OptimizationCandidate | null = null;

  for (let i = 0; i < candidatesToTest.length; i++) {
    const candidate = candidatesToTest[i];
    setCandidateProgress(i + 1, candidatesToTest.length);
    restoreProjectState(project, originalState);

    try {
      const probeResult = await optimizeProject(project, buildProbeOptions(candidate, options, PROBE_ITERATIONS));

      const residual = probeResult.residual ?? Infinity;
      logDebug(`[Candidate] #${i + 1}/${candidatesToTest.length}: ${candidate.description} -> residual=${residual.toFixed(1)}`);

      if (residual < bestResidual) {
        bestResidual = residual;
        bestCandidate = candidate;
      }

      if (residual < GOOD_ENOUGH_THRESHOLD) {
        logDebug(`[Candidate] #${i + 1} is good enough (residual=${residual.toFixed(1)} < ${GOOD_ENOUGH_THRESHOLD})`);
        log(`[Candidate] Early winner: ${candidate.description} - skipping remaining candidates`);
        break;
      }
    } catch {
      logDebug(`[Candidate] #${i + 1}/${candidatesToTest.length}: ${candidate.description} -> FAILED (exception)`);
    }
  }

  // Clear candidate progress
  setCandidateProgress(0, 0);

  // Re-run full optimization with best candidate's parameters
  if (bestCandidate) {
    log(`[Candidate] Winner: ${bestCandidate.description} (probe residual=${bestResidual.toFixed(1)})`);
    log(`[Candidate] Running full optimization with user's maxIterations...`);

    restoreProjectState(project, originalState);

    const fullResult = await optimizeProject(project, {
      ...options,
      _skipCandidateTesting: true,
      _skipBranching: true,
      _branch: bestCandidate.branch ?? undefined,
      _seed: bestCandidate.seed,
      _alignmentSign: bestCandidate.alignmentSign,
      _perturbCameras: bestCandidate.perturbCameras,
      _initStrategy: bestCandidate.initStrategy,
      _attempt: 1,
    });

    return fullResult;
  }

  return null;
}
