/**
 * Converts legacy Constraint objects to entity Constraint instances
 *
 * NOTE: This is a temporary converter for backward compatibility during migration.
 * The legacy Constraint type from types/project.ts uses different type names than
 * the new DTO types. This converter bridges between the old and new representations.
 */

// Legacy constraint type (deprecated - for backward compatibility only)
import type { Constraint as LegacyConstraint } from '../types/project';
import { Constraint as ConstraintEntity } from '../entities/constraints/base-constraint';
import { DistanceConstraint } from '../entities/constraints/distance-constraint';
import { FixedPointConstraint } from '../entities/constraints/fixed-point-constraint';
import { CollinearPointsConstraint } from '../entities/constraints/collinear-points-constraint';
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint';
import { EqualDistancesConstraint } from '../entities/constraints/equal-distances-constraint';
import { ParallelLinesConstraint } from '../entities/constraints/parallel-lines-constraint';
import { PerpendicularLinesConstraint } from '../entities/constraints/perpendicular-lines-constraint';
import { WorldPoint } from '../entities/world-point/WorldPoint';
import { Line } from '../entities/line/Line';

// Simple repository implementation for constraint conversion
class ConstraintConversionRepository {
  constructor(
    private points: Map<string, WorldPoint>,
    private lines: Map<string, Line>
  ) {}

  getReferenceManager() {
    const resolveEntity = <T>(id: string, type: string): T | undefined => {
      if (type === 'point') return this.points.get(id) as T | undefined;
      if (type === 'line') return this.lines.get(id) as T | undefined;
      return undefined;
    };

    return {
      resolve: resolveEntity,
      batchResolve: <T>(ids: string[], type: string): T[] => {
        const results: T[] = [];
        for (const id of ids) {
          const entity = resolveEntity<T>(id, type);
          if (entity) results.push(entity);
        }
        return results;
      },
      preloadReferences: () => {}
    };
  }
}

/**
 * Convert a legacy constraint to an entity constraint
 */
export function convertConstraintToEntity(
  constraint: LegacyConstraint,
  pointEntities: WorldPoint[],
  lineEntities: Line[]
): ConstraintEntity | null {
  // Build lookup maps
  const pointMap = new Map(pointEntities.map(p => [p.id, p]));
  const lineMap = new Map(lineEntities.map(l => [l.id, l]));

  const repo = new ConstraintConversionRepository(pointMap, lineMap);

  try {
    switch (constraint.type) {
      case 'points_distance': {
        // Distance between two points
        const pointIds = constraint.entities.points || [];
        if (pointIds.length !== 2) return null;

        const targetDistance = constraint.parameters.distance || constraint.parameters.value;
        if (typeof targetDistance !== 'number') return null;

        const pointA = pointMap.get(pointIds[0]);
        const pointB = pointMap.get(pointIds[1]);
        if (!pointA || !pointB) return null;

        return DistanceConstraint.create(
          constraint.id as any,
          `Distance ${targetDistance.toFixed(2)}m`,
          pointA,
          pointB,
          targetDistance,
          repo,
          {
            tolerance: constraint.parameters.tolerance || 0.01,
            isDriving: constraint.isDriving,
            isEnabled: constraint.enabled,
          }
        );
      }

      case 'point_fixed_coord': {
        // Fixed point coordinates
        const pointIds = constraint.entities.points || [];
        if (pointIds.length !== 1) return null;

        const x = constraint.parameters.x;
        const y = constraint.parameters.y;
        const z = constraint.parameters.z;

        // All three coordinates must be specified
        if (x === undefined || y === undefined || z === undefined) return null;

        const point = pointMap.get(pointIds[0]);
        if (!point) return null;

        return FixedPointConstraint.create(
          constraint.id as any,
          'Fixed Point',
          point,
          [x, y, z],
          repo,
          {
            tolerance: constraint.parameters.tolerance || 0.001,
            isDriving: constraint.isDriving,
            isEnabled: constraint.enabled,
          }
        );
      }

      case 'points_colinear': {
        // Points on a line
        const pointIds = constraint.entities.points || [];
        if (pointIds.length < 3) return null;

        const points = pointIds.map(id => pointMap.get(id)).filter((p): p is WorldPoint => p !== undefined);
        if (points.length !== pointIds.length) return null;

        return CollinearPointsConstraint.create(
          constraint.id as any,
          'Collinear Points',
          points,
          repo,
          {
            tolerance: constraint.parameters.tolerance || 0.01,
            isDriving: constraint.isDriving,
            isEnabled: constraint.enabled,
          }
        );
      }

      case 'points_coplanar': {
        // Points on a plane
        const pointIds = constraint.entities.points || [];
        if (pointIds.length < 4) return null;

        const points = pointIds.map(id => pointMap.get(id)).filter((p): p is WorldPoint => p !== undefined);
        if (points.length !== pointIds.length) return null;

        return CoplanarPointsConstraint.create(
          constraint.id as any,
          'Coplanar Points',
          points,
          repo,
          {
            tolerance: constraint.parameters.tolerance || 0.01,
            isDriving: constraint.isDriving,
            isEnabled: constraint.enabled,
          }
        );
      }

      case 'points_equal_distance': {
        // Equal distances constraint
        const pointIds = constraint.entities.points || [];
        if (pointIds.length < 4 || pointIds.length % 2 !== 0) return null;

        // Split into pairs: [p1, p2] and [p3, p4]
        const pairs: [WorldPoint, WorldPoint][] = [];
        for (let i = 0; i < pointIds.length; i += 2) {
          const p1 = pointMap.get(pointIds[i]);
          const p2 = pointMap.get(pointIds[i + 1]);
          if (!p1 || !p2) return null;
          pairs.push([p1, p2]);
        }

        return EqualDistancesConstraint.create(
          constraint.id as any,
          'Equal Distances',
          pairs,
          repo,
          {
            tolerance: constraint.parameters.tolerance || 0.01,
            isDriving: constraint.isDriving,
            isEnabled: constraint.enabled,
          }
        );
      }

      case 'lines_parallel': {
        // Parallel lines
        const lineIds = constraint.entities.lines || [];
        if (lineIds.length !== 2) return null;

        const lineA = lineMap.get(lineIds[0]);
        const lineB = lineMap.get(lineIds[1]);
        if (!lineA || !lineB) return null;

        return ParallelLinesConstraint.create(
          constraint.id as any,
          'Parallel Lines',
          lineA,
          lineB,
          repo,
          {
            tolerance: constraint.parameters.tolerance || 0.01,
            isDriving: constraint.isDriving,
            isEnabled: constraint.enabled,
          }
        );
      }

      case 'lines_perpendicular': {
        // Perpendicular lines
        const lineIds = constraint.entities.lines || [];
        if (lineIds.length !== 2) return null;

        const lineA = lineMap.get(lineIds[0]);
        const lineB = lineMap.get(lineIds[1]);
        if (!lineA || !lineB) return null;

        return PerpendicularLinesConstraint.create(
          constraint.id as any,
          'Perpendicular Lines',
          lineA,
          lineB,
          repo,
          {
            tolerance: constraint.parameters.tolerance || 0.01,
            isDriving: constraint.isDriving,
            isEnabled: constraint.enabled,
          }
        );
      }

      default:
        console.warn(`Unsupported constraint type: ${constraint.type}`);
        return null;
    }
  } catch (error) {
    console.error(`Failed to convert constraint ${constraint.id}:`, error);
    return null;
  }
}

/**
 * Convert all legacy constraints to entity constraints
 */
export function convertAllConstraints(
  constraints: LegacyConstraint[],
  pointEntities: WorldPoint[],
  lineEntities: Line[]
): ConstraintEntity[] {
  const converted: ConstraintEntity[] = [];

  for (const constraint of constraints) {
    if (!constraint.enabled) continue;

    const entity = convertConstraintToEntity(constraint, pointEntities, lineEntities);
    if (entity) {
      converted.push(entity);
    }
  }

  return converted;
}
