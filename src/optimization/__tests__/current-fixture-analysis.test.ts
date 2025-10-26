import { describe, it, expect } from '@jest/globals';
import { Serialization } from '../../entities/Serialization';
import { optimizeProject } from '../optimize-project';
import { WorldPoint } from '../../entities/world-point';
import { Line } from '../../entities/line/Line';
import * as fs from 'fs';
import * as path from 'path';

describe('Current Fixture Analysis', () => {
  it('should analyze current fixture and report line lengths', () => {
    const fixturePath = path.join('C:', 'Slask', 'current fixture.json');
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

    const project = Serialization.deserialize(fixtureJson);

    console.log('\n=== CURRENT FIXTURE ANALYSIS ===');
    console.log(`World Points: ${project.worldPoints.size}`);
    console.log(`Lines: ${project.lines.size}`);
    console.log(`Viewpoints: ${project.viewpoints.size}`);
    console.log(`Image Points: ${project.imagePoints.size}`);

    console.log('\n=== WORLD POINT POSITIONS (BEFORE) ===');
    Array.from(project.worldPoints).forEach(wp => {
      const point = wp as WorldPoint;
      console.log(`${point.name}: [${point.optimizedXyz?.map(x => x.toFixed(3)).join(', ') || 'null'}]`);
    });

    console.log('\n=== LINE LENGTHS (BEFORE) ===');
    Array.from(project.lines).forEach(line => {
      const l = line as Line;
      const a = l.pointA.optimizedXyz;
      const b = l.pointB.optimizedXyz;
      if (a && b) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dz = b[2] - a[2];
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        console.log(`${l.pointA.name} -> ${l.pointB.name}: ${length.toFixed(3)} (target: ${l.targetLength || 'none'}, direction: ${l.direction})`);
      }
    });

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: true,
      outlierThreshold: 3.0,
      tolerance: 1e-6,
      maxIterations: 100,
      damping: 1e-3,
      verbose: true
    });

    console.log('\n=== OPTIMIZATION RESULT ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual.toFixed(6)}`);
    if (result.medianReprojectionError !== undefined) {
      console.log(`Median reprojection error: ${result.medianReprojectionError.toFixed(2)} px`);
    }
    if (result.outliers && result.outliers.length > 0) {
      console.log(`\n=== OUTLIERS DETECTED: ${result.outliers.length} ===`);
      result.outliers.forEach(outlier => {
        console.log(`  ${outlier.worldPointName} @ ${outlier.viewpointName}: ${outlier.error.toFixed(1)} px`);
      });
    } else {
      console.log('No outliers detected');
    }

    console.log('\n=== WORLD POINT POSITIONS (AFTER) ===');
    Array.from(project.worldPoints).forEach(wp => {
      const point = wp as WorldPoint;
      console.log(`${point.name}: [${point.optimizedXyz?.map(x => x.toFixed(3)).join(', ') || 'null'}]`);
    });

    console.log('\n=== LINE LENGTHS (AFTER) ===');
    const lineLengthErrors: Array<{line: string, actual: number, target: number, error: number}> = [];

    Array.from(project.lines).forEach(line => {
      const l = line as Line;
      const a = l.pointA.optimizedXyz;
      const b = l.pointB.optimizedXyz;
      if (a && b && l.targetLength !== undefined) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dz = b[2] - a[2];
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const error = Math.abs(length - l.targetLength);
        console.log(`${l.pointA.name} -> ${l.pointB.name}: ${length.toFixed(3)} (target: ${l.targetLength}, error: ${error.toFixed(3)}, direction: ${l.direction})`);
        lineLengthErrors.push({
          line: `${l.pointA.name}->${l.pointB.name}`,
          actual: length,
          target: l.targetLength,
          error: error
        });
      }
    });

    if (lineLengthErrors.length > 0) {
      const maxError = Math.max(...lineLengthErrors.map(e => e.error));
      const avgError = lineLengthErrors.reduce((sum, e) => sum + e.error, 0) / lineLengthErrors.length;
      console.log(`\n=== LINE LENGTH ACCURACY ===`);
      console.log(`Max error: ${maxError.toFixed(3)}`);
      console.log(`Avg error: ${avgError.toFixed(3)}`);

      if (maxError > 1.0) {
        console.log(`\nWORST LINES (error > 1.0):`);
        lineLengthErrors
          .filter(e => e.error > 1.0)
          .sort((a, b) => b.error - a.error)
          .forEach(e => {
            console.log(`  ${e.line}: actual=${e.actual.toFixed(3)}, target=${e.target.toFixed(3)}, error=${e.error.toFixed(3)}`);
          });
      }
    }

    console.log(`\n=== IMAGE POINT REPROJECTION ERRORS ===`);
    const imagePointErrors: Array<{worldPoint: string, viewpoint: string, error: number}> = [];

    for (const vp of project.viewpoints) {
      for (const ip of vp.imagePoints) {
        const ipConcrete = ip as any;
        if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length === 2) {
          const error = Math.sqrt(ipConcrete.lastResiduals[0] ** 2 + ipConcrete.lastResiduals[1] ** 2);
          imagePointErrors.push({
            worldPoint: ip.worldPoint.getName(),
            viewpoint: vp.getName(),
            error
          });
        }
      }
    }

    imagePointErrors.sort((a, b) => b.error - a.error);

    console.log(`\nTop 10 worst image point errors:`);
    imagePointErrors.slice(0, 10).forEach(e => {
      console.log(`  ${e.worldPoint} @ ${e.viewpoint}: ${e.error.toFixed(1)} px`);
    });

    console.log(`\nImage points for WP1 (problematic line endpoint):`);
    imagePointErrors.filter(e => e.worldPoint === 'WP1').forEach(e => {
      console.log(`  WP1 @ ${e.viewpoint}: ${e.error.toFixed(1)} px`);
    });

    console.log(`\nImage points for WP4 (locked at origin):`);
    imagePointErrors.filter(e => e.worldPoint === 'WP4').forEach(e => {
      console.log(`  WP4 @ ${e.viewpoint}: ${e.error.toFixed(1)} px`);
    });
  });
});
