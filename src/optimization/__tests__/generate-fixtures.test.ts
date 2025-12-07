/**
 * Test to generate fixtures for solving scenarios.
 * Run this once to create the fixture files, then disable.
 */

import { describe, it } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { saveProjectToJson } from '../../store/project-serialization';
import { VanishingLine } from '../../entities/vanishing-line';
import { Line } from '../../entities/line';
import * as fs from 'fs';
import * as path from 'path';
import {
  quaternionFromEuler,
  projectWorldPointToPixel,
  StandardCameraParams,
} from './fixture-generator-helpers';

describe.skip('Generate Fixtures', () => {
  it('should generate Scenario 01: Simple PnP fixture', () => {
    const { imageWidth, imageHeight, focalLength, principalPointX, principalPointY, aspectRatio, skewCoefficient } = StandardCameraParams;

    const cameraPosition: [number, number, number] = [0, 0, -20];
    const cameraRotationQuat: [number, number, number, number] = [1, 0, 0, 0];

    const worldPointPositions: Array<[number, number, number]> = [
      [-5, -5, 0],
      [5, -5, 0],
      [5, 5, 0],
      [-5, 5, 0]
    ];

    const project = Project.create('Scenario 01: Simple PnP');
    project.autoOptimize = false;

    const worldPoints: WorldPoint[] = [];
    for (let i = 0; i < worldPointPositions.length; i++) {
      const pos = worldPointPositions[i];
      const wp = WorldPoint.create(`P${i + 1}`);
      wp.lockedXyz = [...pos];
      project.addWorldPoint(wp);
      worldPoints.push(wp);
    }

    const viewpoint = Viewpoint.create(
      'Camera1',
      'scenario-01.jpg',
      '',
      imageWidth,
      imageHeight,
      { focalLength, principalPointX, principalPointY, aspectRatio, skewCoefficient }
    );

    viewpoint.position = [0, 0, 0];
    viewpoint.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint);

    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const projected = projectWorldPointToPixel(
        worldPointPositions[i],
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected === null) {
        throw new Error(`Point ${wp.name} projects behind camera`);
      }

      const [u, v] = projected;
      const ip = ImagePoint.create(wp, viewpoint, u, v);
      project.addImagePoint(ip);
    }

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-01-simple-pnp.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera position: ${JSON.stringify(cameraPosition)}`);
    console.log(`Ground truth camera rotation (quat): ${JSON.stringify(cameraRotationQuat)}`);
  });

  it('should generate Scenario 02: PnP with Bundle Adjustment fixture', () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    const focalLength = 1500;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;
    const aspectRatio = 1.0;

    const cameraPosition: [number, number, number] = [0, 5, -25];
    const cameraRotationQuat: [number, number, number, number] = [1, 0, 0, 0];

    const worldPointPositions: Array<[number, number, number]> = [
      [-5, -5, 0],
      [5, -5, 0],
      [5, 5, 0],
      [-3, 2, 0],
      [3, -2, 0]
    ];

    const lockedCoordinates: Array<[number | null, number | null, number | null]> = [
      [-5, -5, 0],
      [5, -5, 0],
      [5, 5, 0],
      [null, null, 0],
      [null, null, 0]
    ];

    const project = Project.create('Scenario 02: PnP with Bundle Adjustment');
    project.autoOptimize = false;

    const worldPoints: WorldPoint[] = [];
    for (let i = 0; i < worldPointPositions.length; i++) {
      const pos = worldPointPositions[i];
      const wp = WorldPoint.create(`P${i + 1}`);
      wp.lockedXyz = lockedCoordinates[i];
      project.addWorldPoint(wp);
      worldPoints.push(wp);
    }

    const viewpoint = Viewpoint.create(
      'Camera1',
      'scenario-02.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint.position = [0, 0, 0];
    viewpoint.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint);

    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const projected = projectWorldPointToPixel(
        worldPointPositions[i],
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected === null) {
        throw new Error(`Point ${wp.name} projects behind camera`);
      }

      const [u, v] = projected;
      const ip = ImagePoint.create(wp, viewpoint, u, v);
      project.addImagePoint(ip);
    }

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-02-pnp-bundle-adjustment.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera position: ${JSON.stringify(cameraPosition)}`);
    console.log(`Ground truth camera rotation (quat): ${JSON.stringify(cameraRotationQuat)}`);
    console.log(`World point P4 ground truth: ${JSON.stringify(worldPointPositions[3])}`);
    console.log(`World point P5 ground truth: ${JSON.stringify(worldPointPositions[4])}`);
  });

  it('should generate Scenario 03: Vanishing Points Only fixture', () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    const focalLength = 1500;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;
    const aspectRatio = 1.0;

    const cameraPosition: [number, number, number] = [10, 8, -15];
    const cameraEuler: [number, number, number] = [0.3, -0.2, 0];
    const cameraRotationQuat = quaternionFromEuler(
      cameraEuler[0],
      cameraEuler[1],
      cameraEuler[2]
    );

    const project = Project.create('Scenario 03: Vanishing Points Only');
    project.autoOptimize = false;

    const viewpoint = Viewpoint.create(
      'Camera1',
      'scenario-03.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint.position = [0, 0, 0];
    viewpoint.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint);

    const worldLines3D_X: Array<[[number, number, number], [number, number, number]]> = [
      [[-5, 0, 0], [5, 0, 0]],
      [[-5, 0, 5], [5, 0, 5]],
      [[-5, 0, -5], [5, 0, -5]]
    ];

    const worldLines3D_Z: Array<[[number, number, number], [number, number, number]]> = [
      [[0, 0, -5], [0, 0, 5]],
      [[5, 0, -5], [5, 0, 5]],
      [[-5, 0, -5], [-5, 0, 5]]
    ];

    let lineCounter = 0;
    for (const [p1_3d, p2_3d] of worldLines3D_X) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_X_${lineCounter++}`,
          viewpoint,
          'x',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    for (const [p1_3d, p2_3d] of worldLines3D_Z) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_Z_${lineCounter++}`,
          viewpoint,
          'z',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    const lockedWorldPoints: Array<[string, [number, number, number]]> = [
      ['Origin', [0, 0, 0]],
      ['RefPoint', [10, 0, 0]]
    ];

    for (const [name, pos] of lockedWorldPoints) {
      const wp = WorldPoint.create(name);
      wp.lockedXyz = [...pos];
      project.addWorldPoint(wp);

      const projected = projectWorldPointToPixel(
        pos,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected) {
        const [u, v] = projected;
        const ip = ImagePoint.create(wp, viewpoint, u, v);
        project.addImagePoint(ip);
      }
    }

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-03-vanishing-points.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera position: ${JSON.stringify(cameraPosition)}`);
    console.log(`Ground truth camera rotation (quat): ${JSON.stringify(cameraRotationQuat)}`);
    console.log(`Vanishing lines created: ${viewpoint.getVanishingLineCount()}`);
  });

  it('should generate Scenario 04: Vanishing Points with Line Constraints fixture', () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    const focalLength = 1500;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;
    const aspectRatio = 1.0;

    const cameraPosition: [number, number, number] = [8, 6, -12];
    const cameraEuler: [number, number, number] = [0.2, -0.15, 0];
    const cameraRotationQuat = quaternionFromEuler(
      cameraEuler[0],
      cameraEuler[1],
      cameraEuler[2]
    );

    const project = Project.create('Scenario 04: VP with Line Constraints');
    project.autoOptimize = false;

    const viewpoint = Viewpoint.create(
      'Camera1',
      'scenario-04.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint.position = [0, 0, 0];
    viewpoint.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint);

    const worldLines3D_X: Array<[[number, number, number], [number, number, number]]> = [
      [[-5, 0, 0], [5, 0, 0]],
      [[-5, 0, 5], [5, 0, 5]]
    ];

    const worldLines3D_Z: Array<[[number, number, number], [number, number, number]]> = [
      [[0, 0, -5], [0, 0, 5]],
      [[5, 0, -5], [5, 0, 5]]
    ];

    let lineCounter = 0;
    for (const [p1_3d, p2_3d] of worldLines3D_X) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_X_${lineCounter++}`,
          viewpoint,
          'x',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    for (const [p1_3d, p2_3d] of worldLines3D_Z) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_Z_${lineCounter++}`,
          viewpoint,
          'z',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    const lockedWorldPoints: Array<[string, [number, number, number]]> = [
      ['Origin', [0, 0, 0]],
      ['P10', [10, 0, 0]],
      ['P5Z', [5, 0, 5]]
    ];

    const worldPoints: WorldPoint[] = [];
    for (const [name, pos] of lockedWorldPoints) {
      const wp = WorldPoint.create(name);
      wp.lockedXyz = [...pos];
      project.addWorldPoint(wp);
      worldPoints.push(wp);

      const projected = projectWorldPointToPixel(
        pos,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected) {
        const [u, v] = projected;
        const ip = ImagePoint.create(wp, viewpoint, u, v);
        project.addImagePoint(ip);
      }
    }

    const line = Line.create('OriginToP10', worldPoints[0], worldPoints[1], {
      direction: 'x',
      color: '#ff0000'
    });
    project.addLine(line);

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-04-vp-with-line-constraints.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera position: ${JSON.stringify(cameraPosition)}`);
    console.log(`Ground truth camera rotation (quat): ${JSON.stringify(cameraRotationQuat)}`);
    console.log(`Vanishing lines created: ${viewpoint.getVanishingLineCount()}`);
    console.log(`Lines with constraints: ${project.lines.size}`);
  });

  it('should generate Scenario 05: Essential Matrix Initialization fixture', () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    // Use imageWidth as focal length so the fixture is robust to intrinsic resets
    const focalLength = imageWidth;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;
    const aspectRatio = 1.0;

    const camera1Position: [number, number, number] = [0, 0, -20];
    const camera1RotationQuat: [number, number, number, number] = [1, 0, 0, 0];

    const camera2Position: [number, number, number] = [10, 0, -20];
    const camera2Euler: [number, number, number] = [0, Math.PI / 12, 0];
    const camera2RotationQuat = quaternionFromEuler(
      camera2Euler[0],
      camera2Euler[1],
      camera2Euler[2]
    );

    const worldPointPositions: Array<[number, number, number]> = [
      [-5, -5, 0],
      [5, -5, 0],
      [5, 5, 0],
      [-5, 5, 0],
      [-3, 0, 5],
      [3, 0, 5],
      [0, 3, 8],
      [0, -3, 8]
    ];

    const project = Project.create('Scenario 05: Essential Matrix Initialization');
    project.autoOptimize = false;

    const worldPoints: WorldPoint[] = [];
    for (let i = 0; i < worldPointPositions.length; i++) {
      const wp = WorldPoint.create(`P${i + 1}`);
      project.addWorldPoint(wp);
      worldPoints.push(wp);
    }

    const viewpoint1 = Viewpoint.create(
      'Camera1',
      'scenario-05-camera1.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint1.position = [0, 0, 0];
    viewpoint1.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint1);

    const viewpoint2 = Viewpoint.create(
      'Camera2',
      'scenario-05-camera2.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint2.position = [0, 0, 0];
    viewpoint2.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint2);

    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];

      const projected1 = projectWorldPointToPixel(
        worldPointPositions[i],
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected1 === null) {
        throw new Error(`Point ${wp.name} projects behind camera 1`);
      }

      const [u1, v1] = projected1;
      const ip1 = ImagePoint.create(wp, viewpoint1, u1, v1);
      project.addImagePoint(ip1);

      const projected2 = projectWorldPointToPixel(
        worldPointPositions[i],
        camera2Position,
        camera2RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected2 === null) {
        throw new Error(`Point ${wp.name} projects behind camera 2`);
      }

      const [u2, v2] = projected2;
      const ip2 = ImagePoint.create(wp, viewpoint2, u2, v2);
      project.addImagePoint(ip2);
    }

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-05-essential-matrix.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera 1 position: ${JSON.stringify(camera1Position)}`);
    console.log(`Ground truth camera 1 rotation (quat): ${JSON.stringify(camera1RotationQuat)}`);
    console.log(`Ground truth camera 2 position: ${JSON.stringify(camera2Position)}`);
    console.log(`Ground truth camera 2 rotation (quat): ${JSON.stringify(camera2RotationQuat)}`);
    console.log(`World points: ${worldPoints.length} (all unlocked)`);
    console.log(`Image points per camera: ${worldPoints.length}`);
  });

  it('should generate Scenario 06: Two Cameras with Scale fixture', () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    const focalLength = 1500;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;
    const aspectRatio = 1.0;

    const camera1Position: [number, number, number] = [0, 0, -25];
    const camera1RotationQuat: [number, number, number, number] = [1, 0, 0, 0];

    const camera2Position: [number, number, number] = [15, 0, -25];
    const camera2Euler: [number, number, number] = [0, Math.PI / 10, 0];
    const camera2RotationQuat = quaternionFromEuler(
      camera2Euler[0],
      camera2Euler[1],
      camera2Euler[2]
    );

    const worldPointPositions: Array<[number, number, number]> = [
      [-5, -5, 0],
      [5, -5, 0],
      [5, 5, 0],
      [-5, 5, 0],
      [-3, 0, 5],
      [3, 0, 5],
      [0, 3, 8],
      [0, -3, 8]
    ];

    const lockedIndices = [0, 1, 2];

    const project = Project.create('Scenario 06: Two Cameras with Scale');
    project.autoOptimize = false;

    const worldPoints: WorldPoint[] = [];
    for (let i = 0; i < worldPointPositions.length; i++) {
      const wp = WorldPoint.create(`P${i + 1}`);
      if (lockedIndices.includes(i)) {
        wp.lockedXyz = [...worldPointPositions[i]];
      }
      project.addWorldPoint(wp);
      worldPoints.push(wp);
    }

    const viewpoint1 = Viewpoint.create(
      'Camera1',
      'scenario-06-camera1.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint1.position = [0, 0, 0];
    viewpoint1.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint1);

    const viewpoint2 = Viewpoint.create(
      'Camera2',
      'scenario-06-camera2.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint2.position = [0, 0, 0];
    viewpoint2.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint2);

    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];

      const projected1 = projectWorldPointToPixel(
        worldPointPositions[i],
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected1 === null) {
        throw new Error(`Point ${wp.name} projects behind camera 1`);
      }

      const [u1, v1] = projected1;
      const ip1 = ImagePoint.create(wp, viewpoint1, u1, v1);
      project.addImagePoint(ip1);

      const projected2 = projectWorldPointToPixel(
        worldPointPositions[i],
        camera2Position,
        camera2RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected2 === null) {
        throw new Error(`Point ${wp.name} projects behind camera 2`);
      }

      const [u2, v2] = projected2;
      const ip2 = ImagePoint.create(wp, viewpoint2, u2, v2);
      project.addImagePoint(ip2);
    }

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-06-two-cameras-with-scale.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera 1 position: ${JSON.stringify(camera1Position)}`);
    console.log(`Ground truth camera 1 rotation (quat): ${JSON.stringify(camera1RotationQuat)}`);
    console.log(`Ground truth camera 2 position: ${JSON.stringify(camera2Position)}`);
    console.log(`Ground truth camera 2 rotation (quat): ${JSON.stringify(camera2RotationQuat)}`);
    console.log(`World points: ${worldPoints.length} (${lockedIndices.length} locked, ${worldPoints.length - lockedIndices.length} unlocked)`);
    console.log(`Locked points: ${lockedIndices.map(i => `P${i+1}`).join(', ')}`);
    console.log(`Image points per camera: ${worldPoints.length}`);
  });

  it('should generate Scenario 07: Mixed VP + PnP fixture', () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    const focalLength = 1500;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;
    const aspectRatio = 1.0;

    const camera1Position: [number, number, number] = [8, 6, -12];
    const camera1Euler: [number, number, number] = [0.2, -0.15, 0];
    const camera1RotationQuat = quaternionFromEuler(
      camera1Euler[0],
      camera1Euler[1],
      camera1Euler[2]
    );

    const camera2Position: [number, number, number] = [0, 0, -25];
    const camera2RotationQuat: [number, number, number, number] = [1, 0, 0, 0];

    const worldPointPositions: Array<[number, number, number]> = [
      [0, 0, 0],
      [10, 0, 0],
      [5, 0, 5],
      [-5, -5, 0],
      [5, 5, 0]
    ];

    const lockedIndices = [0, 1, 2];

    const project = Project.create('Scenario 07: Mixed VP + PnP');
    project.autoOptimize = false;

    const worldPoints: WorldPoint[] = [];
    for (let i = 0; i < worldPointPositions.length; i++) {
      const wp = WorldPoint.create(`P${i + 1}`);
      if (lockedIndices.includes(i)) {
        wp.lockedXyz = [...worldPointPositions[i]];
      }
      project.addWorldPoint(wp);
      worldPoints.push(wp);
    }

    const viewpoint1 = Viewpoint.create(
      'Camera1',
      'scenario-07-camera1.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint1.position = [0, 0, 0];
    viewpoint1.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint1);

    const worldLines3D_X: Array<[[number, number, number], [number, number, number]]> = [
      [[-5, 0, 0], [5, 0, 0]],
      [[-5, 0, 5], [5, 0, 5]]
    ];

    const worldLines3D_Z: Array<[[number, number, number], [number, number, number]]> = [
      [[0, 0, -5], [0, 0, 5]],
      [[5, 0, -5], [5, 0, 5]]
    ];

    let lineCounter = 0;
    for (const [p1_3d, p2_3d] of worldLines3D_X) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_X_${lineCounter++}`,
          viewpoint1,
          'x',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    for (const [p1_3d, p2_3d] of worldLines3D_Z) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_Z_${lineCounter++}`,
          viewpoint1,
          'z',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    for (let i = 0; i < 3; i++) {
      const wp = worldPoints[i];
      const projected = projectWorldPointToPixel(
        worldPointPositions[i],
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected) {
        const [u, v] = projected;
        const ip = ImagePoint.create(wp, viewpoint1, u, v);
        project.addImagePoint(ip);
      }
    }

    const viewpoint2 = Viewpoint.create(
      'Camera2',
      'scenario-07-camera2.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint2.position = [0, 0, 0];
    viewpoint2.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint2);

    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const projected = projectWorldPointToPixel(
        worldPointPositions[i],
        camera2Position,
        camera2RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected) {
        const [u, v] = projected;
        const ip = ImagePoint.create(wp, viewpoint2, u, v);
        project.addImagePoint(ip);
      }
    }

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-07-mixed-vp-pnp.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera 1 position: ${JSON.stringify(camera1Position)}`);
    console.log(`Ground truth camera 1 rotation (quat): ${JSON.stringify(camera1RotationQuat)}`);
    console.log(`Ground truth camera 2 position: ${JSON.stringify(camera2Position)}`);
    console.log(`Ground truth camera 2 rotation (quat): ${JSON.stringify(camera2RotationQuat)}`);
    console.log(`World points: ${worldPoints.length} (${lockedIndices.length} locked, ${worldPoints.length - lockedIndices.length} unlocked)`);
    console.log(`Vanishing lines (Camera1): ${viewpoint1.getVanishingLineCount()}`);
    console.log(`Image points Camera1: 3 (locked points only)`);
    console.log(`Image points Camera2: ${worldPoints.length} (all points)`);
  });

  it('should generate Scenario 08: Length-Constrained Lines fixture', () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    const focalLength = 1500;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;
    const aspectRatio = 1.0;

    const camera1Position: [number, number, number] = [0, 0, -25];
    const camera1RotationQuat: [number, number, number, number] = [1, 0, 0, 0];

    const camera2Position: [number, number, number] = [15, 0, -25];
    const camera2Euler: [number, number, number] = [0, Math.PI / 10, 0];
    const camera2RotationQuat = quaternionFromEuler(
      camera2Euler[0],
      camera2Euler[1],
      camera2Euler[2]
    );

    const worldPointPositions: Array<[number, number, number]> = [
      [-5, -5, 0],
      [5, -5, 0],
      [5, 5, 0],
      [-5, 5, 0]
    ];

    const lockedIndices = [0, 1, 2];

    const project = Project.create('Scenario 08: Length-Constrained Lines');
    project.autoOptimize = false;

    const worldPoints: WorldPoint[] = [];
    for (let i = 0; i < worldPointPositions.length; i++) {
      const wp = WorldPoint.create(`P${i + 1}`);
      if (lockedIndices.includes(i)) {
        wp.lockedXyz = [...worldPointPositions[i]];
      }
      project.addWorldPoint(wp);
      worldPoints.push(wp);
    }

    const viewpoint1 = Viewpoint.create(
      'Camera1',
      'scenario-08-camera1.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint1.position = [0, 0, 0];
    viewpoint1.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint1);

    const viewpoint2 = Viewpoint.create(
      'Camera2',
      'scenario-08-camera2.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint2.position = [0, 0, 0];
    viewpoint2.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint2);

    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];

      const projected1 = projectWorldPointToPixel(
        worldPointPositions[i],
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected1 === null) {
        throw new Error(`Point ${wp.name} projects behind camera 1`);
      }

      const [u1, v1] = projected1;
      const ip1 = ImagePoint.create(wp, viewpoint1, u1, v1);
      project.addImagePoint(ip1);

      const projected2 = projectWorldPointToPixel(
        worldPointPositions[i],
        camera2Position,
        camera2RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected2 === null) {
        throw new Error(`Point ${wp.name} projects behind camera 2`);
      }

      const [u2, v2] = projected2;
      const ip2 = ImagePoint.create(wp, viewpoint2, u2, v2);
      project.addImagePoint(ip2);
    }

    const line1 = Line.create('Line1', worldPoints[0], worldPoints[1], {
      targetLength: 10.0,
      color: '#ff0000'
    });
    project.addLine(line1);

    const line2 = Line.create('Line2', worldPoints[2], worldPoints[3], {
      targetLength: 10.0,
      color: '#00ff00'
    });
    project.addLine(line2);

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-08-length-constraints.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera 1 position: ${JSON.stringify(camera1Position)}`);
    console.log(`Ground truth camera 2 position: ${JSON.stringify(camera2Position)}`);
    console.log(`World points: ${worldPoints.length} (${lockedIndices.length} locked, ${worldPoints.length - lockedIndices.length} unlocked)`);
    console.log(`Lines with length constraints: ${project.lines.size}`);
    console.log(`  Line1: P1 <-> P2, target length = 10.0`);
    console.log(`  Line2: P3 <-> P4, target length = 10.0`);
  });

  it('should generate Scenario 09: Direction + Length Constraints fixture', () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    const focalLength = 1500;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;
    const aspectRatio = 1.0;

    const cameraPosition: [number, number, number] = [8, 6, -12];
    const cameraEuler: [number, number, number] = [0.2, -0.15, 0];
    const cameraRotationQuat = quaternionFromEuler(
      cameraEuler[0],
      cameraEuler[1],
      cameraEuler[2]
    );

    const project = Project.create('Scenario 09: Direction + Length Constraints');
    project.autoOptimize = false;

    const viewpoint = Viewpoint.create(
      'Camera1',
      'scenario-09.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );

    viewpoint.position = [0, 0, 0];
    viewpoint.rotation = [1, 0, 0, 0];

    project.addViewpoint(viewpoint);

    const worldLines3D_X: Array<[[number, number, number], [number, number, number]]> = [
      [[-5, 0, 0], [5, 0, 0]],
      [[-5, 5, 0], [5, 5, 0]]
    ];

    const worldLines3D_Y: Array<[[number, number, number], [number, number, number]]> = [
      [[0, -5, 0], [0, 5, 0]],
      [[5, -5, 0], [5, 5, 0]]
    ];

    const worldLines3D_Z: Array<[[number, number, number], [number, number, number]]> = [
      [[0, 0, -5], [0, 0, 5]],
      [[5, 0, -5], [5, 0, 5]]
    ];

    let lineCounter = 0;
    for (const [p1_3d, p2_3d] of worldLines3D_X) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_X_${lineCounter++}`,
          viewpoint,
          'x',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    for (const [p1_3d, p2_3d] of worldLines3D_Y) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_Y_${lineCounter++}`,
          viewpoint,
          'y',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    for (const [p1_3d, p2_3d] of worldLines3D_Z) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_Z_${lineCounter++}`,
          viewpoint,
          'z',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    const worldPointPositions: Array<[string, [number, number, number], boolean]> = [
      ['Origin', [0, 0, 0], true],
      ['PX', [10, 0, 0], true],
      ['PY', [0, 10, 0], false],
      ['PZ', [0, 0, 10], false]
    ];

    const worldPoints: WorldPoint[] = [];
    for (const [name, pos, locked] of worldPointPositions) {
      const wp = WorldPoint.create(name);
      if (locked) {
        wp.lockedXyz = [...pos];
      }
      project.addWorldPoint(wp);
      worldPoints.push(wp);

      const projected = projectWorldPointToPixel(
        pos,
        cameraPosition,
        cameraRotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected) {
        const [u, v] = projected;
        const ip = ImagePoint.create(wp, viewpoint, u, v);
        project.addImagePoint(ip);
      }
    }

    const lineX = Line.create('LineX', worldPoints[0], worldPoints[1], {
      direction: 'x',
      targetLength: 10.0,
      color: '#ff0000'
    });
    project.addLine(lineX);

    const lineY = Line.create('LineY', worldPoints[0], worldPoints[2], {
      direction: 'y',
      targetLength: 10.0,
      color: '#00ff00'
    });
    project.addLine(lineY);

    const lineZ = Line.create('LineZ', worldPoints[0], worldPoints[3], {
      direction: 'z',
      targetLength: 10.0,
      color: '#0000ff'
    });
    project.addLine(lineZ);

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-09-direction-length.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera position: ${JSON.stringify(cameraPosition)}`);
    console.log(`Ground truth camera rotation (quat): ${JSON.stringify(cameraRotationQuat)}`);
    console.log(`Vanishing lines: ${viewpoint.getVanishingLineCount()} (2 X, 2 Y, 2 Z)`);
    console.log(`World points: 4 (2 locked: Origin + PX, 2 unlocked: PY + PZ)`);
    console.log(`Lines with constraints: 3 (all with direction + length)`);
    console.log(`  LineX: Origin <-> PX, x-aligned, target length = 10.0 (both locked)`);
    console.log(`  LineY: Origin <-> PY, vertical, target length = 10.0 (Origin locked, PY unlocked)`);
    console.log(`  LineZ: Origin <-> PZ, z-aligned, target length = 10.0 (Origin locked, PZ unlocked)`);
  });

  it('should generate Scenario 10: Complex Multi-Camera Scene fixture', () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    const focalLength = 1500;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;
    const aspectRatio = 1.0;

    const camera1Position: [number, number, number] = [8, 6, -12];
    const camera1Euler: [number, number, number] = [0.2, -0.15, 0];
    const camera1RotationQuat = quaternionFromEuler(
      camera1Euler[0],
      camera1Euler[1],
      camera1Euler[2]
    );

    const camera2Position: [number, number, number] = [0, 0, -25];
    const camera2RotationQuat: [number, number, number, number] = [1, 0, 0, 0];

    const camera3Position: [number, number, number] = [15, 0, -25];
    const camera3Euler: [number, number, number] = [0, Math.PI / 10, 0];
    const camera3RotationQuat = quaternionFromEuler(
      camera3Euler[0],
      camera3Euler[1],
      camera3Euler[2]
    );

    const project = Project.create('Scenario 10: Complex Multi-Camera Scene');
    project.autoOptimize = false;

    const worldPointPositions: Array<[string, [number, number, number], boolean]> = [
      ['P1', [0, 0, 0], true],
      ['P2', [10, 0, 0], true],
      ['P3', [5, 5, 0], true],
      ['P4', [10, 0, 0], false],
      ['P5', [-3, 0, 5], false],
      ['P6', [3, 0, 5], false],
      ['P7', [0, 3, 8], false],
      ['P8', [0, 0, 10], false],
      ['P9', [5, -3, 8], false],
      ['P10', [8, -3, 8], false]
    ];

    const worldPoints: WorldPoint[] = [];
    for (const [name, pos, locked] of worldPointPositions) {
      const wp = WorldPoint.create(name);
      if (locked) {
        wp.lockedXyz = [...pos];
      }
      project.addWorldPoint(wp);
      worldPoints.push(wp);
    }

    const viewpoint1 = Viewpoint.create(
      'Camera1',
      'scenario-10-camera1.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );
    viewpoint1.position = [0, 0, 0];
    viewpoint1.rotation = [1, 0, 0, 0];
    project.addViewpoint(viewpoint1);

    const worldLines3D_X: Array<[[number, number, number], [number, number, number]]> = [
      [[-5, 0, 0], [5, 0, 0]],
      [[-5, 5, 0], [5, 5, 0]]
    ];

    const worldLines3D_Z: Array<[[number, number, number], [number, number, number]]> = [
      [[0, 0, -5], [0, 0, 5]],
      [[5, 0, -5], [5, 0, 5]]
    ];

    let lineCounter = 0;
    for (const [p1_3d, p2_3d] of worldLines3D_X) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_X_${lineCounter++}`,
          viewpoint1,
          'x',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    for (const [p1_3d, p2_3d] of worldLines3D_Z) {
      const p1_2d = projectWorldPointToPixel(
        p1_3d,
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      const p2_2d = projectWorldPointToPixel(
        p2_3d,
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (p1_2d && p2_2d) {
        VanishingLine.fromDto(
          `VL_Z_${lineCounter++}`,
          viewpoint1,
          'z',
          { u: p1_2d[0], v: p1_2d[1] },
          { u: p2_2d[0], v: p2_2d[1] }
        );
      }
    }

    const camera1Points = [0, 1, 2, 3, 4, 5, 6];
    for (const idx of camera1Points) {
      const projected = projectWorldPointToPixel(
        worldPointPositions[idx][1],
        camera1Position,
        camera1RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected) {
        const [u, v] = projected;
        const ip = ImagePoint.create(worldPoints[idx], viewpoint1, u, v);
        project.addImagePoint(ip);
      }
    }

    const viewpoint2 = Viewpoint.create(
      'Camera2',
      'scenario-10-camera2.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );
    viewpoint2.position = [0, 0, 0];
    viewpoint2.rotation = [1, 0, 0, 0];
    project.addViewpoint(viewpoint2);

    const camera2Points = [0, 1, 2, 3, 4, 7, 8];
    for (const idx of camera2Points) {
      const projected = projectWorldPointToPixel(
        worldPointPositions[idx][1],
        camera2Position,
        camera2RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected) {
        const [u, v] = projected;
        const ip = ImagePoint.create(worldPoints[idx], viewpoint2, u, v);
        project.addImagePoint(ip);
      }
    }

    const viewpoint3 = Viewpoint.create(
      'Camera3',
      'scenario-10-camera3.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        aspectRatio,
        skewCoefficient: 0
      }
    );
    viewpoint3.position = [0, 0, 0];
    viewpoint3.rotation = [1, 0, 0, 0];
    project.addViewpoint(viewpoint3);

    const camera3Points = [3, 4, 5, 7, 8, 9];
    for (const idx of camera3Points) {
      const projected = projectWorldPointToPixel(
        worldPointPositions[idx][1],
        camera3Position,
        camera3RotationQuat,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        0
      );

      if (projected) {
        const [u, v] = projected;
        const ip = ImagePoint.create(worldPoints[idx], viewpoint3, u, v);
        project.addImagePoint(ip);
      }
    }

    const line1 = Line.create('Line1', worldPoints[0], worldPoints[3], {
      direction: 'x',
      targetLength: 10.0,
      color: '#ff0000'
    });
    project.addLine(line1);

    const line2 = Line.create('Line2', worldPoints[0], worldPoints[7], {
      direction: 'z',
      targetLength: 10.0,
      color: '#00ff00'
    });
    project.addLine(line2);

    const line3 = Line.create('Line3', worldPoints[4], worldPoints[5], {
      targetLength: 6.0,
      color: '#0000ff'
    });
    project.addLine(line3);

    const line4 = Line.create('Line4', worldPoints[8], worldPoints[9], {
      targetLength: 3.0,
      color: '#ffff00'
    });
    project.addLine(line4);

    const line5 = Line.create('Line5', worldPoints[6], worldPoints[7], {
      color: '#ff00ff'
    });
    project.addLine(line5);

    const json = saveProjectToJson(project);
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const fixturePath = path.join(fixturesDir, 'scenario-10-complex-multi-camera.json');
    fs.writeFileSync(fixturePath, json, 'utf-8');

    console.log(`Generated fixture: ${fixturePath}`);
    console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
    console.log(`Ground truth camera positions:`);
    console.log(`  Camera1: ${JSON.stringify(camera1Position)} (VP init)`);
    console.log(`  Camera2: ${JSON.stringify(camera2Position)} (PnP init)`);
    console.log(`  Camera3: ${JSON.stringify(camera3Position)} (triangulated points)`);
    console.log(`World points: 10 (3 locked: P1, P2, P3; 7 unlocked)`);
    console.log(`Vanishing lines: ${viewpoint1.getVanishingLineCount()} (2 X, 2 Z on Camera1)`);
    console.log(`Image points: ${project.imagePoints.size} total`);
    console.log(`  Camera1: ${camera1Points.length} points`);
    console.log(`  Camera2: ${camera2Points.length} points`);
    console.log(`  Camera3: ${camera3Points.length} points`);
    console.log(`Lines: 5 total`);
    console.log(`  Line1: P1 <-> P4, x-aligned, length 10.0`);
    console.log(`  Line2: P1 <-> P8, z-aligned, length 10.0`);
    console.log(`  Line3: P5 <-> P6, length 6.0 (no direction)`);
    console.log(`  Line4: P9 <-> P10, length 3.0 (no direction)`);
    console.log(`  Line5: P7 <-> P8, free (no constraints)`);
  });
});
