import * as fs from 'fs';
import * as path from 'path';
import glob from 'glob';

interface Violation {
  file: string;
  line: number;
  type: string;
  content: string;
}

const violations: Violation[] = [];

const ALLOWED_PATHS = [
  /[\\/]dtos?[\\/]/,
  /[\\/]project-serialization\.ts$/,
  /[\\/]types[\\/]ids\.ts$/,
  /[\\/]entityKeys\.ts$/,
  /\.test\.ts$/,
  /check-no-runtime-ids\.ts$/,
  // Legacy code - Planes not yet migrated to entity architecture
  /[\\/]PlanesManager\.tsx$/,
  // Optimizer works with DTO format (serialization), IDs expected
  /[\\/]wip[\\/]optimizer\.ts$/,
  // WorkspaceManager uses UI config IDs, not entity IDs
  /[\\/]WorkspaceManager\.tsx$/,
  // Project storage layer uses IDs for IndexedDB keys (database boundary)
  /[\\/]project-db\.ts$/,
  /[\\/]project-db[\\/]/, // All files in project-db directory (database layer)
  /[\\/]ProjectBrowser\.tsx$/,
  /[\\/]ProjectBrowser[\\/]/, // All files in ProjectBrowser directory (browser UI layer)
  // Analytical solver uses IDs as Map keys for variable layout (allowed per CLAUDE.md)
  /[\\/]optimization[\\/]analytical[\\/]/,
  // Calibration uses ArUco marker IDs (external protocol), not entity IDs
  /[\\/]calibration[\\/]/,
];

const ENTITY_ID_PATTERNS = [
  /PointId/,
  /LineId/,
  /ViewpointId/,
  /CameraId/,
  /ConstraintId/,
  /PlaneId/,
  /EntityId/,
  /worldPointId/,
  /lineId/,
  /viewpointId/,
  /cameraId/,
  /constraintId/,
  /planeId/,
  /imageId/,
];

function isAllowedPath(filePath: string): boolean {
  return ALLOWED_PATHS.some(pattern => pattern.test(filePath));
}

function checkFile(filePath: string): void {
  if (isAllowedPath(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      return;
    }

    if (/useState<string\??>\s*\(\s*[^)]*\)/.test(line) &&
        ENTITY_ID_PATTERNS.some(pattern => pattern.test(line))) {
      violations.push({
        file: filePath,
        line: lineNum,
        type: 'ID_IN_STATE',
        content: trimmed,
      });
    }

    if (/useState<Set<string>>/.test(line)) {
      violations.push({
        file: filePath,
        line: lineNum,
        type: 'ID_SET_IN_STATE',
        content: trimmed,
      });
    }

    if (/\.\s*find\s*\(\s*\w+\s*=>\s*\w+\.id\s*===/.test(line)) {
      violations.push({
        file: filePath,
        line: lineNum,
        type: 'ID_LOOKUP',
        content: trimmed,
      });
    }

    if (/\.\s*filter\s*\(\s*\w+\s*=>\s*\w+\.\w+Id\s*===/.test(line)) {
      violations.push({
        file: filePath,
        line: lineNum,
        type: 'ID_FILTER',
        content: trimmed,
      });
    }

    if (/\(\s*\w+Id\s*:\s*string\s*\)/.test(line) &&
        !/interface|type|DTO|Dto/.test(line) &&
        !line.includes('as EntityId')) {
      violations.push({
        file: filePath,
        line: lineNum,
        type: 'ID_PARAMETER',
        content: trimmed,
      });
    }

    if (/hoveredPointId|hoveredLineId|draggedPointId|draggedLineId|selectedIds/.test(line) &&
        /:\s*string/.test(line)) {
      violations.push({
        file: filePath,
        line: lineNum,
        type: 'ID_TRACKING_PROPERTY',
        content: trimmed,
      });
    }

    if (/\.split\(['"]-['"]\)/.test(line)) {
      violations.push({
        file: filePath,
        line: lineNum,
        type: 'COMPOSITE_ID_STRING',
        content: trimmed,
      });
    }
  });
}

async function main() {
  console.log('🔍 Scanning for runtime ID usage violations...\n');

  const files = glob.sync('src/**/*.{ts,tsx}', {
    cwd: process.cwd(),
    absolute: true,
    windowsPathsNoEscape: true,
  });

  files.forEach(checkFile);

  if (violations.length === 0) {
    console.log('✅ No ID usage violations found!\n');
    process.exit(0);
  }

  console.log(`❌ Found ${violations.length} violation(s):\n`);

  const byFile = violations.reduce((acc, v) => {
    if (!acc[v.file]) acc[v.file] = [];
    acc[v.file].push(v);
    return acc;
  }, {} as Record<string, Violation[]>);

  Object.entries(byFile).forEach(([file, fileViolations]) => {
    const relativePath = path.relative(process.cwd(), file);
    console.log(`📄 ${relativePath}`);
    fileViolations.forEach(v => {
      console.log(`   Line ${v.line} [${v.type}]: ${v.content.substring(0, 80)}`);
    });
    console.log();
  });

  console.log('\n❌ Build failed: Runtime ID usage detected');
  console.log('   Architecture rule: Use object references, NOT IDs at runtime');
  console.log('   IDs are ONLY for serialization (DTOs) and Map keys\n');

  process.exit(1);
}

main().catch(err => {
  console.error('Error running check:', err);
  process.exit(1);
});
