// Script to prepare test data from exported project
// Removes images and adds random initial xyz guesses

const fs = require('fs');
const path = require('path');

function generateRandomXYZ() {
  // Generate random coordinates in a reasonable range (e.g., -10 to 10 meters)
  return [
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20
  ];
}

function prepareTestData(inputPath, outputPath) {
  console.log(`Loading project from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const project = JSON.parse(rawData);

  console.log(`Original project stats:`);
  console.log(`  - World points: ${Object.keys(project.worldPoints || {}).length}`);
  console.log(`  - Lines: ${Object.keys(project.lines || {}).length}`);
  console.log(`  - Constraints: ${(project.constraints || []).length}`);
  console.log(`  - Images: ${Object.keys(project.images || {}).length}`);

  // Remove images (they're huge and not needed for optimization)
  delete project.images;

  // Convert worldPoints array to Record<id, WorldPoint> if needed
  let worldPoints = project.worldPoints || {};
  if (Array.isArray(worldPoints)) {
    console.log('Converting worldPoints array to Record...');
    const pointsRecord = {};
    worldPoints.forEach(point => {
      pointsRecord[point.id] = point;
    });
    worldPoints = pointsRecord;
    project.worldPoints = pointsRecord;
  }

  // Convert lines array to Record<id, Line> if needed
  let lines = project.lines || {};
  if (Array.isArray(lines)) {
    console.log('Converting lines array to Record...');
    const linesRecord = {};
    lines.forEach(line => {
      linesRecord[line.id] = line;
    });
    lines = linesRecord;
    project.lines = linesRecord;
  }

  // Add random xyz guesses to all world points
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
  const oldSize = fs.statSync(inputPath).size;
  console.log(`Done!`);
  console.log(`  Old size: ${(oldSize / 1024).toFixed(2)} KB`);
  console.log(`  New size: ${(newSize / 1024).toFixed(2)} KB`);
  console.log(`  Saved: ${((oldSize - newSize) / 1024).toFixed(2)} KB`);
}

// Run
const testDataDir = __dirname;
const inputFile = path.join(testDataDir, 'test-project.json');
const outputFile = path.join(testDataDir, 'test-project-clean.json');

prepareTestData(inputFile, outputFile);
