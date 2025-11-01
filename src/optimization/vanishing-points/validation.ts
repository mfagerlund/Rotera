import type { VanishingLine, VanishingLineAxis } from '../../entities/vanishing-line';
import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import type { LineQualityIssue, ValidationResult, VanishingPoint } from './types';
import {
  computeVanishingPoint,
  computeAngleBetweenVPs,
  computeLineLength,
  computeAngleBetweenLines
} from './computation';

export function validateVanishingPoints(viewpoint: Viewpoint): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const vanishingPoints: {
    x?: VanishingPoint;
    y?: VanishingPoint;
    z?: VanishingPoint;
  } = {};

  const linesByAxis: Record<VanishingLineAxis, VanishingLine[]> = {
    x: [],
    y: [],
    z: []
  };

  Array.from(viewpoint.vanishingLines).forEach(line => {
    linesByAxis[line.axis].push(line);
  });

  const axes: VanishingLineAxis[] = ['x', 'y', 'z'];
  axes.forEach(axis => {
    const axisLines = linesByAxis[axis];
    if (axisLines.length === 0) {
      return;
    }

    if (axisLines.length === 1) {
      warnings.push(`${axis.toUpperCase()}-axis has only 1 line (need 2+ for vanishing point)`);
      return;
    }

    const vp = computeVanishingPoint(axisLines);
    if (!vp) {
      errors.push(`${axis.toUpperCase()}-axis lines do not converge to a valid vanishing point`);
      return;
    }

    vanishingPoints[axis] = { u: vp.u, v: vp.v, axis };
  });

  const vpCount = Object.keys(vanishingPoints).length;
  if (vpCount < 2) {
    errors.push(`Need at least 2 vanishing points (have ${vpCount})`);
  }

  const anglesBetweenVPs: {
    xy?: number;
    xz?: number;
    yz?: number;
  } = {};

  const principalPoint = {
    u: viewpoint.principalPointX,
    v: viewpoint.principalPointY
  };

  if (vanishingPoints.x && vanishingPoints.y) {
    const angle = computeAngleBetweenVPs(vanishingPoints.x, vanishingPoints.y, principalPoint);
    anglesBetweenVPs.xy = angle;

    if (angle < 85 || angle > 95) {
      warnings.push(
        `X-Y vanishing points not perpendicular (${angle.toFixed(1)}°, expected ~90°)`
      );
    }
  }

  if (vanishingPoints.x && vanishingPoints.z) {
    const angle = computeAngleBetweenVPs(vanishingPoints.x, vanishingPoints.z, principalPoint);
    anglesBetweenVPs.xz = angle;

    if (angle < 85 || angle > 95) {
      warnings.push(
        `X-Z vanishing points not perpendicular (${angle.toFixed(1)}°, expected ~90°)`
      );
    }
  }

  if (vanishingPoints.y && vanishingPoints.z) {
    const angle = computeAngleBetweenVPs(vanishingPoints.y, vanishingPoints.z, principalPoint);
    anglesBetweenVPs.yz = angle;

    if (angle < 85 || angle > 95) {
      warnings.push(
        `Y-Z vanishing points not perpendicular (${angle.toFixed(1)}°, expected ~90°)`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    vanishingPoints,
    anglesBetweenVPs
  };
}

export function canInitializeWithVanishingPoints(
  viewpoint: Viewpoint,
  worldPoints: Set<WorldPoint>
): boolean {
  const validation = validateVanishingPoints(viewpoint);
  if (!validation.isValid) {
    return false;
  }

  const vpCount = Object.keys(validation.vanishingPoints || {}).length;
  if (vpCount < 2) {
    return false;
  }

  const fullyConstrainedPoints = Array.from(worldPoints).filter(wp => {
    const lockedXyz = wp.lockedXyz;
    return lockedXyz.every(coord => coord !== null);
  });

  if (fullyConstrainedPoints.length >= 2) {
    return true;
  }

  return false;
}

export function validateLineQuality(
  line: VanishingLine,
  allLinesForAxis: VanishingLine[]
): LineQualityIssue[] {
  const issues: LineQualityIssue[] = [];

  const length = computeLineLength(line);
  if (length < 50) {
    issues.push({
      type: 'warning',
      message: `Line too short (${length.toFixed(0)}px). Draw longer lines for better accuracy.`
    });
  }

  const otherLines = allLinesForAxis.filter(l => l.id !== line.id);

  if (otherLines.length > 0) {
    const minAngle = Math.min(...otherLines.map(other => computeAngleBetweenLines(line, other)));

    if (minAngle < 5) {
      issues.push({
        type: 'error',
        message: `Line nearly parallel to another (${minAngle.toFixed(1)}°). Lines should spread out.`
      });
    } else if (minAngle < 15) {
      issues.push({
        type: 'warning',
        message: `Line close to parallel with another (${minAngle.toFixed(1)}°). More spread recommended.`
      });
    }
  }

  return issues;
}

export function validateAxisLineDistribution(
  lines: VanishingLine[]
): LineQualityIssue[] {
  const issues: LineQualityIssue[] = [];

  if (lines.length < 2) {
    return issues;
  }

  const centerPoints = lines.map(line => ({
    u: (line.p1.u + line.p2.u) / 2,
    v: (line.p1.v + line.p2.v) / 2
  }));

  const avgU = centerPoints.reduce((sum, p) => sum + p.u, 0) / centerPoints.length;
  const avgV = centerPoints.reduce((sum, p) => sum + p.v, 0) / centerPoints.length;

  const maxDistFromCenter = Math.max(...centerPoints.map(p => {
    const du = p.u - avgU;
    const dv = p.v - avgV;
    return Math.sqrt(du * du + dv * dv);
  }));

  if (maxDistFromCenter < 100) {
    issues.push({
      type: 'warning',
      message: 'Lines clustered in one area. Spread them across the image for better accuracy.'
    });
  }

  return issues;
}
