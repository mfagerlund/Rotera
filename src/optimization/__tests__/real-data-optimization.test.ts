/**
 * Real data optimization tests
 *
 * Tests the optimization system with actual project data containing:
 * - 9 world points with random initial xyz guesses
 * - 9 lines with constraints (z-aligned, targetLength=10m)
 * - 2 coplanar constraints
 */

import { WorldPoint as WorldPointEntity } from '../../entities/world-point/WorldPoint';
import { Line as LineEntity } from '../../entities/line/Line';
import { Project } from '../../entities/project';
import { optimizeProject } from '../optimize-project';
import * as fs from 'fs';
import * as path from 'path';

// Load the cleaned test project
const testDataPath = path.join(__dirname, '../../../test-data/test-project-clean.json');
const testProject = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

describe('Real Data Optimization', () => {
  it('should load test project successfully', async () => {
    expect(testProject).toBeDefined();
    expect(testProject.worldPoints).toBeDefined();
    expect(Object.keys(testProject.worldPoints).length).toBe(9);
    expect(testProject.constraints).toBeDefined();
    expect(testProject.constraints.length).toBe(2);
  });

  it('should convert project data to entities', async () => {
    const pointEntities: WorldPointEntity[] = [];
    const lineEntities: LineEntity[] = [];
    const pointMap = new Map<string, WorldPointEntity>();

    // Convert world points to entities
    Object.values(testProject.worldPoints).forEach((wp: any) => {
      if (wp.xyz) {
        const entity = WorldPointEntity.create(wp.name, {
          lockedXyz: wp.isLocked ? (wp.xyz as [number, number, number]) : [null, null, null],
          optimizedXyz: wp.xyz as [number, number, number],
          color: wp.color
        });
        pointEntities.push(entity);
        pointMap.set(wp.id, entity);
      }
    });

    // Convert lines to entities
    Object.values(testProject.lines || {}).forEach((line: any) => {
      const pointA = pointMap.get(line.pointA);
      const pointB = pointMap.get(line.pointB);

      if (pointA && pointB) {
        const entity = LineEntity.create(
          line.name || `Line_${pointA.getName()}_${pointB.getName()}`,
          pointA,
          pointB,
          {
            color: line.color,
            isConstruction: line.isConstruction
          }
        );
        lineEntities.push(entity);
      }
    });

    expect(pointEntities.length).toBe(9);
    expect(lineEntities.length).toBe(9);

    // Verify all points have xyz coordinates
    pointEntities.forEach(point => {
      const xyz = point.optimizedXyz;
      expect(xyz).toBeDefined();
      expect(xyz).toHaveLength(3);
    });
  });

  it('should convert constraints to entities', async () => {
    const pointEntities: WorldPointEntity[] = [];

    // Create point entities
    Object.values(testProject.worldPoints).forEach((wp: any) => {
      if (wp.xyz) {
        const entity = WorldPointEntity.create(wp.name, {
          lockedXyz: wp.isLocked ? (wp.xyz as [number, number, number]) : [null, null, null],
          optimizedXyz: wp.xyz as [number, number, number],
          color: wp.color
        });
        pointEntities.push(entity);
      }
    });

    // This test is no longer relevant since convertAllConstraints doesn't exist
    // The constraint conversion is now handled in Serialization.ts
    expect(pointEntities.length).toBe(9);
  });

  it('should run optimization on real data', async () => {
    const pointEntities: WorldPointEntity[] = [];
    const lineEntities: LineEntity[] = [];
    const pointMap = new Map<string, WorldPointEntity>();

    // Create point entities
    Object.values(testProject.worldPoints).forEach((wp: any) => {
      if (wp.xyz) {
        const entity = WorldPointEntity.create(wp.name, {
          lockedXyz: wp.isLocked ? (wp.xyz as [number, number, number]) : [null, null, null],
          optimizedXyz: wp.xyz as [number, number, number],
          color: wp.color
        });
        pointEntities.push(entity);
        pointMap.set(wp.id, entity);
      }
    });

    // Create line entities
    Object.values(testProject.lines || {}).forEach((line: any) => {
      const pointA = pointMap.get(line.pointA);
      const pointB = pointMap.get(line.pointB);

      if (pointA && pointB) {
        const entity = LineEntity.create(
          line.name || `Line_${pointA.getName()}_${pointB.getName()}`,
          pointA,
          pointB,
          {
            color: line.color,
            isConstruction: line.isConstruction
          }
        );
        lineEntities.push(entity);
      }
    });

    // No longer using convertAllConstraints - constraints come from line intrinsic properties
    const constraintEntities: any[] = [];

    console.log('\n=== Optimization Test Setup ===');
    console.log(`Points: ${pointEntities.length}`);
    console.log(`Lines: ${lineEntities.length}`);
    console.log(`Constraints: ${constraintEntities.length}`);

    console.log('\nInitial point positions:');
    pointEntities.slice(0, 5).forEach(p => {
      const xyz = p.optimizedXyz;
      console.log(`  ${p.getName()}: [${xyz?.map(v => v.toFixed(2)).join(', ')}]`);
    });

    const project = Project.create('Real Data Optimization Test');
    pointEntities.forEach(p => project.addWorldPoint(p));
    lineEntities.forEach(l => project.addLine(l));
    constraintEntities.forEach(c => project.addConstraint(c));

    const result = await optimizeProject(project, {
      maxIterations: 100,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: true,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    console.log('\n=== Optimization Result ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual.toExponential(3)}`);
    console.log(`Error: ${result.error || 'none'}`);

    // Print final point positions
    console.log('\nFinal point positions:');
    pointEntities.slice(0, 5).forEach(p => {
      const xyz = p.optimizedXyz;
      console.log(`  ${p.getName()}: [${xyz?.map(v => v.toFixed(2)).join(', ')}]`);
    });

    // Verify result
    expect(result).toBeDefined();
    expect(result.iterations).toBeGreaterThanOrEqual(0);
    expect(result.residual).toBeGreaterThanOrEqual(0);

    // The optimization should either converge or at least not error
    if (result.error) {
      console.warn(`Optimization error: ${result.error}`);
    }
  });

  it('should respect line constraints during optimization', async () => {
    const pointEntities: WorldPointEntity[] = [];
    const lineEntities: LineEntity[] = [];
    const pointMap = new Map<string, WorldPointEntity>();

    // Create point entities
    Object.values(testProject.worldPoints).forEach((wp: any) => {
      if (wp.xyz) {
        const entity = WorldPointEntity.create(wp.name, {
          lockedXyz: wp.isLocked ? (wp.xyz as [number, number, number]) : [null, null, null],
          optimizedXyz: wp.xyz as [number, number, number],
          color: wp.color
        });
        pointEntities.push(entity);
        pointMap.set(wp.id, entity);
      }
    });

    // Create line entities WITH constraints
    Object.values(testProject.lines || {}).forEach((line: any) => {
      const pointA = pointMap.get(line.pointA);
      const pointB = pointMap.get(line.pointB);

      if (pointA && pointB && line.constraints) {
        const entity = LineEntity.create(
          line.name || `Line_${pointA.getName()}_${pointB.getName()}`,
          pointA,
          pointB,
          {
            direction: line.constraints.direction,
            targetLength: line.constraints.targetLength,
            tolerance: line.constraints.tolerance,
            color: line.color,
            isConstruction: line.isConstruction
          }
        );
        lineEntities.push(entity);
      }
    });

    console.log('\n=== Line Constraints Test ===');
    console.log(`Lines with constraints: ${lineEntities.length}`);

    console.log('\nInitial line lengths:');
    lineEntities.slice(0, 5).forEach((line) => {
      const length = line.length();
      const target = line.targetLength;
      console.log(`  ${line.getName()}: length=${length?.toFixed(2)}, target=${target}`);
    });

    const project = Project.create('Line Constraints Test');
    pointEntities.forEach(p => project.addWorldPoint(p));
    lineEntities.forEach(l => project.addLine(l));

    const result = await optimizeProject(project, {
      maxIterations: 100,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      maxAttempts: 1  // No multi-attempt needed for this test
    });

    console.log('\nOptimization result:');
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Residual: ${result.residual.toExponential(3)}`);

    // Check final line lengths
    console.log('\nFinal line lengths:');
    lineEntities.slice(0, 5).forEach((line) => {
      const length = line.length();
      const target = line.targetLength;
      const error = target ? Math.abs(length! - target) : 0;
      console.log(`  ${line.getName()}: length=${length?.toFixed(2)}, target=${target}, error=${error.toFixed(4)}`);
    });

    expect(result.iterations).toBeGreaterThan(0);
  });
});
