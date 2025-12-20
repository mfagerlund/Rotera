import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';

describe('Inference Single Camera', () => {
  it('should solve single camera with inferred coordinates from axis-aligned lines', async () => {
    const jsonPath = path.join(__dirname, 'fixtures', 'inference-single-cam.json');

    if (!fs.existsSync(jsonPath)) {
      console.log('Skipping: fixture not found');
      return;
    }

    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    const result = await optimizeProject(project, {
      maxIterations: 500,
      verbose: false
    });

    // Should converge with low error
    expect(result.converged).toBe(true);
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(2.0);
  });
});
