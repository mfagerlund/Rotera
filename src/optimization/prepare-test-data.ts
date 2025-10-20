// Script to prepare test data from exported project
// Removes images and adds random initial xyz guesses

import * as fs from 'fs';
import * as path from 'path';

interface WorldPoint {
  id: string;
  name: string;
  xyz?: [number, number, number];
  imagePoints?: any[];
  [key: string]: any;
}

interface Project {
  worldPoints: Record<string, WorldPoint>;
  lines?: Record<string, any>;
  constraints?: any[];
  images?: Record<string, any>;
  [key: string]: any;
}

function generateRandomXYZ(): [number, number, number] {
  // Generate random coordinates in a reasonable range (e.g., -10 to 10 meters)
  return [
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20
  ];
}

function prepareTestData(inputPath: string, outputPath: string): void {
  console.log(`Loading project from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const project: Project = JSON.parse(rawData);

  console.log(`Original project stats:`);
  console.log(`  - World points: ${Object.keys(project.worldPoints || {}).length}`);
  console.log(`  - Lines: ${Object.keys(project.lines || {}).length}`);
  console.log(`  - Constraints: ${(project.constraints || []).length}`);
  console.log(`  - Images: ${Object.keys(project.images || {}).length}`);

  // Remove images (they're huge and not needed for optimization)
  delete project.images;

  // Add random xyz guesses to all world points
  const worldPoints = project.worldPoints || {};
  Object.keys(worldPoints).forEach(key => {
    const point = worldPoints[key];
    if (!point.xyz) {
      point.xyz = generateRandomXYZ();
      console.log(`  Added xyz to ${point.name}: [${point.xyz.map(v => v.toFixed(2)).join(', ')}]`);
    }
  });

  // Save cleaned data
  console.log(`\nSaving cleaned project to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(project, null, 2), 'utf-8');

  const newSize = fs.statSync(outputPath).size;
  console.log(`Done! File size: ${(newSize / 1024).toFixed(2)} KB`);
}

// Run if executed directly
if (require.main === module) {
  const testDataDir = path.join(__dirname, '../../../..', 'test-data');
  const inputFile = path.join(testDataDir, 'test-project.json');
  const outputFile = path.join(testDataDir, 'test-project-clean.json');

  prepareTestData(inputFile, outputFile);
}

export { prepareTestData, generateRandomXYZ };
