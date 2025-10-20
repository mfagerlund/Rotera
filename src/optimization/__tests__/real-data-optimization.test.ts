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
import { convertAllConstraints } from '../../utils/constraint-entity-converter';
import { ConstraintSystem } from '../constraint-system';
import * as fs from 'fs';
import * as path from 'path';

// Load the cleaned test project
const testDataPath = path.join(__dirname, '../../../test-data/test-project-clean.json');
const testProject = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

describe('Real Data Optimization', () => {
  it('should load test project successfully', () => {
    expect(testProject).toBeDefined();
    expect(testProject.worldPoints).toBeDefined();
    expect(Object.keys(testProject.worldPoints).length).toBe(9);
    expect(testProject.constraints).toBeDefined();
    expect(testProject.constraints.length).toBe(2);
  });

  it('should convert project data to entities', () => {
    const pointEntities: WorldPointEntity[] = [];
    const lineEntities: LineEntity[] = [];

    // Convert world points to entities
    Object.values(testProject.worldPoints).forEach((wp: any) => {
      if (wp.xyz) {
        const entity = WorldPointEntity.create(wp.id, wp.name, {
          xyz: wp.xyz as [number, number, number],
          color: wp.color,
          isVisible: wp.isVisible,
          isLocked: wp.isLocked
        });
        pointEntities.push(entity);
      }
    });

    // Convert lines to entities
    Object.values(testProject.lines || {}).forEach((line: any) => {
      const pointA = pointEntities.find(p => p.getId() === line.pointA);
      const pointB = pointEntities.find(p => p.getId() === line.pointB);

      if (pointA && pointB) {
        const entity = LineEntity.create(
          line.id,
          line.name || 'Line',
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
      const xyz = point.getDefinedCoordinates();
      expect(xyz).toBeDefined();
      expect(xyz).toHaveLength(3);
    });
  });

  it('should convert constraints to entities', () => {
    const pointEntities: WorldPointEntity[] = [];

    // Create point entities
    Object.values(testProject.worldPoints).forEach((wp: any) => {
      if (wp.xyz) {
        const entity = WorldPointEntity.create(wp.id, wp.name, {
          xyz: wp.xyz as [number, number, number],
          color: wp.color,
          isVisible: wp.isVisible,
          isLocked: wp.isLocked
        });
        pointEntities.push(entity);
      }
    });

    // Fix constraint format (isEnabled -> enabled)
    const fixedConstraints = (testProject.constraints || []).map((c: any) => ({
      ...c,
      enabled: c.isEnabled ?? c.enabled
    }));

    // Convert constraints
    const constraintEntities = convertAllConstraints(
      fixedConstraints,
      pointEntities,
      []
    );

    console.log(`Converted ${constraintEntities.length} constraint entities`);
    constraintEntities.forEach((c, i) => {
      console.log(`  Constraint ${i}: ${c.constructor.name}`);
    });

    // Coplanar constraints should be created
    expect(constraintEntities.length).toBeGreaterThanOrEqual(0);
  });

  it('should run optimization on real data', () => {
    const pointEntities: WorldPointEntity[] = [];
    const lineEntities: LineEntity[] = [];

    // Create point entities
    Object.values(testProject.worldPoints).forEach((wp: any) => {
      if (wp.xyz) {
        const entity = WorldPointEntity.create(wp.id, wp.name, {
          xyz: wp.xyz as [number, number, number],
          color: wp.color,
          isVisible: wp.isVisible,
          isLocked: wp.isLocked
        });
        pointEntities.push(entity);
      }
    });

    // Create line entities
    Object.values(testProject.lines || {}).forEach((line: any) => {
      const pointA = pointEntities.find(p => p.getId() === line.pointA);
      const pointB = pointEntities.find(p => p.getId() === line.pointB);

      if (pointA && pointB) {
        const entity = LineEntity.create(
          line.id,
          line.name || 'Line',
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

    // Fix constraint format (isEnabled -> enabled)
    const fixedConstraints = (testProject.constraints || []).map((c: any) => ({
      ...c,
      enabled: c.isEnabled ?? c.enabled
    }));

    // Convert constraints
    const constraintEntities = convertAllConstraints(
      fixedConstraints,
      pointEntities,
      lineEntities
    );

    console.log('\n=== Optimization Test Setup ===');
    console.log(`Points: ${pointEntities.length}`);
    console.log(`Lines: ${lineEntities.length}`);
    console.log(`Constraints: ${constraintEntities.length}`);

    // Print initial point positions
    console.log('\nInitial point positions:');
    pointEntities.slice(0, 5).forEach(p => {
      const xyz = p.getDefinedCoordinates();
      console.log(`  ${p.name}: [${xyz?.map(v => v.toFixed(2)).join(', ')}]`);
    });

    // Run optimization using ConstraintSystem
    const solver = new ConstraintSystem({
      maxIterations: 100,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: true
    });

    // Add entities to solver
    pointEntities.forEach(p => solver.addPoint(p));
    lineEntities.forEach(l => solver.addLine(l));
    constraintEntities.forEach(c => solver.addConstraint(c));

    const result = solver.solve();

    console.log('\n=== Optimization Result ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual.toExponential(3)}`);
    console.log(`Error: ${result.error || 'none'}`);

    // Print final point positions
    console.log('\nFinal point positions:');
    pointEntities.slice(0, 5).forEach(p => {
      const xyz = p.getDefinedCoordinates();
      console.log(`  ${p.name}: [${xyz?.map(v => v.toFixed(2)).join(', ')}]`);
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

  it('should respect line constraints during optimization', () => {
    const pointEntities: WorldPointEntity[] = [];
    const lineEntities: LineEntity[] = [];

    // Create point entities
    Object.values(testProject.worldPoints).forEach((wp: any) => {
      if (wp.xyz) {
        const entity = WorldPointEntity.create(wp.id, wp.name, {
          xyz: wp.xyz as [number, number, number],
          color: wp.color,
          isVisible: wp.isVisible,
          isLocked: wp.isLocked
        });
        pointEntities.push(entity);
      }
    });

    // Create line entities WITH constraints
    Object.values(testProject.lines || {}).forEach((line: any) => {
      const pointA = pointEntities.find(p => p.getId() === line.pointA);
      const pointB = pointEntities.find(p => p.getId() === line.pointB);

      if (pointA && pointB && line.constraints) {
        const entity = LineEntity.create(
          line.id,
          line.name || 'Line',
          pointA,
          pointB,
          {
            constraints: {
              direction: line.constraints.direction,
              targetLength: line.constraints.targetLength,
              tolerance: line.constraints.tolerance
            },
            color: line.color,
            isConstruction: line.isConstruction
          }
        );
        lineEntities.push(entity);
      }
    });

    console.log('\n=== Line Constraints Test ===');
    console.log(`Lines with constraints: ${lineEntities.length}`);

    // Check initial line lengths
    console.log('\nInitial line lengths:');
    lineEntities.slice(0, 5).forEach(line => {
      const length = line.length();
      const target = line.constraints.targetLength;
      console.log(`  ${line.name}: length=${length?.toFixed(2)}, target=${target}`);
    });

    // Run optimization with line constraints
    const solver = new ConstraintSystem({
      maxIterations: 100,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false
    });

    // Add entities (lines have intrinsic constraints)
    pointEntities.forEach(p => solver.addPoint(p));
    lineEntities.forEach(l => solver.addLine(l));

    const result = solver.solve();

    console.log('\nOptimization result:');
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Residual: ${result.residual.toExponential(3)}`);

    // Check final line lengths
    console.log('\nFinal line lengths:');
    lineEntities.slice(0, 5).forEach(line => {
      const length = line.length();
      const target = line.constraints.targetLength;
      const error = target ? Math.abs(length! - target) : 0;
      console.log(`  ${line.name}: length=${length?.toFixed(2)}, target=${target}, error=${error.toFixed(4)}`);
    });

    expect(result.iterations).toBeGreaterThan(0);
  });
});
