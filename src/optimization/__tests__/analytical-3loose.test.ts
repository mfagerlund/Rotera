/**
 * Test of analytical mode on 3 Loose Cropped.
 *
 * CRITICAL: This test must use the EXACT same pipeline as the UI.
 * - Same loadProjectFromJson
 * - Same optimizeProject with same options
 * - Same candidate testing
 * - If the UI shows 56px, this test MUST show 56px
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { generateAllCandidates } from '../optimize-project/candidate-testing';
import { generateAllInferenceBranches } from '../inference-branching';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration');
const log = (msg: string) => process.stderr.write(msg + '\n');

describe('Analytical 3 Loose', () => {
  it('analytical mode on 3 Loose Cropped - exact UI scenario', async () => {
    // Load the exact same file that the user loads in the UI
    // "3 Loose Cropped.json" already has isPossiblyCropped: true and optimized values
    const jsonPath = path.join(FIXTURES_DIR, '3 Loose Cropped.json');
    log(`Using: ${jsonPath}`);
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    // Show exactly what candidates will be generated - this MUST match UI
    const branches = generateAllInferenceBranches(project);
    log(`\n=== INFERENCE BRANCHES (${branches.length}) ===`);
    branches.forEach((b, i) => log(`  Branch ${i}: ${b.choices.join(', ')}`));

    const candidates = generateAllCandidates(project, {
      maxAttempts: 3,
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
    });
    log(`\n=== CANDIDATES (${candidates.length}) ===`);
    candidates.forEach((c, i) => log(`  #${i + 1}: ${c.description}`));

    log(`\nInitial state:`);
    for (const vp of project.viewpoints) {
      log(`  ${vp.name}: f=${vp.focalLength.toFixed(2)}, pos=[${vp.position.map(p => p.toFixed(2)).join(', ')}], isPossiblyCropped=${vp.isPossiblyCropped}`);
    }
    for (const wp of project.worldPoints) {
      log(`  ${wp.name}: optimizedXyz=${wp.optimizedXyz ? wp.optimizedXyz.map(v => v.toFixed(2)).join(', ') : 'null'}`);
    }

    // EXACT same options as useOptimization hook in UI
    // See src/hooks/useOptimization.ts lines 151-159
    const result = await optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 500,
      damping: 0.1,
      verbose: true,
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
    });

    log(`\n=== ANALYTICAL RESULT ===`);
    log(`Median error: ${result.medianReprojectionError?.toFixed(2)}px`);
    log(`Residual: ${result.residual?.toFixed(2)}`);
    log(`Converged: ${result.converged}`);

    log(`\nFocal lengths:`);
    for (const vp of project.viewpoints) {
      log(`  ${vp.name}: f=${vp.focalLength.toFixed(2)}`);
    }

    // The UI shows 56px median error - if the test matches UI, it should also show ~56px
    // If it shows something different, we have a test/UI discrepancy that MUST be fixed
    // NOTE: If this assertion passes but UI fails, the pipeline is NOT unified!
    expect(result.medianReprojectionError).toBeLessThan(20);
  });
});
