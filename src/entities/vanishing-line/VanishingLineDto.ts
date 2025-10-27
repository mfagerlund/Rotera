import type { VanishingLineAxis } from './VanishingLine';

export interface VanishingLineDto {
  id: string;
  viewpointId: string;
  axis: VanishingLineAxis;
  p1: { u: number; v: number };
  p2: { u: number; v: number };
}
