import { action, makeObservable, observable } from 'mobx';
import { nanoid } from 'nanoid';
import type { Viewpoint } from '../viewpoint/Viewpoint';
import type { ISerializable } from '../serialization/ISerializable';
import type { SerializationContext } from '../serialization/SerializationContext';
import type { VanishingLineDto } from './VanishingLineDto';
import type { ISelectable, SelectableType } from '../../types/selectable';

export type VanishingLineAxis = 'x' | 'y' | 'z';

export class VanishingLine implements ISerializable<VanishingLineDto>, ISelectable {
  id: string;
  viewpoint: Viewpoint;
  axis: VanishingLineAxis;
  p1: { u: number; v: number };
  p2: { u: number; v: number };
  private selected: boolean = false;

  private constructor(
    id: string,
    viewpoint: Viewpoint,
    axis: VanishingLineAxis,
    p1: { u: number; v: number },
    p2: { u: number; v: number }
  ) {
    this.id = id;
    this.viewpoint = viewpoint;
    this.axis = axis;
    this.p1 = p1;
    this.p2 = p2;

    makeObservable(this, {
      axis: observable,
      p1: observable,
      p2: observable,
      setEndpoints: action,
      setAxis: action,
      setSelected: action,
    });
  }

  static create(
    viewpoint: Viewpoint,
    axis: VanishingLineAxis,
    p1: { u: number; v: number },
    p2: { u: number; v: number }
  ): VanishingLine {
    const line = new VanishingLine(nanoid(), viewpoint, axis, p1, p2);
    viewpoint.addVanishingLine(line);
    return line;
  }

  static fromDto(
    id: string,
    viewpoint: Viewpoint,
    axis: VanishingLineAxis,
    p1: { u: number; v: number },
    p2: { u: number; v: number }
  ): VanishingLine {
    const line = new VanishingLine(id, viewpoint, axis, p1, p2);
    viewpoint.addVanishingLine(line);
    return line;
  }

  getColor(): string {
    switch (this.axis) {
      case 'x':
        return '#ff0000';
      case 'y':
        return '#00ff00';
      case 'z':
        return '#0000ff';
    }
  }

  getAxisName(): string {
    return this.axis.toUpperCase();
  }

  setEndpoints(p1: { u: number; v: number }, p2: { u: number; v: number }): void {
    this.p1 = p1;
    this.p2 = p2;
  }

  setAxis(axis: VanishingLineAxis): void {
    this.axis = axis;
  }

  // ISelectable implementation
  getType(): SelectableType {
    return 'vanishingLine';
  }

  getName(): string {
    return `${this.getAxisName()}-axis Line`;
  }

  isLocked(): boolean {
    return false;
  }

  isSelected(): boolean {
    return this.selected;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
  }

  canDelete(): boolean {
    return true;
  }

  getDeleteWarning(): string | null {
    return null;
  }

  serialize(context: SerializationContext): VanishingLineDto {
    const id = context.getEntityId(this) || context.registerEntity(this);
    const viewpointId = context.getEntityId(this.viewpoint);
    if (!viewpointId) {
      throw new Error('VanishingLine.serialize: viewpoint not registered in context');
    }

    return {
      id,
      viewpointId,
      axis: this.axis,
      p1: { ...this.p1 },
      p2: { ...this.p2 }
    };
  }

  static deserialize(dto: VanishingLineDto, context: SerializationContext): VanishingLine {
    const viewpoint = context.getEntity(dto.viewpointId) as Viewpoint;
    if (!viewpoint) {
      throw new Error(`VanishingLine.deserialize: viewpoint ${dto.viewpointId} not found in context`);
    }

    const line = VanishingLine.fromDto(dto.id, viewpoint, dto.axis, dto.p1, dto.p2);
    context.registerEntity(line, dto.id);
    return line;
  }
}
