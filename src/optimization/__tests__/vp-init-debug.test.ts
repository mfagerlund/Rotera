/**
 * Debug vanishing point initialization failure
 */

import { describe, it } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import * as fs from 'fs';
import * as path from 'path';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { validateVanishingPoints, initializeCameraWithVanishingPoints } from '../vanishing-points';

describe('VP Initialization Debug', () => {
  it('should debug why VP initialization fails on exaggerated perspective', () => {
    const jsonPath = path.join(__dirname, 'fixtures', 'cube-2vps-exaggerated.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint;
    const worldPoints = new Set(Array.from(project.worldPoints) as WorldPoint[]);

    console.log('\n=== VIEWPOINT INFO ===');
    console.log(`Name: ${viewpoint.name}`);
    console.log(`Vanishing lines: ${viewpoint.getVanishingLineCount()}`);
    console.log(`Image points: ${viewpoint.imagePoints.size}`);
    console.log(`Current position: [${viewpoint.position.join(', ')}]`);
    console.log(`Current rotation: [${viewpoint.rotation.join(', ')}]`);

    const vanishingLines = Array.from(viewpoint.vanishingLines);
    console.log('\nVanishing lines by axis:');
    const byAxis: Record<string, number> = {};
    for (const vl of vanishingLines) {
      byAxis[vl.axis] = (byAxis[vl.axis] || 0) + 1;
    }
    console.log(byAxis);

    console.log('\n=== VALIDATION ===');
    const validation = validateVanishingPoints(viewpoint);
    console.log(`Is valid: ${validation.isValid}`);
    if (validation.errors.length > 0) {
      console.log('Errors:');
      validation.errors.forEach(err => console.log(`  - ${err}`));
    }
    if (validation.warnings.length > 0) {
      console.log('Warnings:');
      validation.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    if (validation.vanishingPoints) {
      console.log('\nVanishing points computed:');
      for (const [axis, vp] of Object.entries(validation.vanishingPoints)) {
        if (vp) {
          console.log(`  ${axis.toUpperCase()}: (${vp.u.toFixed(1)}, ${vp.v.toFixed(1)})`);
        }
      }
    }

    if (validation.anglesBetweenVPs) {
      console.log('\nAngles between VPs:');
      for (const [pair, angle] of Object.entries(validation.anglesBetweenVPs)) {
        if (angle !== undefined) {
          console.log(`  ${pair}: ${angle.toFixed(1)}°`);
        }
      }
    }

    console.log('\n=== LOCKED POINTS ===');
    const fullyLockedPoints = Array.from(worldPoints).filter(wp => {
      const eff = wp.getEffectiveXyz();
      return eff.every(v => v !== null);
    });
    console.log(`Fully constrained points: ${fullyLockedPoints.length}`);
    for (const wp of fullyLockedPoints) {
      const imagePoints = viewpoint.getImagePointsForWorldPoint(wp);
      console.log(`  ${wp.name}: xyz=${JSON.stringify(wp.getEffectiveXyz())}, has image point: ${imagePoints.length > 0}`);
    }

    console.log('\n=== CAN INITIALIZE CHECK ===');
    const canInit = viewpoint.canInitializeWithVanishingPoints(worldPoints);
    console.log(`canInitializeWithVanishingPoints: ${canInit}`);

    console.log('\n=== ATTEMPTING INITIALIZATION ===');
    const success = initializeCameraWithVanishingPoints(viewpoint, worldPoints);
    console.log(`Initialization result: ${success}`);

    if (success) {
      console.log('\n=== INITIALIZED CAMERA ===');
      console.log(`Position: [${viewpoint.position.map(v => v.toFixed(3)).join(', ')}]`);
      console.log(`Rotation: [${viewpoint.rotation.map(v => v.toFixed(3)).join(', ')}]`);
      console.log(`Focal length: ${viewpoint.focalLength.toFixed(1)}`);
    } else {
      console.log('\n=== INITIALIZATION FAILED ===');
      console.log('Check console output above for error messages');
    }
  });
});
