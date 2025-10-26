import { describe, it, expect } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { optimizeProject } from '../optimize-project';

describe('Outlier Detection', () => {
  it('should automatically detect and flag outlier image points', () => {
    const project = Project.create('Test Project');

    const wp1 = WorldPoint.create('WP1');
    wp1.lockedXyz = [0, 0, 0];
    project.addWorldPoint(wp1);

    const wp2 = WorldPoint.create('WP2');
    wp2.lockedXyz = [10, 0, 0];
    project.addWorldPoint(wp2);

    const wp3 = WorldPoint.create('WP3');
    wp3.lockedXyz = [0, 10, 0];
    project.addWorldPoint(wp3);

    const wp4 = WorldPoint.create('WP4_Outlier');
    wp4.lockedXyz = [10, 10, 0];
    project.addWorldPoint(wp4);

    const camera = Viewpoint.create('Camera1', 'camera1.jpg', 'url', 2000, 2000, {
      focalLength: 1000,
      position: [5, 5, 20],
      rotation: [1, 0, 0, 0],
      isPoseLocked: true,
    });
    project.addViewpoint(camera);

    const ip1 = ImagePoint.create(wp1, camera, 750, 750);
    project.addImagePoint(ip1);
    camera.addImagePoint(ip1);
    wp1.addImagePoint(ip1);

    const ip2 = ImagePoint.create(wp2, camera, 1250, 750);
    project.addImagePoint(ip2);
    camera.addImagePoint(ip2);
    wp2.addImagePoint(ip2);

    const ip3 = ImagePoint.create(wp3, camera, 750, 1250);
    project.addImagePoint(ip3);
    camera.addImagePoint(ip3);
    wp3.addImagePoint(ip3);

    const ip4 = ImagePoint.create(wp4, camera, 500, 500);
    project.addImagePoint(ip4);
    camera.addImagePoint(ip4);
    wp4.addImagePoint(ip4);

    const result = optimizeProject(project, {
      maxIterations: 100,
      tolerance: 1e-6,
      damping: 1.0,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      detectOutliers: true,
      outlierThreshold: 3.0,
    });

    console.log('\n=== OUTLIER DETECTION TEST ===\n');
    console.log(`Converged: ${result.converged}`);
    console.log(`Median reprojection error: ${result.medianReprojectionError?.toFixed(2)} px`);
    console.log(`Outliers detected: ${result.outliers?.length || 0}`);

    if (result.outliers && result.outliers.length > 0) {
      console.log('\nOutliers:');
      for (const outlier of result.outliers) {
        console.log(`  - ${outlier.worldPointName} @ ${outlier.viewpointName}: ${outlier.error.toFixed(1)} px`);
        console.log(`    isOutlier flag: ${outlier.imagePoint.isOutlier}`);
      }
    }

    expect(result.medianReprojectionError).toBeDefined();
    expect(result.outliers).toBeDefined();

    if (result.outliers && result.outliers.length > 0) {
      expect(result.outliers[0].worldPointName).toBe('WP4_Outlier');
      expect(result.outliers[0].imagePoint.isOutlier).toBe(true);
    }

    const nonOutlierPoints = [ip1, ip2, ip3].filter(ip => !ip.isOutlier);
    expect(nonOutlierPoints.length).toBe(3);

    console.log('\nTest PASSED: Outlier detection correctly identified bad image point');
  });

  it('should respect detectOutliers option when disabled', () => {
    const project = Project.create('Test Project');

    const wp1 = WorldPoint.create('WP1');
    wp1.lockedXyz = [0, 0, 0];
    project.addWorldPoint(wp1);

    const camera = Viewpoint.create('Camera1', 'camera1.jpg', 'url', 2000, 2000, {
      focalLength: 1000,
      position: [0, 0, 10],
      rotation: [1, 0, 0, 0],
      isPoseLocked: true,
    });
    project.addViewpoint(camera);

    const ip1 = ImagePoint.create(wp1, camera, 1000, 1000);
    project.addImagePoint(ip1);
    camera.addImagePoint(ip1);
    wp1.addImagePoint(ip1);

    const result = optimizeProject(project, {
      maxIterations: 100,
      tolerance: 1e-6,
      damping: 1.0,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      detectOutliers: false,
    });

    expect(result.outliers).toBeUndefined();
    expect(result.medianReprojectionError).toBeUndefined();
  });

  it('should handle case with no outliers', () => {
    const project = Project.create('Test Project');

    const wp1 = WorldPoint.create('WP1');
    wp1.lockedXyz = [0, 0, 0];
    project.addWorldPoint(wp1);

    const wp2 = WorldPoint.create('WP2');
    wp2.lockedXyz = [10, 0, 0];
    project.addWorldPoint(wp2);

    const camera = Viewpoint.create('Camera1', 'camera1.jpg', 'url', 2000, 2000, {
      focalLength: 1000,
      position: [5, 0, 20],
      rotation: [1, 0, 0, 0],
      isPoseLocked: true,
    });
    project.addViewpoint(camera);

    const ip1 = ImagePoint.create(wp1, camera, 875, 1000);
    project.addImagePoint(ip1);
    camera.addImagePoint(ip1);
    wp1.addImagePoint(ip1);

    const ip2 = ImagePoint.create(wp2, camera, 1125, 1000);
    project.addImagePoint(ip2);
    camera.addImagePoint(ip2);
    wp2.addImagePoint(ip2);

    const result = optimizeProject(project, {
      maxIterations: 100,
      tolerance: 1e-6,
      damping: 1.0,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      detectOutliers: true,
      outlierThreshold: 3.0,
    });

    expect(result.medianReprojectionError).toBeDefined();
    expect(result.outliers).toBeDefined();
    expect(result.outliers?.length).toBe(0);

    console.log('\nTest PASSED: No outliers detected when all points are good');
  });
});
