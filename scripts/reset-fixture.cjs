const fs = require("fs");

function resetFixture(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  // Keep all data but reset camera positions and focal lengths
  data.viewpoints.forEach(vp => {
    vp.position = [0, 0, 0];
    vp.rotation = [1, 0, 0, 0];
    // Set reasonable initial focal length
    vp.focalLength = Math.max(vp.imageWidth, vp.imageHeight) * 1.5;
  });

  // Reset optimizedXyz for non-locked points
  data.worldPoints.forEach(wp => {
    const hasLock = wp.lockedXyz && (wp.lockedXyz[0] !== null || wp.lockedXyz[1] !== null || wp.lockedXyz[2] !== null);
    if (!hasLock) {
      wp.optimizedXyz = null;
    }
  });

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Reset: ${outputPath}`);
}

// Reset both fixtures from source files
resetFixture("C:/Slask/Balcony House Y Line-GoodSolve.json", "src/optimization/__tests__/fixtures/balcony-house-y-line.json");
resetFixture("C:/Slask/Balcony House Z Line-BadSolve.json", "src/optimization/__tests__/fixtures/balcony-house-z-line.json");
console.log("Both fixtures reset to clean initial state");
