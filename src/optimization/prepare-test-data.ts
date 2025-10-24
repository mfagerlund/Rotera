// Script to prepare test data from exported project
// Removes images and adds random initial xyz guesses

import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson, saveProjectToJson } from '../store/project-serialization';
import { randomInitialization } from './smart-initialization';

function prepareTestData(inputPath: string, outputPath: string): void {
  console.log(`Loading project from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, 'utf-8');

  const project = loadProjectFromJson(rawData);

  console.log(`Original project stats:`);
  console.log(`  - World points: ${project.worldPoints.size}`);
  console.log(`  - Lines: ${project.lines.size}`);
  console.log(`  - Constraints: ${project.constraints.size}`);
  console.log(`  - Viewpoints: ${project.viewpoints.size}`);

  randomInitialization(project, 10);

  console.log(`\nAdded random xyz to all world points`);

  const outputJson = saveProjectToJson(project);
  console.log(`\nSaving cleaned project to ${outputPath}...`);
  fs.writeFileSync(outputPath, outputJson, 'utf-8');

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

export { prepareTestData };
