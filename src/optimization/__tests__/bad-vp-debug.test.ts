import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import { loadProjectFromJson } from '../../store/project-serialization';
import { initializeCameraWithVanishingPoints } from '../vanishing-points';

describe('Bad Vertical VP Debug', () => {
  it('initializes straight-on camera with Y VP at horizontal midpoint', () => {
    const winPath = 'C:/Slask/bad vertical vanishing point.json';
    const wslPath = '/mnt/c/Slask/bad vertical vanishing point.json';
    const path = fs.existsSync(winPath) ? winPath : wslPath;
    if (!fs.existsSync(path)) {
      console.warn('Bad vertical VP fixture missing, skipping');
      return;
    }

    const json = fs.readFileSync(path, 'utf8');
    const project = loadProjectFromJson(json);
    const viewpoint = Array.from(project.viewpoints)[0];

    const success = initializeCameraWithVanishingPoints(viewpoint, new Set(project.worldPoints));
    expect(success).toBe(true);

    const cameraVps = (viewpoint as any).__initialCameraVps;
    expect(cameraVps).toBeDefined();
    expect(cameraVps.x).toBeDefined();
    expect(cameraVps.y).toBeDefined();
    expect(cameraVps.z).toBeDefined();

    const xVpU = cameraVps.x.u;
    const zVpU = cameraVps.z.u;
    const yVpU = cameraVps.y.u;

    const expectedMidpointU = (xVpU + zVpU) / 2;

    console.log(`X VP u: ${xVpU.toFixed(2)}`);
    console.log(`Z VP u: ${zVpU.toFixed(2)}`);
    console.log(`Y VP u: ${yVpU.toFixed(2)}`);
    console.log(`Expected Y VP u (midpoint): ${expectedMidpointU.toFixed(2)}`);
    console.log(`Horizontal error: ${Math.abs(yVpU - expectedMidpointU).toFixed(2)} pixels`);

    expect(Math.abs(yVpU - expectedMidpointU)).toBeLessThan(10);
  });
});
