/**
 * Smart initialization strategies for 3D point positions
 *
 * Uses constraint information to provide better initial guesses than random positions.
 * This leads to faster convergence and better optimization results.
 */

interface WorldPoint {
  id: string;
  name: string;
  xyz?: [number, number, number];
  imagePoints?: any[];
  [key: string]: any;
}

interface Line {
  id: string;
  pointA: string;
  pointB: string;
  constraints?: {
    targetLength?: number;
    direction?: string;
    tolerance?: number;
  };
  [key: string]: any;
}

interface Constraint {
  id: string;
  type: string;
  entities: {
    points?: string[];
    lines?: string[];
  };
  [key: string]: any;
}

interface Project {
  worldPoints: Record<string, WorldPoint>;
  lines?: Record<string, Line>;
  constraints?: Constraint[];
  [key: string]: any;
}

/**
 * Generate a random unit vector in 3D
 */
function randomUnitVector(): [number, number, number] {
  // Marsaglia method for uniform random point on sphere
  let x, y, z, len;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
    z = Math.random() * 2 - 1;
    len = x * x + y * y + z * z;
  } while (len > 1 || len < 0.01);

  const scale = 1 / Math.sqrt(len);
  return [x * scale, y * scale, z * scale];
}

/**
 * Simple random initialization (baseline)
 */
export function randomInitialization(
  project: Project,
  sceneRadius: number = 10
): void {
  Object.values(project.worldPoints).forEach(point => {
    if (!point.xyz) {
      point.xyz = [
        (Math.random() - 0.5) * 2 * sceneRadius,
        (Math.random() - 0.5) * 2 * sceneRadius,
        (Math.random() - 0.5) * 2 * sceneRadius
      ];
    }
  });
}

/**
 * Estimate scene scale from line length constraints
 */
function estimateSceneScale(lines: Record<string, Line>): number {
  const lengths: number[] = [];

  Object.values(lines).forEach(line => {
    if (line.constraints?.targetLength) {
      lengths.push(line.constraints.targetLength);
    }
  });

  if (lengths.length === 0) return 10; // Default 10m

  // Use average target length as scene scale
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return avg * 2; // Scene is ~2x the average line length
}

/**
 * Find groups of coplanar points from constraints
 */
function findCoplanarGroups(constraints: Constraint[]): string[][] {
  const groups: string[][] = [];

  constraints.forEach(constraint => {
    if (constraint.type === 'points_coplanar') {
      const pointIds = constraint.entities.points || [];
      if (pointIds.length >= 4) {
        groups.push(pointIds);
      }
    }
  });

  return groups;
}

/**
 * Initialize points on planes for coplanar groups
 */
function initializeCoplanarGroups(
  points: Record<string, WorldPoint>,
  groups: string[][],
  sceneScale: number
): Set<string> {
  const initialized = new Set<string>();

  groups.forEach((group, planeIdx) => {
    // Each plane at a different z-level
    const planeZ = (planeIdx - groups.length / 2) * sceneScale * 0.3;

    // Create a grid on the plane
    const gridSize = Math.ceil(Math.sqrt(group.length));
    const spacing = sceneScale / gridSize;

    group.forEach((pointId, idx) => {
      if (!points[pointId]) return;

      const row = Math.floor(idx / gridSize);
      const col = idx % gridSize;

      const x = (col - gridSize / 2) * spacing;
      const y = (row - gridSize / 2) * spacing;

      points[pointId].xyz = [x, y, planeZ];
      initialized.add(pointId);
    });
  });

  return initialized;
}

/**
 * Propagate positions through line graph using BFS
 */
function propagateViaLineGraph(
  points: Record<string, WorldPoint>,
  lines: Record<string, Line>,
  initialized: Set<string>,
  sceneScale: number
): void {
  const lineArray = Object.values(lines);

  // If no points initialized yet, start with first point at origin
  if (initialized.size === 0) {
    const firstPointId = Object.keys(points)[0];
    if (firstPointId && points[firstPointId]) {
      points[firstPointId].xyz = [0, 0, 0];
      initialized.add(firstPointId);
    }
  }

  // BFS to propagate positions
  const queue = Array.from(initialized);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentPoint = points[currentId];
    if (!currentPoint || !currentPoint.xyz) continue;

    const currentPos = currentPoint.xyz;

    // Find connected lines
    const connectedLines = lineArray.filter(line =>
      line.pointA === currentId || line.pointB === currentId
    );

    connectedLines.forEach(line => {
      const otherId = line.pointA === currentId ? line.pointB : line.pointA;
      const otherPoint = points[otherId];

      if (!otherPoint || initialized.has(otherId)) return;

      // Place at target distance in random direction
      const direction = randomUnitVector();
      const distance = line.constraints?.targetLength || sceneScale * 0.5;

      otherPoint.xyz = [
        currentPos[0] + direction[0] * distance,
        currentPos[1] + direction[1] * distance,
        currentPos[2] + direction[2] * distance
      ];

      initialized.add(otherId);
      queue.push(otherId);
    });
  }

  // Handle any remaining unconnected points
  Object.keys(points).forEach(pointId => {
    if (!initialized.has(pointId) && points[pointId]) {
      // Place randomly within scene bounds
      points[pointId].xyz = [
        (Math.random() - 0.5) * sceneScale,
        (Math.random() - 0.5) * sceneScale,
        (Math.random() - 0.5) * sceneScale
      ];
    }
  });
}

/**
 * Smart initialization using constraint information
 *
 * Strategy:
 * 1. Estimate scene scale from line length constraints
 * 2. Group coplanar points and place them on separate planes
 * 3. Propagate positions through line graph using target lengths
 * 4. Fill in any remaining points randomly
 */
export function smartInitialization(project: Project): void {
  const points = project.worldPoints;
  const lines = project.lines || {};
  const constraints = project.constraints || [];

  // Step 1: Estimate scene scale
  const sceneScale = estimateSceneScale(lines);

  // Step 2: Initialize coplanar groups
  const coplanarGroups = findCoplanarGroups(constraints);
  const initialized = initializeCoplanarGroups(points, coplanarGroups, sceneScale);

  console.log(`Smart init: ${coplanarGroups.length} coplanar groups, ${initialized.size} points initialized`);

  // Step 3: Propagate through line graph
  propagateViaLineGraph(points, lines, initialized, sceneScale);

  console.log(`Smart init: All ${Object.keys(points).length} points initialized`);
}

/**
 * Compare initialization quality by computing initial residual
 */
export function computeInitialResidual(project: Project): number {
  const lines = Object.values(project.lines || {});
  const points = project.worldPoints;
  let totalError = 0;
  let count = 0;

  // Compute line length errors
  lines.forEach(line => {
    const pointA = points[line.pointA];
    const pointB = points[line.pointB];

    if (!pointA?.xyz || !pointB?.xyz) return;
    if (!line.constraints?.targetLength) return;

    const dx = pointB.xyz[0] - pointA.xyz[0];
    const dy = pointB.xyz[1] - pointA.xyz[1];
    const dz = pointB.xyz[2] - pointA.xyz[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const error = Math.abs(length - line.constraints.targetLength);
    totalError += error * error;
    count++;
  });

  return count > 0 ? Math.sqrt(totalError / count) : 0;
}
