import type { Project } from '../entities/project'
import type { WorldPoint } from '../entities/world-point'
import type { Line } from '../entities/line'
import type { Constraint } from '../entities/constraints'
import type { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'
import { random } from './seeded-random'

function randomUnitVector(): [number, number, number] {
  let x, y, z, len;
  do {
    x = random() * 2 - 1;
    y = random() * 2 - 1;
    z = random() * 2 - 1;
    len = x * x + y * y + z * z;
  } while (len > 1 || len < 0.01);

  const scale = 1 / Math.sqrt(len);
  return [x * scale, y * scale, z * scale];
}

export function randomInitialization(
  project: Project,
  sceneRadius: number = 10
): void {
  project.worldPoints.forEach(point => {
    if (!point.optimizedXyz) {
      point.optimizedXyz = [
        (random() - 0.5) * 2 * sceneRadius,
        (random() - 0.5) * 2 * sceneRadius,
        (random() - 0.5) * 2 * sceneRadius
      ];
    }
  });
}

function estimateSceneScale(lines: Set<Line>): number {
  const lengths: number[] = [];

  lines.forEach(line => {
    if (line.targetLength !== undefined) {
      lengths.push(line.targetLength);
    }
  });

  if (lengths.length === 0) return 10;

  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return avg * 2;
}

function findCoplanarGroups(constraints: Set<Constraint>): WorldPoint[][] {
  const groups: WorldPoint[][] = [];

  constraints.forEach(constraint => {
    if (constraint.getConstraintType() === 'coplanar_points') {
      const coplanarConstraint = constraint as CoplanarPointsConstraint;
      const points = coplanarConstraint.points;
      if (points.length >= 4) {
        groups.push(points);
      }
    }
  });

  return groups;
}

function initializeCoplanarGroups(
  groups: WorldPoint[][],
  sceneScale: number
): Set<WorldPoint> {
  const initialized = new Set<WorldPoint>();

  groups.forEach((group, planeIdx) => {
    const planeZ = (planeIdx - groups.length / 2) * sceneScale * 0.3;
    const gridSize = Math.ceil(Math.sqrt(group.length));
    const spacing = sceneScale / gridSize;

    group.forEach((point, idx) => {
      const row = Math.floor(idx / gridSize);
      const col = idx % gridSize;

      const x = (col - gridSize / 2) * spacing;
      const y = (row - gridSize / 2) * spacing;

      point.optimizedXyz = [x, y, planeZ];
      initialized.add(point);
    });
  });

  return initialized;
}

function propagateViaLineGraph(
  points: Set<WorldPoint>,
  lines: Set<Line>,
  initialized: Set<WorldPoint>,
  sceneScale: number
): void {
  const lineArray = Array.from(lines);

  if (initialized.size === 0) {
    const firstPoint = Array.from(points)[0];
    if (firstPoint) {
      firstPoint.optimizedXyz = [0, 0, 0];
      initialized.add(firstPoint);
    }
  }

  const queue = Array.from(initialized);

  while (queue.length > 0) {
    const currentPoint = queue.shift()!;
    if (!currentPoint.optimizedXyz) continue;

    const currentPos = currentPoint.optimizedXyz;

    const connectedLines = lineArray.filter(line =>
      line.pointA === currentPoint || line.pointB === currentPoint
    );

    connectedLines.forEach(line => {
      const otherPoint = line.pointA === currentPoint ? line.pointB : line.pointA;

      if (initialized.has(otherPoint)) return;

      const direction = randomUnitVector();
      const distance = line.targetLength || sceneScale * 0.5;

      otherPoint.optimizedXyz = [
        currentPos[0] + direction[0] * distance,
        currentPos[1] + direction[1] * distance,
        currentPos[2] + direction[2] * distance
      ];

      initialized.add(otherPoint);
      queue.push(otherPoint);
    });
  }

  points.forEach(point => {
    if (!initialized.has(point)) {
      point.optimizedXyz = [
        (random() - 0.5) * sceneScale,
        (random() - 0.5) * sceneScale,
        (random() - 0.5) * sceneScale
      ];
    }
  });
}

export function smartInitialization(project: Project): void {
  const sceneScale = estimateSceneScale(project.lines);

  const coplanarGroups = findCoplanarGroups(project.constraints);
  const initialized = initializeCoplanarGroups(coplanarGroups, sceneScale);

  propagateViaLineGraph(project.worldPoints, project.lines, initialized, sceneScale);
}

export function computeInitialResidual(project: Project): number {
  let totalError = 0;
  let count = 0;

  project.lines.forEach(line => {
    const pointA = line.pointA;
    const pointB = line.pointB;

    if (!pointA.optimizedXyz || !pointB.optimizedXyz) return;
    if (line.targetLength === undefined) return;

    const dx = pointB.optimizedXyz[0] - pointA.optimizedXyz[0];
    const dy = pointB.optimizedXyz[1] - pointA.optimizedXyz[1];
    const dz = pointB.optimizedXyz[2] - pointA.optimizedXyz[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const error = Math.abs(length - line.targetLength);
    totalError += error * error;
    count++;
  });

  return count > 0 ? Math.sqrt(totalError / count) : 0;
}
