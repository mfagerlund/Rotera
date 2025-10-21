# Serialization Refactoring Implementation Plan

## Overview

Complete migration to self-serializing entities with `SerializationContext`. No legacy support needed - clean slate implementation.

**Estimated Total Time**: 12-16 hours over 2-3 days
**Files Changed**: ~18 files
**Files Created**: ~10 files (test files + infrastructure)

---

## Phase 1: Infrastructure (2 hours)

### 1.1 Create SerializationContext Class

**File**: `src/entities/serialization/SerializationContext.ts`

```typescript
export class SerializationContext {
  private entityToId = new Map<object, string>()
  private idToEntity = new Map<string, object>()
  private idCounter = 0

  /**
   * Register an entity with an ID.
   * @param entity The entity to register
   * @param id Optional explicit ID. If not provided, auto-generates.
   * @returns The ID assigned to the entity
   */
  registerEntity(entity: object, id?: string): string {
    // If already registered, return existing ID
    const existing = this.entityToId.get(entity)
    if (existing) return existing

    // Generate or use provided ID
    const finalId = id || `${entity.constructor.name}_${this.idCounter++}`

    this.entityToId.set(entity, finalId)
    this.idToEntity.set(finalId, entity)

    return finalId
  }

  /**
   * Get the ID for an already-registered entity
   */
  getEntityId(entity: object): string | undefined {
    return this.entityToId.get(entity)
  }

  /**
   * Get an entity by its ID
   */
  getEntity<T>(id: string): T | undefined {
    return this.idToEntity.get(id) as T | undefined
  }

  /**
   * Check if an entity is already registered
   */
  hasEntity(entity: object): boolean {
    return this.entityToId.has(entity)
  }

  /**
   * Get all registered IDs (useful for debugging)
   */
  getAllIds(): string[] {
    return Array.from(this.idToEntity.keys())
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.entityToId.clear()
    this.idToEntity.clear()
    this.idCounter = 0
  }
}
```

**Tests**: `src/entities/serialization/__tests__/SerializationContext.test.ts`

```typescript
import { SerializationContext } from '../SerializationContext'

describe('SerializationContext', () => {
  let context: SerializationContext

  beforeEach(() => {
    context = new SerializationContext()
  })

  test('auto-generates IDs', () => {
    const obj1 = {}
    const obj2 = {}

    const id1 = context.registerEntity(obj1)
    const id2 = context.registerEntity(obj2)

    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })

  test('uses explicit IDs when provided', () => {
    const obj = {}
    const id = context.registerEntity(obj, 'custom_123')

    expect(id).toBe('custom_123')
    expect(context.getEntityId(obj)).toBe('custom_123')
  })

  test('returns same ID for already-registered entity', () => {
    const obj = {}
    const id1 = context.registerEntity(obj)
    const id2 = context.registerEntity(obj)

    expect(id1).toBe(id2)
  })

  test('retrieves entity by ID', () => {
    const obj = { value: 42 }
    const id = context.registerEntity(obj)

    const retrieved = context.getEntity<typeof obj>(id)
    expect(retrieved).toBe(obj)
    expect(retrieved?.value).toBe(42)
  })

  test('hasEntity works correctly', () => {
    const obj = {}
    expect(context.hasEntity(obj)).toBe(false)

    context.registerEntity(obj)
    expect(context.hasEntity(obj)).toBe(true)
  })

  test('clear resets context', () => {
    const obj = {}
    context.registerEntity(obj)

    context.clear()

    expect(context.hasEntity(obj)).toBe(false)
    expect(context.getAllIds()).toHaveLength(0)
  })
})
```

**Run tests**: `npm test -- SerializationContext`

### 1.2 Create Serializable Interfaces

**File**: `src/entities/serialization/ISerializable.ts`

```typescript
import type { SerializationContext } from './SerializationContext'

/**
 * Interface for entities that can be serialized
 */
export interface ISerializable<TDto> {
  /**
   * Serialize this entity to a DTO.
   * Dependencies MUST already be registered in context.
   */
  serialize(context: SerializationContext): TDto
}

/**
 * Static interface for deserializing DTOs back to entities
 */
export interface IDeserializable<TDto, TEntity> {
  /**
   * Deserialize a DTO to an entity instance.
   * Dependencies MUST already be deserialized and in context.
   */
  deserialize(dto: TDto, context: SerializationContext): TEntity
}

/**
 * Base DTO interface - all DTOs should extend this
 */
export interface BaseDto {
  id: string
}
```

**Deliverables**:
- [ ] `SerializationContext.ts` created
- [ ] `ISerializable.ts` created
- [ ] Tests written and passing
- [ ] Create `src/entities/serialization/index.ts` to export both

---

## Phase 2: WorldPoint Serialization (1.5 hours)

### 2.1 Add WorldPoint DTO

**File**: `src/entities/world-point/WorldPointDto.ts`

```typescript
import type { BaseDto } from '../serialization/ISerializable'

export interface WorldPointDto extends BaseDto {
  id: string
  name: string
  lockedXyz: [number | null, number | null, number | null]
  optimizedXyz?: [number, number, number]
  color: string
  isVisible: boolean
  isOrigin: boolean
}
```

### 2.2 Implement WorldPoint Serialization

**File**: `src/entities/world-point/WorldPoint.ts` (modify)

Add to class:

```typescript
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { WorldPointDto } from './WorldPointDto'

export class WorldPoint implements ISelectable, IWorldPoint, IValueMapContributor, ISerializable<WorldPointDto> {
  // ... existing code ...

  serialize(context: SerializationContext): WorldPointDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    return {
      id,
      name: this.name,
      lockedXyz: [...this.lockedXyz] as [number | null, number | null, number | null],
      optimizedXyz: this.optimizedXyz ? [...this.optimizedXyz] as [number, number, number] : undefined,
      color: this.color,
      isVisible: this.isVisible,
      isOrigin: this.isOrigin
    }
  }

  static deserialize(dto: WorldPointDto, context: SerializationContext): WorldPoint {
    const point = WorldPoint.createFromSerialized(
      dto.name,
      dto.lockedXyz,
      dto.color,
      dto.isVisible,
      dto.isOrigin,
      dto.optimizedXyz
    )

    context.registerEntity(point, dto.id)
    return point
  }
}
```

### 2.3 Test WorldPoint Serialization

**File**: `src/entities/world-point/__tests__/WorldPoint.serialization.test.ts`

```typescript
import { WorldPoint } from '../WorldPoint'
import { SerializationContext } from '../../serialization/SerializationContext'

describe('WorldPoint Serialization', () => {
  let context: SerializationContext

  beforeEach(() => {
    context = new SerializationContext()
  })

  test('serializes basic world point', () => {
    const point = WorldPoint.create('P1', {
      lockedXyz: [1, 2, 3],
      color: '#ff0000',
      isVisible: true,
      isOrigin: false
    })

    const dto = point.serialize(context)

    expect(dto.id).toBeTruthy()
    expect(dto.name).toBe('P1')
    expect(dto.lockedXyz).toEqual([1, 2, 3])
    expect(dto.color).toBe('#ff0000')
    expect(dto.isVisible).toBe(true)
    expect(dto.isOrigin).toBe(false)
  })

  test('serializes point with optimized coordinates', () => {
    const point = WorldPoint.create('P1', {
      lockedXyz: [null, null, null],
      optimizedXyz: [5, 6, 7]
    })

    const dto = point.serialize(context)

    expect(dto.optimizedXyz).toEqual([5, 6, 7])
  })

  test('round-trip serialization preserves data', () => {
    const original = WorldPoint.create('Origin', {
      lockedXyz: [0, 0, 0],
      color: '#00ff00',
      isVisible: true,
      isOrigin: true,
      optimizedXyz: [0, 0, 0]
    })

    const dto = original.serialize(context)
    const deserialized = WorldPoint.deserialize(dto, context)

    expect(deserialized.name).toBe(original.name)
    expect(deserialized.lockedXyz).toEqual(original.lockedXyz)
    expect(deserialized.optimizedXyz).toEqual(original.optimizedXyz)
    expect(deserialized.color).toBe(original.color)
    expect(deserialized.isVisible).toBe(original.isVisible)
    expect(deserialized.isOrigin).toBe(original.isOrigin)
  })

  test('deserialized point is registered in context', () => {
    const original = WorldPoint.create('P1', {
      lockedXyz: [1, 2, 3]
    })

    const dto = original.serialize(context)
    context.clear() // Simulate fresh context

    const deserialized = WorldPoint.deserialize(dto, context)

    expect(context.hasEntity(deserialized)).toBe(true)
    expect(context.getEntityId(deserialized)).toBe(dto.id)
  })
})
```

**Run tests**: `npm test -- WorldPoint.serialization`

**Deliverables**:
- [ ] `WorldPointDto.ts` created
- [ ] `WorldPoint.ts` modified with serialize/deserialize
- [ ] Tests written and passing
- [ ] Export DTO from `src/entities/world-point/index.ts`

---

## Phase 3: Viewpoint Serialization (1.5 hours)

### 3.1 Add Viewpoint DTO

**File**: `src/entities/viewpoint/ViewpointDto.ts`

```typescript
import type { BaseDto } from '../serialization/ISerializable'

export interface ViewpointDto extends BaseDto {
  id: string
  name: string
  filename: string
  url: string
  imageWidth: number
  imageHeight: number
  focalLength: number
  principalPointX: number
  principalPointY: number
  skewCoefficient: number
  aspectRatio: number
  radialDistortion: [number, number, number]
  tangentialDistortion: [number, number]
  position: [number, number, number]
  rotation: [number, number, number, number]
  calibrationAccuracy: number
  calibrationDate?: string
  calibrationNotes?: string
  isProcessed: boolean
  processingNotes?: string
  metadata?: any
  isVisible: boolean
  opacity: number
  color: string
}
```

### 3.2 Implement Viewpoint Serialization

**File**: `src/entities/viewpoint/Viewpoint.ts` (modify)

```typescript
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ViewpointDto } from './ViewpointDto'

export class Viewpoint implements ISelectable, IValueMapContributor, IViewpoint, ISerializable<ViewpointDto> {
  // ... existing code ...

  serialize(context: SerializationContext): ViewpointDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    return {
      id,
      name: this.name,
      filename: this.filename,
      url: this.url,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      focalLength: this.focalLength,
      principalPointX: this.principalPointX,
      principalPointY: this.principalPointY,
      skewCoefficient: this.skewCoefficient,
      aspectRatio: this.aspectRatio,
      radialDistortion: [...this.radialDistortion] as [number, number, number],
      tangentialDistortion: [...this.tangentialDistortion] as [number, number],
      position: [...this.position] as [number, number, number],
      rotation: [...this.rotation] as [number, number, number, number],
      calibrationAccuracy: this.calibrationAccuracy,
      calibrationDate: this.calibrationDate,
      calibrationNotes: this.calibrationNotes,
      isProcessed: this.isProcessed,
      processingNotes: this.processingNotes,
      metadata: this.metadata ? { ...this.metadata } : undefined,
      isVisible: this.isVisible,
      opacity: this.opacity,
      color: this.color
    }
  }

  static deserialize(dto: ViewpointDto, context: SerializationContext): Viewpoint {
    const viewpoint = Viewpoint.createFromSerialized(
      dto.name,
      dto.filename,
      dto.url,
      dto.imageWidth,
      dto.imageHeight,
      dto.focalLength,
      dto.principalPointX,
      dto.principalPointY,
      dto.skewCoefficient,
      dto.aspectRatio,
      dto.radialDistortion,
      dto.tangentialDistortion,
      dto.position,
      dto.rotation,
      dto.calibrationAccuracy,
      dto.calibrationDate,
      dto.calibrationNotes,
      dto.isProcessed,
      dto.processingNotes,
      dto.metadata,
      dto.isVisible,
      dto.opacity,
      dto.color
    )

    context.registerEntity(viewpoint, dto.id)
    return viewpoint
  }
}
```

### 3.3 Test Viewpoint Serialization

**File**: `src/entities/viewpoint/__tests__/Viewpoint.serialization.test.ts`

```typescript
import { Viewpoint } from '../Viewpoint'
import { SerializationContext } from '../../serialization/SerializationContext'

describe('Viewpoint Serialization', () => {
  let context: SerializationContext

  beforeEach(() => {
    context = new SerializationContext()
  })

  test('serializes basic viewpoint', () => {
    const vp = Viewpoint.create('IMG_001', 'img001.jpg', 'https://example.com/img001.jpg', 1920, 1080)

    const dto = vp.serialize(context)

    expect(dto.id).toBeTruthy()
    expect(dto.name).toBe('IMG_001')
    expect(dto.filename).toBe('img001.jpg')
    expect(dto.imageWidth).toBe(1920)
    expect(dto.imageHeight).toBe(1080)
  })

  test('round-trip preserves camera parameters', () => {
    const original = Viewpoint.create('IMG_001', 'img001.jpg', 'url', 1920, 1080, {
      focalLength: 2000,
      position: [10, 20, 30],
      rotation: [1, 0, 0, 0],
      radialDistortion: [0.1, 0.2, 0.3],
      tangentialDistortion: [0.01, 0.02]
    })

    const dto = original.serialize(context)
    context.clear()
    const deserialized = Viewpoint.deserialize(dto, context)

    expect(deserialized.focalLength).toBe(2000)
    expect(deserialized.position).toEqual([10, 20, 30])
    expect(deserialized.rotation).toEqual([1, 0, 0, 0])
    expect(deserialized.radialDistortion).toEqual([0.1, 0.2, 0.3])
    expect(deserialized.tangentialDistortion).toEqual([0.01, 0.02])
  })
})
```

**Deliverables**:
- [ ] `ViewpointDto.ts` created
- [ ] `Viewpoint.ts` modified
- [ ] Tests passing

---

## Phase 4: Line Serialization (1.5 hours)

### 4.1 Add Line DTO

**File**: `src/entities/line/LineDto.ts`

```typescript
import type { BaseDto } from '../serialization/ISerializable'
import type { LineDirection } from './Line'

export interface LineDto extends BaseDto {
  id: string
  name: string
  pointAId: string
  pointBId: string
  color: string
  isVisible: boolean
  isConstruction: boolean
  lineStyle: 'solid' | 'dashed' | 'dotted'
  thickness: number
  direction: LineDirection
  targetLength?: number
  tolerance?: number
}
```

### 4.2 Implement Line Serialization

**File**: `src/entities/line/Line.ts` (modify)

```typescript
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { LineDto } from './LineDto'

export class Line implements ISelectable, ILine, IResidualProvider, ISerializable<LineDto> {
  // ... existing code ...

  serialize(context: SerializationContext): LineDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const pointAId = context.getEntityId(this.pointA)
    const pointBId = context.getEntityId(this.pointB)

    if (!pointAId || !pointBId) {
      throw new Error(`Line ${this.name}: endpoints not registered in context`)
    }

    return {
      id,
      name: this.name,
      pointAId,
      pointBId,
      color: this.color,
      isVisible: this.isVisible,
      isConstruction: this.isConstruction,
      lineStyle: this.lineStyle,
      thickness: this.thickness,
      direction: this.direction,
      targetLength: this.targetLength,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: LineDto, context: SerializationContext): Line {
    const pointA = context.getEntity<WorldPoint>(dto.pointAId)
    const pointB = context.getEntity<WorldPoint>(dto.pointBId)

    if (!pointA || !pointB) {
      throw new Error(`Line ${dto.name}: endpoints not found in context (${dto.pointAId}, ${dto.pointBId})`)
    }

    const line = Line.create(dto.name, pointA, pointB, {
      color: dto.color,
      isVisible: dto.isVisible,
      isConstruction: dto.isConstruction,
      lineStyle: dto.lineStyle,
      thickness: dto.thickness,
      direction: dto.direction,
      targetLength: dto.targetLength,
      tolerance: dto.tolerance
    })

    context.registerEntity(line, dto.id)
    return line
  }
}
```

### 4.3 Test Line Serialization

**File**: `src/entities/line/__tests__/Line.serialization.test.ts`

```typescript
import { Line } from '../Line'
import { WorldPoint } from '../../world-point/WorldPoint'
import { SerializationContext } from '../../serialization/SerializationContext'

describe('Line Serialization', () => {
  let context: SerializationContext
  let pointA: WorldPoint
  let pointB: WorldPoint

  beforeEach(() => {
    context = new SerializationContext()
    pointA = WorldPoint.create('A', { lockedXyz: [0, 0, 0] })
    pointB = WorldPoint.create('B', { lockedXyz: [10, 0, 0] })

    // Pre-register points (simulating dependency order)
    context.registerEntity(pointA)
    context.registerEntity(pointB)
  })

  test('serializes basic line', () => {
    const line = Line.create('AB', pointA, pointB)

    const dto = line.serialize(context)

    expect(dto.id).toBeTruthy()
    expect(dto.name).toBe('AB')
    expect(dto.pointAId).toBe(context.getEntityId(pointA))
    expect(dto.pointBId).toBe(context.getEntityId(pointB))
  })

  test('throws if endpoints not registered', () => {
    const orphanPoint = WorldPoint.create('C', { lockedXyz: [5, 5, 5] })
    const line = Line.create('AC', pointA, orphanPoint)

    expect(() => line.serialize(context)).toThrow('endpoints not registered')
  })

  test('round-trip preserves line properties', () => {
    const original = Line.create('AB', pointA, pointB, {
      color: '#0000ff',
      isConstruction: true,
      lineStyle: 'dashed',
      thickness: 2,
      direction: 'horizontal',
      targetLength: 10,
      tolerance: 0.01
    })

    const dto = original.serialize(context)

    // Clean up before deserialize
    original.cleanup()

    const deserialized = Line.deserialize(dto, context)

    expect(deserialized.name).toBe('AB')
    expect(deserialized.pointA).toBe(pointA)
    expect(deserialized.pointB).toBe(pointB)
    expect(deserialized.color).toBe('#0000ff')
    expect(deserialized.isConstruction).toBe(true)
    expect(deserialized.lineStyle).toBe('dashed')
    expect(deserialized.thickness).toBe(2)
    expect(deserialized.direction).toBe('horizontal')
    expect(deserialized.targetLength).toBe(10)
    expect(deserialized.tolerance).toBe(0.01)
  })
})
```

**Deliverables**:
- [ ] `LineDto.ts` created
- [ ] `Line.ts` modified
- [ ] Tests passing

---

## Phase 5: ImagePoint Serialization (1 hour)

### 5.1 Add ImagePoint DTO

**File**: `src/entities/imagePoint/ImagePointDto.ts`

```typescript
import type { BaseDto } from '../serialization/ISerializable'

export interface ImagePointDto extends BaseDto {
  id: string
  worldPointId: string
  viewpointId: string
  u: number
  v: number
  isVisible: boolean
  confidence: number
}
```

### 5.2 Implement ImagePoint Serialization

**File**: `src/entities/imagePoint/ImagePoint.ts` (modify)

```typescript
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ImagePointDto } from './ImagePointDto'

export class ImagePoint implements ISelectable, IImagePoint, ISerializable<ImagePointDto> {
  // ... existing code ...

  serialize(context: SerializationContext): ImagePointDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const worldPointId = context.getEntityId(this.worldPoint)
    const viewpointId = context.getEntityId(this.viewpoint)

    if (!worldPointId || !viewpointId) {
      throw new Error(`ImagePoint: dependencies not registered in context`)
    }

    return {
      id,
      worldPointId,
      viewpointId,
      u: this.u,
      v: this.v,
      isVisible: this.isVisible,
      confidence: this.confidence
    }
  }

  static deserialize(dto: ImagePointDto, context: SerializationContext): ImagePoint {
    const worldPoint = context.getEntity<IWorldPoint>(dto.worldPointId)
    const viewpoint = context.getEntity<IViewpoint>(dto.viewpointId)

    if (!worldPoint || !viewpoint) {
      throw new Error(`ImagePoint: dependencies not found in context`)
    }

    const imagePoint = ImagePoint.create(worldPoint, viewpoint, dto.u, dto.v, {
      isVisible: dto.isVisible,
      confidence: dto.confidence
    })

    context.registerEntity(imagePoint, dto.id)

    // Register bidirectional relationships
    worldPoint.addImagePoint(imagePoint)
    viewpoint.addImagePoint(imagePoint)

    return imagePoint
  }
}
```

### 5.3 Test ImagePoint Serialization

**File**: `src/entities/imagePoint/__tests__/ImagePoint.serialization.test.ts`

```typescript
import { ImagePoint } from '../ImagePoint'
import { WorldPoint } from '../../world-point/WorldPoint'
import { Viewpoint } from '../../viewpoint/Viewpoint'
import { SerializationContext } from '../../serialization/SerializationContext'

describe('ImagePoint Serialization', () => {
  let context: SerializationContext
  let worldPoint: WorldPoint
  let viewpoint: Viewpoint

  beforeEach(() => {
    context = new SerializationContext()
    worldPoint = WorldPoint.create('P1', { lockedXyz: [1, 2, 3] })
    viewpoint = Viewpoint.create('IMG_001', 'img.jpg', 'url', 1920, 1080)

    context.registerEntity(worldPoint)
    context.registerEntity(viewpoint)
  })

  test('serializes image point', () => {
    const ip = ImagePoint.create(worldPoint, viewpoint, 500, 600)

    const dto = ip.serialize(context)

    expect(dto.worldPointId).toBe(context.getEntityId(worldPoint))
    expect(dto.viewpointId).toBe(context.getEntityId(viewpoint))
    expect(dto.u).toBe(500)
    expect(dto.v).toBe(600)
  })

  test('round-trip preserves data and relationships', () => {
    const original = ImagePoint.create(worldPoint, viewpoint, 100, 200, {
      isVisible: false,
      confidence: 0.8
    })

    const dto = original.serialize(context)
    const deserialized = ImagePoint.deserialize(dto, context)

    expect(deserialized.worldPoint).toBe(worldPoint)
    expect(deserialized.viewpoint).toBe(viewpoint)
    expect(deserialized.u).toBe(100)
    expect(deserialized.v).toBe(200)
    expect(deserialized.isVisible).toBe(false)
    expect(deserialized.confidence).toBe(0.8)

    // Check bidirectional relationships
    expect(worldPoint.imagePoints.has(deserialized)).toBe(true)
    expect(viewpoint.imagePoints.has(deserialized)).toBe(true)
  })
})
```

**Deliverables**:
- [ ] `ImagePointDto.ts` created
- [ ] `ImagePoint.ts` modified
- [ ] Tests passing

---

## Phase 6: Base Constraint Serialization (2 hours)

### 6.1 Add Constraint DTOs

**File**: `src/entities/constraints/ConstraintDto.ts`

```typescript
import type { BaseDto } from '../serialization/ISerializable'

// Base constraint DTO
export interface ConstraintDto extends BaseDto {
  id: string
  type: string
  name: string
}

// Specific constraint DTOs
export interface DistanceConstraintDto extends ConstraintDto {
  type: 'distance_point_point'
  pointAId: string
  pointBId: string
  targetDistance: number
  tolerance: number
}

export interface AngleConstraintDto extends ConstraintDto {
  type: 'angle_point_point_point'
  pointAId: string
  vertexId: string
  pointCId: string
  targetAngle: number
  tolerance: number
}

// Add more as needed...
```

### 6.2 Implement Base Constraint Serialization

**File**: `src/entities/constraints/base-constraint.ts` (modify)

```typescript
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ConstraintDto } from './ConstraintDto'

export abstract class Constraint implements ISelectable, IValidatable, IResidualProvider, ISerializable<ConstraintDto> {
  // ... existing code ...

  // Subclasses must implement
  abstract serialize(context: SerializationContext): ConstraintDto

  /**
   * Polymorphic deserialization based on DTO type
   */
  static deserialize(dto: ConstraintDto, context: SerializationContext): Constraint {
    switch (dto.type) {
      case 'distance_point_point':
        return DistanceConstraint.deserialize(dto as DistanceConstraintDto, context)
      case 'angle_point_point_point':
        return AngleConstraint.deserialize(dto as AngleConstraintDto, context)
      // Add more cases as constraint types are implemented
      default:
        throw new Error(`Unknown constraint type: ${dto.type}`)
    }
  }
}
```

### 6.3 Implement DistanceConstraint Serialization

**File**: `src/entities/constraints/distance-constraint.ts` (modify)

```typescript
import type { SerializationContext } from '../serialization/SerializationContext'
import type { DistanceConstraintDto } from './ConstraintDto'

export class DistanceConstraint extends Constraint {
  // ... existing code ...

  serialize(context: SerializationContext): DistanceConstraintDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const pointAId = context.getEntityId(this.pointA)
    const pointBId = context.getEntityId(this.pointB)

    if (!pointAId || !pointBId) {
      throw new Error(`DistanceConstraint ${this.name}: points not registered`)
    }

    return {
      id,
      type: 'distance_point_point',
      name: this.name,
      pointAId,
      pointBId,
      targetDistance: this.targetDistance,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: DistanceConstraintDto, context: SerializationContext): DistanceConstraint {
    const pointA = context.getEntity<WorldPoint>(dto.pointAId)
    const pointB = context.getEntity<WorldPoint>(dto.pointBId)

    if (!pointA || !pointB) {
      throw new Error(`DistanceConstraint ${dto.name}: points not found`)
    }

    const constraint = DistanceConstraint.create(
      dto.name,
      pointA,
      pointB,
      dto.targetDistance,
      { tolerance: dto.tolerance }
    )

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}
```

### 6.4 Test Constraint Serialization

**File**: `src/entities/constraints/__tests__/distance-constraint.serialization.test.ts`

```typescript
import { DistanceConstraint } from '../distance-constraint'
import { Constraint } from '../base-constraint'
import { WorldPoint } from '../../world-point/WorldPoint'
import { SerializationContext } from '../../serialization/SerializationContext'

describe('DistanceConstraint Serialization', () => {
  let context: SerializationContext
  let pointA: WorldPoint
  let pointB: WorldPoint

  beforeEach(() => {
    context = new SerializationContext()
    pointA = WorldPoint.create('A', { lockedXyz: [0, 0, 0], optimizedXyz: [0, 0, 0] })
    pointB = WorldPoint.create('B', { lockedXyz: [10, 0, 0], optimizedXyz: [10, 0, 0] })

    context.registerEntity(pointA)
    context.registerEntity(pointB)
  })

  test('serializes distance constraint', () => {
    const constraint = DistanceConstraint.create('D1', pointA, pointB, 10, {
      tolerance: 0.01
    })

    const dto = constraint.serialize(context)

    expect(dto.type).toBe('distance_point_point')
    expect(dto.name).toBe('D1')
    expect(dto.targetDistance).toBe(10)
    expect(dto.tolerance).toBe(0.01)
  })

  test('round-trip via base class deserialize', () => {
    const original = DistanceConstraint.create('D1', pointA, pointB, 10)

    const dto = original.serialize(context)

    // Use polymorphic deserialization
    const deserialized = Constraint.deserialize(dto, context)

    expect(deserialized).toBeInstanceOf(DistanceConstraint)
    expect(deserialized.name).toBe('D1')

    const dc = deserialized as DistanceConstraint
    expect(dc.pointA).toBe(pointA)
    expect(dc.pointB).toBe(pointB)
    expect(dc.targetDistance).toBe(10)
  })
})
```

**Deliverables**:
- [ ] `ConstraintDto.ts` created
- [ ] `base-constraint.ts` modified with polymorphic deserialize
- [ ] `distance-constraint.ts` modified
- [ ] Tests passing

---

## Phase 7: Remaining Constraints (3 hours)

Repeat pattern from Phase 6 for each constraint type:

### 7.1 AngleConstraint
- Add `AngleConstraintDto` to `ConstraintDto.ts`
- Implement `serialize()` and `static deserialize()` in `angle-constraint.ts`
- Add case to `Constraint.deserialize()` switch
- Write tests

### 7.2 ParallelLinesConstraint
- DTO, serialize, deserialize, test

### 7.3 PerpendicularLinesConstraint
- DTO, serialize, deserialize, test

### 7.4 FixedPointConstraint
- DTO, serialize, deserialize, test

### 7.5 CollinearPointsConstraint
- DTO, serialize, deserialize, test

### 7.6 CoplanarPointsConstraint
- DTO, serialize, deserialize, test

### 7.7 EqualDistancesConstraint
- DTO, serialize, deserialize, test

### 7.8 EqualAnglesConstraint
- DTO, serialize, deserialize, test

### 7.9 ProjectionConstraint
- DTO, serialize, deserialize, test

**Template for each constraint**:

```typescript
// In ConstraintDto.ts
export interface XConstraintDto extends ConstraintDto {
  type: 'x_constraint_type'
  // ... specific fields
}

// In x-constraint.ts
serialize(context: SerializationContext): XConstraintDto {
  const id = context.getEntityId(this) || context.registerEntity(this)
  // ... get dependency IDs, validate they exist
  return { id, type: 'x_constraint_type', /* ... */ }
}

static deserialize(dto: XConstraintDto, context: SerializationContext): XConstraint {
  // ... get dependencies from context
  const constraint = XConstraint.create(/* ... */)
  context.registerEntity(constraint, dto.id)
  return constraint
}

// In base-constraint.ts switch
case 'x_constraint_type':
  return XConstraint.deserialize(dto as XConstraintDto, context)
```

**Deliverables**:
- [ ] All 9 remaining constraint types implemented
- [ ] All tests passing

---

## Phase 8: Project Serialization (2 hours)

### 8.1 Create Project DTO

**File**: `src/entities/project/ProjectDto.ts`

```typescript
import type { WorldPointDto } from '../world-point/WorldPointDto'
import type { LineDto } from '../line/LineDto'
import type { ViewpointDto } from '../viewpoint/ViewpointDto'
import type { ImagePointDto } from '../imagePoint/ImagePointDto'
import type { ConstraintDto } from '../constraints/ConstraintDto'

export interface ProjectDto {
  name: string
  worldPoints: WorldPointDto[]
  lines: LineDto[]
  viewpoints: ViewpointDto[]
  imagePoints: ImagePointDto[]
  constraints: ConstraintDto[]

  // Settings
  showPointNames: boolean
  autoSave: boolean
  theme: 'dark' | 'light'
  measurementUnits: 'meters' | 'feet' | 'inches'
  precisionDigits: number
  showConstraintGlyphs: boolean
  showMeasurements: boolean
  autoOptimize: boolean
  gridVisible: boolean
  snapToGrid: boolean
  defaultWorkspace: 'image' | 'world'
  showConstructionGeometry: boolean
  enableSmartSnapping: boolean
  constraintPreview: boolean
  visualFeedbackLevel: 'minimal' | 'standard' | 'detailed'
  imageSortOrder?: 'name' | 'date'
}
```

### 8.2 Refactor Serialization.ts

**File**: `src/entities/Serialization.ts` (replace entirely)

```typescript
import { Project } from './project/Project'
import { WorldPoint } from './world-point/WorldPoint'
import { Line } from './line/Line'
import { Viewpoint } from './viewpoint/Viewpoint'
import { ImagePoint } from './imagePoint/ImagePoint'
import { Constraint } from './constraints'
import { SerializationContext } from './serialization/SerializationContext'
import type { ProjectDto } from './project/ProjectDto'

export class Serialization {

  static serialize(project: Project): string {
    const context = new SerializationContext()

    // Phase 1: Register all entities in dependency order
    // This builds the ID mappings
    project.worldPoints.forEach(wp => context.registerEntity(wp))
    project.viewpoints.forEach(vp => context.registerEntity(vp))
    project.lines.forEach(line => context.registerEntity(line))
    project.imagePoints.forEach(ip => context.registerEntity(ip))
    project.constraints.forEach(c => context.registerEntity(c))

    // Phase 2: Serialize all entities (IDs are now available)
    const dto: ProjectDto = {
      name: project.name,
      worldPoints: Array.from(project.worldPoints).map(wp => wp.serialize(context)),
      lines: Array.from(project.lines).map(line => line.serialize(context)),
      viewpoints: Array.from(project.viewpoints).map(vp => vp.serialize(context)),
      imagePoints: Array.from(project.imagePoints).map(ip => ip.serialize(context)),
      constraints: Array.from(project.constraints).map(c => c.serialize(context)),

      // Settings
      showPointNames: project.showPointNames,
      autoSave: project.autoSave,
      theme: project.theme,
      measurementUnits: project.measurementUnits,
      precisionDigits: project.precisionDigits,
      showConstraintGlyphs: project.showConstraintGlyphs,
      showMeasurements: project.showMeasurements,
      autoOptimize: project.autoOptimize,
      gridVisible: project.gridVisible,
      snapToGrid: project.snapToGrid,
      defaultWorkspace: project.defaultWorkspace,
      showConstructionGeometry: project.showConstructionGeometry,
      enableSmartSnapping: project.enableSmartSnapping,
      constraintPreview: project.constraintPreview,
      visualFeedbackLevel: project.visualFeedbackLevel,
      imageSortOrder: project.imageSortOrder
    }

    return JSON.stringify(dto, null, 2)
  }

  static deserialize(json: string): Project {
    const dto = JSON.parse(json) as ProjectDto
    const context = new SerializationContext()

    // Deserialize in dependency order
    const worldPoints = new Set(
      dto.worldPoints.map(wpDto => WorldPoint.deserialize(wpDto, context))
    )

    const viewpoints = new Set(
      dto.viewpoints.map(vpDto => Viewpoint.deserialize(vpDto, context))
    )

    const lines = new Set(
      dto.lines.map(lineDto => Line.deserialize(lineDto, context))
    )

    const imagePoints = new Set(
      dto.imagePoints.map(ipDto => ImagePoint.deserialize(ipDto, context))
    )

    const constraints = new Set(
      dto.constraints.map(cDto => Constraint.deserialize(cDto, context))
    )

    return Project.createFull(
      dto.name,
      worldPoints,
      lines,
      viewpoints,
      imagePoints,
      constraints,
      dto.showPointNames,
      dto.autoSave,
      dto.theme,
      dto.measurementUnits,
      dto.precisionDigits,
      dto.showConstraintGlyphs,
      dto.showMeasurements,
      dto.autoOptimize,
      dto.gridVisible,
      dto.snapToGrid,
      dto.defaultWorkspace,
      dto.showConstructionGeometry,
      dto.enableSmartSnapping,
      dto.constraintPreview,
      dto.visualFeedbackLevel,
      dto.imageSortOrder
    )
  }

  // Keep localStorage helpers
  static saveToLocalStorage(project: Project, key: string = 'pictorigo-project'): void {
    const json = this.serialize(project)
    localStorage.setItem(key, json)
    localStorage.setItem(`${key}-timestamp`, new Date().toISOString())
  }

  static loadFromLocalStorage(key: string = 'pictorigo-project'): Project | null {
    const json = localStorage.getItem(key)
    if (!json) return null

    try {
      return this.deserialize(json)
    } catch (e) {
      console.error('Failed to load project from localStorage:', e)
      return null
    }
  }
}
```

**Deliverables**:
- [ ] `ProjectDto.ts` created
- [ ] `Serialization.ts` refactored (reduced from ~472 to ~100 lines)
- [ ] Old DTO interfaces removed

---

## Phase 9: Integration Testing (2 hours)

### 9.1 Full Project Round-Trip Test

**File**: `src/entities/__tests__/Serialization.integration.test.ts`

```typescript
import { Serialization } from '../Serialization'
import { Project } from '../project/Project'
import { WorldPoint } from '../world-point/WorldPoint'
import { Line } from '../line/Line'
import { Viewpoint } from '../viewpoint/Viewpoint'
import { ImagePoint } from '../imagePoint/ImagePoint'
import { DistanceConstraint } from '../constraints/distance-constraint'
import { AngleConstraint } from '../constraints/angle-constraint'

describe('Serialization Integration Tests', () => {
  test('empty project round-trip', () => {
    const original = Project.create('Empty Project')

    const json = Serialization.serialize(original)
    const deserialized = Serialization.deserialize(json)

    expect(deserialized.name).toBe('Empty Project')
    expect(deserialized.worldPoints.size).toBe(0)
    expect(deserialized.lines.size).toBe(0)
    expect(deserialized.viewpoints.size).toBe(0)
  })

  test('project with points and lines round-trip', () => {
    const project = Project.create('Test Project')

    const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0], optimizedXyz: [0, 0, 0] })
    const p2 = WorldPoint.create('P2', { lockedXyz: [10, 0, 0], optimizedXyz: [10, 0, 0] })
    const p3 = WorldPoint.create('P3', { lockedXyz: [5, 5, 0], optimizedXyz: [5, 5, 0] })

    project.addWorldPoint(p1)
    project.addWorldPoint(p2)
    project.addWorldPoint(p3)

    const line1 = Line.create('L1', p1, p2, { color: '#ff0000' })
    const line2 = Line.create('L2', p2, p3, { direction: 'vertical' })

    project.addLine(line1)
    project.addLine(line2)

    const json = Serialization.serialize(project)
    const deserialized = Serialization.deserialize(json)

    expect(deserialized.worldPoints.size).toBe(3)
    expect(deserialized.lines.size).toBe(2)

    const deserializedPoints = Array.from(deserialized.worldPoints)
    expect(deserializedPoints.find(p => p.name === 'P1')).toBeTruthy()
    expect(deserializedPoints.find(p => p.name === 'P2')).toBeTruthy()
    expect(deserializedPoints.find(p => p.name === 'P3')).toBeTruthy()

    const deserializedLines = Array.from(deserialized.lines)
    const l1 = deserializedLines.find(l => l.name === 'L1')
    expect(l1?.color).toBe('#ff0000')

    const l2 = deserializedLines.find(l => l.name === 'L2')
    expect(l2?.direction).toBe('vertical')
  })

  test('project with viewpoints and image points round-trip', () => {
    const project = Project.create('Photo Project')

    const wp = WorldPoint.create('Corner', { lockedXyz: [0, 0, 0] })
    project.addWorldPoint(wp)

    const vp1 = Viewpoint.create('IMG_001', 'img1.jpg', 'url1', 1920, 1080)
    const vp2 = Viewpoint.create('IMG_002', 'img2.jpg', 'url2', 1920, 1080)

    project.addViewpoint(vp1)
    project.addViewpoint(vp2)

    const ip1 = ImagePoint.create(wp, vp1, 500, 600)
    const ip2 = ImagePoint.create(wp, vp2, 700, 800)

    project.addImagePoint(ip1)
    project.addImagePoint(ip2)

    const json = Serialization.serialize(project)
    const deserialized = Serialization.deserialize(json)

    expect(deserialized.viewpoints.size).toBe(2)
    expect(deserialized.imagePoints.size).toBe(2)

    // Check relationships are preserved
    const deserializedWP = Array.from(deserialized.worldPoints)[0]
    expect(deserializedWP.imagePoints.size).toBe(2)

    const deserializedVP1 = Array.from(deserialized.viewpoints).find(v => v.name === 'IMG_001')
    expect(deserializedVP1?.imagePoints.size).toBe(1)
  })

  test('project with constraints round-trip', () => {
    const project = Project.create('Constrained Project')

    const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0], optimizedXyz: [0, 0, 0] })
    const p2 = WorldPoint.create('P2', { lockedXyz: [10, 0, 0], optimizedXyz: [10, 0, 0] })
    const p3 = WorldPoint.create('P3', { lockedXyz: [5, 5, 0], optimizedXyz: [5, 5, 0] })

    project.addWorldPoint(p1)
    project.addWorldPoint(p2)
    project.addWorldPoint(p3)

    const distConstraint = DistanceConstraint.create('D1', p1, p2, 10)
    const angleConstraint = AngleConstraint.create('A1', p1, p2, p3, 90)

    project.addConstraint(distConstraint)
    project.addConstraint(angleConstraint)

    const json = Serialization.serialize(project)
    const deserialized = Serialization.deserialize(json)

    expect(deserialized.constraints.size).toBe(2)

    const constraints = Array.from(deserialized.constraints)
    const dc = constraints.find(c => c.name === 'D1') as DistanceConstraint
    expect(dc).toBeInstanceOf(DistanceConstraint)
    expect(dc.targetDistance).toBe(10)

    const ac = constraints.find(c => c.name === 'A1') as AngleConstraint
    expect(ac).toBeInstanceOf(AngleConstraint)
    expect(ac.targetAngle).toBe(90)
  })

  test('complex project round-trip preserves all data', () => {
    // Create a realistic project
    const project = Project.create('Complex Project')
    project.theme = 'dark'
    project.measurementUnits = 'meters'
    project.showPointNames = true

    // 4 world points forming a square
    const p1 = WorldPoint.create('Corner1', { lockedXyz: [0, 0, 0], optimizedXyz: [0, 0, 0] })
    const p2 = WorldPoint.create('Corner2', { lockedXyz: [10, 0, 0], optimizedXyz: [10, 0, 0] })
    const p3 = WorldPoint.create('Corner3', { lockedXyz: [10, 10, 0], optimizedXyz: [10, 10, 0] })
    const p4 = WorldPoint.create('Corner4', { lockedXyz: [0, 10, 0], optimizedXyz: [0, 10, 0] })

    ;[p1, p2, p3, p4].forEach(p => project.addWorldPoint(p))

    // 4 lines forming square
    const l1 = Line.create('Side1', p1, p2)
    const l2 = Line.create('Side2', p2, p3)
    const l3 = Line.create('Side3', p3, p4)
    const l4 = Line.create('Side4', p4, p1)

    ;[l1, l2, l3, l4].forEach(l => project.addLine(l))

    // 2 viewpoints
    const vp1 = Viewpoint.create('Front', 'front.jpg', 'url1', 1920, 1080)
    const vp2 = Viewpoint.create('Side', 'side.jpg', 'url2', 1920, 1080)

    project.addViewpoint(vp1)
    project.addViewpoint(vp2)

    // Image points
    const ip1 = ImagePoint.create(p1, vp1, 100, 100)
    const ip2 = ImagePoint.create(p2, vp1, 900, 100)

    project.addImagePoint(ip1)
    project.addImagePoint(ip2)

    // Constraints
    const dc1 = DistanceConstraint.create('D1', p1, p2, 10)
    const dc2 = DistanceConstraint.create('D2', p2, p3, 10)
    const ac1 = AngleConstraint.create('A1', p1, p2, p3, 90)

    project.addConstraint(dc1)
    project.addConstraint(dc2)
    project.addConstraint(ac1)

    // Serialize and deserialize
    const json = Serialization.serialize(project)
    const deserialized = Serialization.deserialize(json)

    // Verify everything
    expect(deserialized.name).toBe('Complex Project')
    expect(deserialized.theme).toBe('dark')
    expect(deserialized.measurementUnits).toBe('meters')
    expect(deserialized.showPointNames).toBe(true)

    expect(deserialized.worldPoints.size).toBe(4)
    expect(deserialized.lines.size).toBe(4)
    expect(deserialized.viewpoints.size).toBe(2)
    expect(deserialized.imagePoints.size).toBe(2)
    expect(deserialized.constraints.size).toBe(3)

    // Verify JSON is parseable and re-serializes to same JSON
    const json2 = Serialization.serialize(deserialized)
    expect(JSON.parse(json)).toEqual(JSON.parse(json2))
  })

  test('JSON structure is clean and readable', () => {
    const project = Project.create('Test')
    const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] })
    project.addWorldPoint(p1)

    const json = Serialization.serialize(project)
    const parsed = JSON.parse(json)

    expect(parsed).toHaveProperty('name')
    expect(parsed).toHaveProperty('worldPoints')
    expect(parsed).toHaveProperty('lines')
    expect(parsed).toHaveProperty('viewpoints')
    expect(parsed).toHaveProperty('imagePoints')
    expect(parsed).toHaveProperty('constraints')

    expect(Array.isArray(parsed.worldPoints)).toBe(true)
    expect(parsed.worldPoints[0]).toHaveProperty('id')
    expect(parsed.worldPoints[0]).toHaveProperty('name')
  })
})
```

### 9.2 LocalStorage Integration Test

**File**: `src/entities/__tests__/Serialization.localStorage.test.ts`

```typescript
import { Serialization } from '../Serialization'
import { Project } from '../project/Project'
import { WorldPoint } from '../world-point/WorldPoint'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('Serialization LocalStorage Integration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('saves and loads from localStorage', () => {
    const project = Project.create('Saved Project')
    const p1 = WorldPoint.create('P1', { lockedXyz: [1, 2, 3] })
    project.addWorldPoint(p1)

    Serialization.saveToLocalStorage(project, 'test-key')

    const loaded = Serialization.loadFromLocalStorage('test-key')

    expect(loaded).not.toBeNull()
    expect(loaded?.name).toBe('Saved Project')
    expect(loaded?.worldPoints.size).toBe(1)
  })

  test('saves timestamp', () => {
    const project = Project.create('Test')
    Serialization.saveToLocalStorage(project, 'test-key')

    const timestamp = localStorage.getItem('test-key-timestamp')
    expect(timestamp).toBeTruthy()
    expect(new Date(timestamp!).getTime()).toBeGreaterThan(0)
  })

  test('returns null for missing key', () => {
    const loaded = Serialization.loadFromLocalStorage('nonexistent-key')
    expect(loaded).toBeNull()
  })

  test('handles corrupt JSON gracefully', () => {
    localStorage.setItem('test-key', 'invalid json {')

    const loaded = Serialization.loadFromLocalStorage('test-key')
    expect(loaded).toBeNull()
  })
})
```

**Deliverables**:
- [ ] Integration tests written
- [ ] All tests passing
- [ ] LocalStorage tests passing

---

## Phase 10: Cleanup & Documentation (1 hour)

### 10.1 Remove Old Code

Delete or archive:
- [ ] Old DTO interfaces from `Serialization.ts` (already removed in Phase 8)
- [ ] Old `worldPointToDto()`, `lineToDto()`, etc. methods (already removed)
- [ ] Any unused imports

### 10.2 Update Exports

**File**: `src/entities/index.ts`

```typescript
export * from './world-point'
export * from './line'
export * from './viewpoint'
export * from './imagePoint'
export * from './project'
export * from './constraints'
export * from './serialization'  // Add this
export { Serialization } from './Serialization'
```

### 10.3 Add Documentation

**File**: `src/entities/serialization/README.md`

```markdown
# Serialization System

## Overview

Entities implement self-serialization using `SerializationContext` for ID mapping.

## Usage

```typescript
import { Serialization } from './Serialization'

// Serialize
const json = Serialization.serialize(project)

// Deserialize
const project = Serialization.deserialize(json)

// LocalStorage
Serialization.saveToLocalStorage(project)
const loaded = Serialization.loadFromLocalStorage()
```

## Adding a New Entity Type

1. Create `EntityDto.ts`:
```typescript
export interface EntityDto extends BaseDto {
  id: string
  // ... fields
}
```

2. Implement `ISerializable<EntityDto>` on entity:
```typescript
serialize(context: SerializationContext): EntityDto {
  const id = context.getEntityId(this) || context.registerEntity(this)
  return { id, /* ... */ }
}

static deserialize(dto: EntityDto, context: SerializationContext): Entity {
  const entity = Entity.create(/* ... */)
  context.registerEntity(entity, dto.id)
  return entity
}
```

3. Add to `Serialization.ts` in dependency order

## Adding a New Constraint Type

1. Add DTO to `ConstraintDto.ts`
2. Implement serialize/deserialize on constraint class
3. Add case to `Constraint.deserialize()` switch
4. Write tests

## Dependency Order

Must serialize/deserialize in this order:
1. WorldPoint (no dependencies)
2. Viewpoint (no dependencies)
3. Line (depends on WorldPoint)
4. ImagePoint (depends on WorldPoint, Viewpoint)
5. Constraint (depends on WorldPoint, Line, etc.)
```

**Deliverables**:
- [ ] Old code removed
- [ ] Exports updated
- [ ] README created

---

## Phase 11: Final Validation (1 hour)

### 11.1 Run All Tests

```bash
npm test
```

Ensure:
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No console errors or warnings

### 11.2 Manual Testing

Create a test script:

**File**: `scripts/test-serialization.ts`

```typescript
import { Project } from '../src/entities/project/Project'
import { WorldPoint } from '../src/entities/world-point/WorldPoint'
import { Line } from '../src/entities/line/Line'
import { Viewpoint } from '../src/entities/viewpoint/Viewpoint'
import { ImagePoint } from '../src/entities/imagePoint/ImagePoint'
import { DistanceConstraint } from '../src/entities/constraints/distance-constraint'
import { Serialization } from '../src/entities/Serialization'

const project = Project.create('Manual Test Project')

// Add entities
const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0], optimizedXyz: [0, 0, 0] })
const p2 = WorldPoint.create('P2', { lockedXyz: [10, 0, 0], optimizedXyz: [10, 0, 0] })

project.addWorldPoint(p1)
project.addWorldPoint(p2)

const line = Line.create('L1', p1, p2)
project.addLine(line)

const vp = Viewpoint.create('IMG_001', 'test.jpg', 'url', 1920, 1080)
project.addViewpoint(vp)

const ip = ImagePoint.create(p1, vp, 500, 600)
project.addImagePoint(ip)

const constraint = DistanceConstraint.create('D1', p1, p2, 10)
project.addConstraint(constraint)

// Serialize
const json = Serialization.serialize(project)
console.log('Serialized JSON:')
console.log(json)

// Deserialize
const loaded = Serialization.deserialize(json)
console.log('\nDeserialized project:', loaded.name)
console.log('WorldPoints:', loaded.worldPoints.size)
console.log('Lines:', loaded.lines.size)
console.log('Viewpoints:', loaded.viewpoints.size)
console.log('ImagePoints:', loaded.imagePoints.size)
console.log('Constraints:', loaded.constraints.size)

// Verify
console.log('\n✓ Serialization successful!')
```

Run: `ts-node scripts/test-serialization.ts`

### 11.3 Code Review Checklist

- [ ] No console.log statements (except intentional logging)
- [ ] All errors have descriptive messages
- [ ] All public methods have JSDoc comments
- [ ] Type safety enforced (no `any` except metadata)
- [ ] No circular dependencies
- [ ] Consistent naming conventions
- [ ] All files exported properly

**Deliverables**:
- [ ] All tests passing
- [ ] Manual test script runs successfully
- [ ] Code review checklist complete

---

## Summary Checklist

### Infrastructure
- [ ] SerializationContext created and tested
- [ ] ISerializable interfaces created

### Entities
- [ ] WorldPoint serialization complete
- [ ] Viewpoint serialization complete
- [ ] Line serialization complete
- [ ] ImagePoint serialization complete

### Constraints
- [ ] Base Constraint polymorphic deserialization
- [ ] DistanceConstraint serialization
- [ ] AngleConstraint serialization
- [ ] ParallelLinesConstraint serialization
- [ ] PerpendicularLinesConstraint serialization
- [ ] FixedPointConstraint serialization
- [ ] CollinearPointsConstraint serialization
- [ ] CoplanarPointsConstraint serialization
- [ ] EqualDistancesConstraint serialization
- [ ] EqualAnglesConstraint serialization
- [ ] ProjectionConstraint serialization

### Project & Integration
- [ ] Project serialization complete
- [ ] Serialization.ts refactored
- [ ] Integration tests passing
- [ ] LocalStorage tests passing

### Cleanup
- [ ] Old code removed
- [ ] Documentation added
- [ ] All exports updated
- [ ] Final validation complete

---

## Success Metrics

**Before** (current):
- `Serialization.ts`: 472 lines
- Constraints: Not serializable
- Total serialization code: 472 lines in 1 file

**After** (target):
- `Serialization.ts`: ~100 lines
- `SerializationContext.ts`: ~50 lines
- Per entity: ~30 lines (×5 = 150)
- Per constraint: ~30 lines (×10 = 300)
- **Total**: ~600 lines distributed across 18 files
- **All entity types fully serializable**
- **Reduced centralization by 80%**

---

## Risk Mitigation

1. **Tests fail during entity migration**
   - Fix immediately before proceeding
   - Each phase is independent

2. **Constraint dependencies unclear**
   - Refer to dependency graph in analysis doc
   - Test each constraint in isolation first

3. **Circular references break serialization**
   - Don't serialize Sets/bidirectional refs
   - Reconstruct relationships in deserialize()

4. **Performance concerns**
   - Two-phase approach is O(n) per phase = O(2n) ≈ O(n)
   - Profile if needed, but should be fast

---

## Post-Implementation

After completion:
- [ ] Update main documentation
- [ ] Create example in project docs
- [ ] Consider adding version field to DTOs (future-proofing)
- [ ] Consider adding compression for large projects (future)
- [ ] Archive this plan for reference
