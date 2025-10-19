// Script to prepare camera test data
// Clears image URLs (base64 blobs) while keeping observations and structure

const fs = require('fs');
const path = require('path');

function prepareCameraData(inputPath, outputPath) {
  console.log(`Loading project from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const project = JSON.parse(rawData);

  console.log(`Original project stats:`);
  console.log(`  - World points: ${Array.isArray(project.worldPoints) ? project.worldPoints.length : Object.keys(project.worldPoints||{}).length}`);
  console.log(`  - Lines: ${Array.isArray(project.lines) ? project.lines.length : Object.keys(project.lines||{}).length}`);
  console.log(`  - Constraints: ${(project.constraints||[]).length}`);
  console.log(`  - Images: ${Array.isArray(project.images) ? project.images.length : Object.keys(project.images||{}).length}`);

  // Convert arrays to Records if needed
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

  // Clear image URLs (base64 data) but KEEP imagePoints
  let images = project.images || {};
  if (Array.isArray(images)) {
    console.log('Converting images array to Record...');
    const imagesRecord = {};
    images.forEach(image => {
      imagesRecord[image.id] = image;
    });
    images = imagesRecord;
    project.images = imagesRecord;
  }

  console.log('\nClearing image URLs (keeping observations)...');
  let totalObservations = 0;
  Object.values(images).forEach(image => {
    // Clear the base64 URL data
    if (image.url) {
      const originalSize = image.url.length;
      image.url = ''; // Clear the base64 blob
      console.log(`  ${image.name}: cleared ${(originalSize/1024).toFixed(1)}KB`);
    }

    // Count observations
    const obsCount = image.imagePoints ? Object.keys(image.imagePoints).length : 0;
    totalObservations += obsCount;
    console.log(`    → ${obsCount} observations preserved`);
  });

  console.log(`\nTotal observations: ${totalObservations}`);

  // Save cleaned data
  console.log(`\nSaving to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(project, null, 2), 'utf-8');

  const newSize = fs.statSync(outputPath).size;
  const oldSize = fs.statSync(inputPath).size;
  console.log(`Done!`);
  console.log(`  Old size: ${(oldSize / 1024).toFixed(2)} KB`);
  console.log(`  New size: ${(newSize / 1024).toFixed(2)} KB`);
  console.log(`  Saved: ${((oldSize - newSize) / 1024).toFixed(2)} KB`);
}

// Run
const inputFile = 'C:\\Users\\matti\\Downloads\\New Project-optimization-2025-10-18 (1).json';
const outputFile = path.join(__dirname, 'test-project-3-cameras.json');

prepareCameraData(inputFile, outputFile);
