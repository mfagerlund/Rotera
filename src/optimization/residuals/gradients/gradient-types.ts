/**
 * Shared types for gradient functions.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface Point2DGrad {
  x: number;
  y: number;
}

export interface Point3DGrad {
  x: number;
  y: number;
  z: number;
}

export interface QuaternionGrad {
  w: number;
  x: number;
  y: number;
  z: number;
}
