// Script to find exact TypeScript type usage locations
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple regex-based approach to find type usage patterns
function findTypeUsage(directory, typeName) {
  const results = [];

  function scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Patterns to look for
      const patterns = [
        new RegExp(`import.*\\b${typeName}\\b`, 'g'),
        new RegExp(`:\\s*${typeName}\\b`, 'g'),
        new RegExp(`<${typeName}\\b`, 'g'),
        new RegExp(`\\b${typeName}\\[`, 'g'),
        new RegExp(`Record<[^,>]*,\\s*${typeName}>`, 'g'),
        new RegExp(`Array<${typeName}>`, 'g'),
        new RegExp(`${typeName}\\[]`, 'g'),
        new RegExp(`extends\\s+${typeName}\\b`, 'g'),
        new RegExp(`implements\\s+${typeName}\\b`, 'g'),
        new RegExp(`typeof\\s+${typeName}\\b`, 'g')
      ];

      lines.forEach((line, lineIndex) => {
        patterns.forEach(pattern => {
          const matches = [...line.matchAll(pattern)];
          matches.forEach(match => {
            results.push({
              file: filePath,
              line: lineIndex + 1,
              column: match.index + 1,
              usage: match[0],
              context: line.trim(),
              category: getCategoryFromPattern(pattern, typeName)
            });
          });
        });
      });
    } catch (error) {
      // Skip files we can't read
    }
  }

  function scanDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        scanFile(fullPath);
      }
    }
  }

  scanDirectory(directory);
  return results;
}

function getCategoryFromPattern(pattern, typeName) {
  const patternStr = pattern.toString();
  if (patternStr.includes('import')) return 'import';
  if (patternStr.includes('extends')) return 'inheritance';
  if (patternStr.includes('implements')) return 'implementation';
  if (patternStr.includes('Record') || patternStr.includes('Array')) return 'generic';
  if (patternStr.includes(':\\s*')) return 'type_annotation';
  if (patternStr.includes('<')) return 'generic_usage';
  return 'usage';
}

// Run for key types
const srcDir = path.join(__dirname, '../src');
const typesToFind = ['Constraint', 'WorldPoint', 'Project', 'Line', 'Plane', 'Camera'];

console.log('# TypeScript Type Usage Analysis\n');

typesToFind.forEach(typeName => {
  console.log(`## ${typeName} Usage Locations\n`);

  const usage = findTypeUsage(srcDir, typeName);

  // Group by category
  const byCategory = {};
  usage.forEach(u => {
    if (!byCategory[u.category]) byCategory[u.category] = [];
    byCategory[u.category].push(u);
  });

  Object.keys(byCategory).sort().forEach(category => {
    console.log(`### ${category.toUpperCase()}\n`);
    byCategory[category].forEach(u => {
      const relativePath = path.relative(srcDir, u.file).replace(/\\/g, '/');
      console.log(`- **${relativePath}:${u.line}** - \`${u.context}\``);
    });
    console.log('');
  });
});