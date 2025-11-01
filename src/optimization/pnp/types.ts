export interface PnPResult {
  position: [number, number, number];
  rotation: [number, number, number, number];
  success: boolean;
  reprojectionError?: number;
  inlierCount?: number;
}
