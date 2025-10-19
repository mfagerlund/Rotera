/**
 * Converts frontend Constraint objects to entity Constraint instances
 */

import type { Constraint as FrontendConstraint } from '../types/project';
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

  getPoint(id: string): string | undefined {
    return this.points.has(id) ? id : undefined;
  }

  getLine(id: string): string | undefined {
    return this.lines.has(id) ? id : undefined;
  }

  getPlane(id: string): string | undefined {
    return undefined; // TODO: Add plane support
  }

  entityExists(id: string): boolean {
    return this.points.has(id) || this.lines.has(id);
  }

  pointExists(id: string): boolean {
    return this.points.has(id);
  }

  lineExists(id: string): boolean {
    return this.lines.has(id);
  }

  planeExists(id: string): boolean {
    return false; // TODO: Add plane support
  }
}

/**
 * Convert a frontend constraint to an entity constraint
 */
export function convertConstraintToEntity(
  constraint: FrontendConstraint,
  pointEntities: WorldPoint[],
  lineEntities: Line[]
): ConstraintEntity | null {
  // Build lookup maps
  const pointMap = new Map(pointEntities.map(p => [p.getId(), p]));
  const lineMap = new Map(lineEntities.map(l => [l.getId(), l]));

  const repo = new ConstraintConversionRepository(pointMap, lineMap);

  try {
    switch (constraint.type) {
      case 'points_distance': {
        // Distance between two points
        const pointIds = constraint.entities.points || [];
        if (pointIds.length !== 2) return null;

        const targetDistance = constraint.parameters.distance || constraint.parameters.value;
        if (typeof targetDistance !== 'number') return null;

        return DistanceConstraint.create(
          constraint.id as any,
          `Distance ${targetDistance.toFixed(2)}m`,
          pointIds[0] as any,
          pointIds[1] as any,
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

        return FixedPointConstraint.create(
          constraint.id as any,
          'Fixed Point',
          pointIds[0] as any,
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

        return CollinearPointsConstraint.create(
          constraint.id as any,
          'Collinear Points',
          pointIds as any[],
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

        return CoplanarPointsConstraint.create(
          constraint.id as any,
          'Coplanar Points',
          pointIds as any[],
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
        const pairs: [any, any][] = [];
        for (let i = 0; i < pointIds.length; i += 2) {
          pairs.push([pointIds[i] as any, pointIds[i + 1] as any]);
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

        return ParallelLinesConstraint.create(
          constraint.id as any,
          'Parallel Lines',
          lineIds[0] as any,
          lineIds[1] as any,
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

        return PerpendicularLinesConstraint.create(
          constraint.id as any,
          'Perpendicular Lines',
          lineIds[0] as any,
          lineIds[1] as any,
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
 * Convert all frontend constraints to entity constraints
 */
export function convertAllConstraints(
  constraints: FrontendConstraint[],
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
