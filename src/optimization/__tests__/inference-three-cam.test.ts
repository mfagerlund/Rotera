import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, optimizationLogs } from '../optimize-project';

describe('Inference Three Camera', () => {
  it('should solve three cameras using stepped VP + PnP initialization', () => {
    const jsonPath = path.join(__dirname, 'fixtures', 'inference-three-cam.json');

    if (!fs.existsSync(jsonPath)) {
      console.log('Skipping: fixture not found');
      return;
    }

    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    const result = optimizeProject(project, {
      maxIterations: 500,
      verbose: false
    });

    // Log initialization path
    const initLogs = optimizationLogs.filter(l => l.includes('[Init'));

    // Write debug info to file for inspection
    const debugInfo = [
      'Init logs:',
      ...initLogs,
      '',
      `Converged: ${result.converged}`,
      `Median error: ${result.medianReprojectionError?.toFixed(2)} px`
    ].join('\n');
    fs.writeFileSync(path.join(__dirname, 'three-cam-debug.txt'), debugInfo);

    // Should converge with good accuracy - NOT 48px!
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(3.0); // Strict threshold - must actually work
  });
});
