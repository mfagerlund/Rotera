import { V, Value } from 'scalar-autograd';

export class Vec4 {
  constructor(
    public readonly w: Value,
    public readonly x: Value,
    public readonly y: Value,
    public readonly z: Value
  ) {}

  get sqrMagnitude(): Value {
    return V.add(
      V.add(V.square(this.w), V.square(this.x)),
      V.add(V.square(this.y), V.square(this.z))
    );
  }

  get magnitude(): Value {
    return V.sqrt(this.sqrMagnitude);
  }

  static fromData(w: number, x: number, y: number, z: number): Vec4 {
    return new Vec4(V.C(w), V.C(x), V.C(y), V.C(z));
  }

  toArray(): [number, number, number, number] {
    return [this.w.data, this.x.data, this.y.data, this.z.data];
  }
}
