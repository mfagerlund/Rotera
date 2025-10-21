/**
 * Integration tests for the optimizer using project fixtures.
 */

import { optimizeProject } from './optimizer';
import type { OptimizationExportDto } from '../types/optimization-export';

// Load project1.json fixture
import project1Data from '../../../tests/fixtures/project1.json';

describe('Optimizer Integration Tests', () => {
  it('should load project1.json fixture', () => {
    expect(project1Data).toBeDefined();
    expect(project1Data.worldPoints).toBeDefined();
    expect(project1Data.images).toBeDefined();
    expect(project1Data.cameras).toBeDefined();
  });

  it('should optimize project1.json', () => {
    // Convert fixture to OptimizationExportDto format
    const exportDto: OptimizationExportDto = {
      version: '0.1.0',
      exportedAt: new Date().toISOString(),
      worldPoints: project1Data.worldPoints,
      lines: project1Data.lines || [],
      cameras: project1Data.cameras,
      images: project1Data.images,
      constraints: [],
      metadata: {
        projectName: 'Project 1',
        projectId: 'project1',
        totalWorldPoints: project1Data.worldPoints.length,
        totalLines: 0,
        totalCameras: project1Data.cameras.length,
        totalImages: project1Data.images.length,
        totalConstraints: 0,
        totalImagePoints: project1Data.images.reduce(
          (sum: number, img: any) => sum + Object.keys(img.imagePoints).length,
          0
        )
      },
      statistics: {
        worldPointsWithCoordinates: project1Data.worldPoints.filter(
          (wp: any) => wp.xyz && wp.xyz.some((c: any) => c !== null)
        ).length,
        worldPointsWithoutCoordinates: project1Data.worldPoints.filter(
          (wp: any) => !wp.xyz || wp.xyz.every((c: any) => c === null)
        ).length,
        averageImagePointsPerWorldPoint: 0,
        constraintsByType: {},
        imagePointsPerImage: {}
      }
    };

    console.log('Project stats:');
    console.log(`  World points: ${exportDto.worldPoints.length}`);
    console.log(`  Cameras: ${exportDto.cameras.length}`);
    console.log(`  Images: ${exportDto.images.length}`);
    console.log(
      `  Image points: ${exportDto.metadata.totalImagePoints}`
    );

    // Count uninitialized world points
    const uninitialized = exportDto.worldPoints.filter(
      wp => !wp.xyz || wp.xyz.every(c => c === null)
    );
    console.log(`  Uninitialized world points: ${uninitialized.length}`);

    // Initialize uninitialized points with free axes (all null = all free)
    uninitialized.forEach(wp => {
      wp.xyz = [null, null, null];
    });

    // Run optimization
    const result = optimizeProject(exportDto, {
      maxIterations: 30,
      errorTolerance: 1e-3,
      verbose: true
    });

    console.log('\nOptimization result:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Final cost: ${result.finalCost.toFixed(6)}`);
    console.log(`  Convergence: ${result.convergenceReason}`);
    console.log(`  Computation time: ${result.computationTime.toFixed(3)}ms`);

    // Print first 3 optimized points
    const optimizedIds = Object.keys(result.optimizedWorldPoints).slice(0, 3);
    console.log('\nOptimized world points (first 3):');
    optimizedIds.forEach(id => {
      const pos = result.optimizedWorldPoints[id];
      console.log(
        `  ${id}: (${pos[0].toFixed(4)}, ${pos[1].toFixed(4)}, ${pos[2].toFixed(4)})`
      );
    });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.finalCost).toBeGreaterThanOrEqual(0);
    expect(result.finalCost).toBeLessThan(1e6);
    expect(Object.keys(result.optimizedWorldPoints).length).toBeGreaterThan(0);
  });

  it('should handle project with locked world points', () => {
    const exportDto: OptimizationExportDto = {
      version: '0.1.0',
      exportedAt: new Date().toISOString(),
      worldPoints: [
        {
          id: 'wp1',
          name: 'WP1',
          xyz: [0, 0, 0], // Origin fully locked
          color: '#ff0000',
          isVisible: true,
          isLocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'wp2',
          name: 'WP2',
          xyz: [null, null, null], // Fully free
          color: '#00ff00',
          isVisible: true,
          isLocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      lines: [],
      cameras: [],
      images: [],
      constraints: [],
      metadata: {
        projectName: 'Test',
        projectId: 'test',
        totalWorldPoints: 2,
        totalLines: 0,
        totalCameras: 0,
        totalImages: 0,
        totalConstraints: 0,
        totalImagePoints: 0
      },
      statistics: {
        worldPointsWithCoordinates: 1,
        worldPointsWithoutCoordinates: 1,
        averageImagePointsPerWorldPoint: 0,
        constraintsByType: {},
        imagePointsPerImage: {}
      }
    };

    // wp2 already initialized as [null, null, null] - fully free, no need to change

    const result = optimizeProject(exportDto, {
      maxIterations: 10,
      verbose: false
    });

    // Should succeed even with just lock constraints
    expect(result.success).toBe(true);

    // wp1 is fully locked, should not be in optimized results
    expect(result.optimizedWorldPoints['wp1']).toBeUndefined();

    // wp2 is fully free, should be in results
    expect(result.optimizedWorldPoints['wp2']).toBeDefined();
  });

  it('should handle project with per-axis locks', () => {
    const exportDto: OptimizationExportDto = {
      version: '0.1.0',
      exportedAt: new Date().toISOString(),
      worldPoints: [
        {
          id: 'wp1',
          name: 'WP1',
          xyz: [0, null, null], // X locked to 0, Y and Z free
          color: '#ff0000',
          isVisible: true,
          isLocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      lines: [],
      cameras: [],
      images: [],
      constraints: [],
      metadata: {
        projectName: 'Test',
        projectId: 'test',
        totalWorldPoints: 1,
        totalLines: 0,
        totalCameras: 0,
        totalImages: 0,
        totalConstraints: 0,
        totalImagePoints: 0
      },
      statistics: {
        worldPointsWithCoordinates: 1,
        worldPointsWithoutCoordinates: 0,
        averageImagePointsPerWorldPoint: 0,
        constraintsByType: {},
        imagePointsPerImage: {}
      }
    };

    // wp1 already initialized as [0, null, null] - X locked to 0, Y and Z free

    const result = optimizeProject(exportDto, {
      maxIterations: 20,
      verbose: false
    });

    expect(result.success).toBe(true);

    const optimized = result.optimizedWorldPoints['wp1'];
    expect(optimized).toBeDefined();

    // X should be locked to 0 (within tolerance)
    expect(Math.abs(optimized[0] - 0)).toBeLessThan(0.01);
  });
});
