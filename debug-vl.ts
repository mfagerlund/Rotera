import { loadProjectFromJson } from './src/store/project-serialization';
import { optimizeProject, optimizationLogs } from './src/optimization/optimize-project';
import * as fs from 'fs';

const json = fs.readFileSync('src/optimization/__tests__/fixtures/No Vanisining Lines Now With VL.json', 'utf-8');
const project = loadProjectFromJson(json);

console.log('=== PROJECT STRUCTURE ===');
console.log('WorldPoints:', project.worldPoints.size);
console.log('Viewpoints:', project.viewpoints.size);
for (const vp of project.viewpoints) {
  const vlCount = vp.vanishingLines ? vp.vanishingLines.length : 0;
  console.log('  ' + vp.name + ': ' + vp.imagePoints.size + ' image points, ' + vlCount + ' vanishing lines');
}

console.log('\n=== OPTIMIZATION ===');
const result = optimizeProject(project, {
  autoInitializeCameras: true,
  autoInitializeWorldPoints: true,
  detectOutliers: true,
  maxIterations: 400,
  tolerance: 1e-6,
  verbose: true,
});

console.log('\n=== RESULT ===');
console.log('Converged:', result.converged);
console.log('Iterations:', result.iterations);
console.log('Residual:', result.residual);
console.log('Median reproj:', result.medianReprojectionError);
console.log('Cameras initialized:', result.camerasInitialized ? result.camerasInitialized.join(', ') : 'none');

console.log('\n=== LOGS ===');
console.log(optimizationLogs.join('\n'));
