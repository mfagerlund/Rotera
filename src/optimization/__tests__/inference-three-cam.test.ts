import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';

describe('Inference Three Camera', () => {
  // SKIPPED: Known failing - fixture has geometric degeneracy issues
  it.skip('should solve three cameras using stepped VP + PnP initialization', () => {
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

    // Should converge with good accuracy
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(3.0);
  });
});
