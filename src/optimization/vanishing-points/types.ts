import type { VanishingLineAxis } from '../../entities/vanishing-line';

export interface VanishingPoint {
  u: number;
  v: number;
  axis: VanishingLineAxis;
}

export interface LineQualityIssue {
  type: 'warning' | 'error';
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  vanishingPoints?: {
    x?: VanishingPoint;
    y?: VanishingPoint;
    z?: VanishingPoint;
  };
  anglesBetweenVPs?: {
    xy?: number;
    xz?: number;
    yz?: number;
  };
}
