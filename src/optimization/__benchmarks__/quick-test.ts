/**
 * Quick test to diagnose benchmark issues
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { fineTuneProject } from '../fine-tune';
import { setSolverBackend } from '../solver-config';

const CALIBRATION_FIXTURES_DIR = path.join(__dirname, '..', '__tests__', 'fixtures', 'Calibration');

async function main() {
  const log: string[] = [];
  const print = (msg: string) => {
    log.push(msg);
    fs.writeFileSync(path.join(__dirname, 'QUICK-TEST-OUTPUT.txt'), log.join('\n'));
  };

  print('=== Quick Backend Test ===\n');

  const fixturePath = path.join(CALIBRATION_FIXTURES_DIR, 'Fixture With 2 Image 2.json');

  if (!fs.existsSync(fixturePath)) {
    print(`Fixture not found: ${fixturePath}`);
    return;
  }

  print('Loading fixture...');
  const json = fs.readFileSync(fixturePath, 'utf-8');
  const project = loadProjectFromJson(json);
  print(`Loaded: ${project.worldPoints.size} points, ${project.imagePoints.size} image points, ${project.viewpoints.size} cameras`);

  // Test autodiff first (known to work)
  print('\n--- Testing autodiff ---');
  setSolverBackend('autodiff');
  const start1 = performance.now();
  const result1 = fineTuneProject(project, { maxIterations: 100, verbose: false });
  const time1 = performance.now() - start1;
  print(`autodiff: ${time1.toFixed(0)}ms, converged=${result1.converged}, iter=${result1.iterations}`);

  // Test explicit-dense
  print('\n--- Testing explicit-dense ---');
  const project2 = loadProjectFromJson(json);
  setSolverBackend('explicit-dense');
  const start2 = performance.now();
  const result2 = fineTuneProject(project2, { maxIterations: 100, verbose: false });
  const time2 = performance.now() - start2;
  print(`explicit-dense: ${time2.toFixed(0)}ms, converged=${result2.converged}, iter=${result2.iterations}`);

  // Test explicit-sparse
  print('\n--- Testing explicit-sparse ---');
  const project3 = loadProjectFromJson(json);
  setSolverBackend('explicit-sparse');
  const start3 = performance.now();
  const result3 = fineTuneProject(project3, { maxIterations: 100, verbose: false });
  const time3 = performance.now() - start3;
  print(`explicit-sparse: ${time3.toFixed(0)}ms, converged=${result3.converged}, iter=${result3.iterations}`);

  print('\n=== Done ===');

  // Reset
  setSolverBackend('autodiff');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
