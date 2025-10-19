// Viewpoint entity - a photograph with camera parameters and pose

import type { ViewpointId, ImagePointId, EntityId } from '../../types/ids'
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../../validation/validator'
import type { IValueMapContributor, ValueMap, CameraValues } from '../../optimization/IOptimizable'
import { ValidationHelpers } from '../../validation/validator'
import { V, Value, Vec3 } from 'scalar-autograd'
import { Vec4 } from '../../optimization/Vec4'
import { Quaternion } from '../../optimization/Quaternion'
import { quaternionNormalizationResidual } from '../../optimization/residuals/quaternion-normalization-residual'
import type { ViewpointDto, ImagePointDto } from './ViewpointDto'

// Repository interface
export interface ViewpointRepository {
  getWorldPoint(pointId: string): EntityId | undefined
  entityExists(id: EntityId): boolean
}

// Domain class
export class Viewpoint implements ISelectable, IValidatable, IValueMapContributor {
  private _selected = false
  private _isPoseLocked = false
  private _lastResiduals: number[] = []

  private constructor(
    private _repo: ViewpointRepository,
    private _data: ViewpointDto
  ) {}

  // ============================================================================
  // Factory methods
  // ============================================================================

  static fromDTO(dto: ViewpointDto, repo: ViewpointRepository): Viewpoint {
    const validation = Viewpoint.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid Viewpoint DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new Viewpoint(repo, { ...dto })
  }

  static create(
    id: ViewpointId,
    name: string,
    filename: string,
    url: string,
    imageWidth: number,
    imageHeight: number,
    repo: ViewpointRepository,
    options: {
      // Camera intrinsics
      focalLength?: number
      principalPointX?: number
      principalPointY?: number
      skewCoefficient?: number
      aspectRatio?: number
      radialDistortion?: [number, number, number]
      tangentialDistortion?: [number, number]

      // Camera extrinsics
      position?: [number, number, number]
      rotation?: [number, number, number, number]
      rotationEuler?: [number, number, number]
      isPoseLocked?: boolean

      // Metadata
      calibrationAccuracy?: number
      calibrationDate?: string
      calibrationNotes?: string
      isProcessed?: boolean
      processingNotes?: string
      metadata?: ViewpointDto['metadata']

      // Display
      isVisible?: boolean
      opacity?: number
      color?: string
      group?: string
      tags?: string[]
    } = {}
  ): Viewpoint {
    const now = new Date().toISOString()

    // Estimate focal length from image dimensions if not provided
    const defaultFocalLength = Math.max(imageWidth, imageHeight)

    // Handle rotation
    let rotation: [number, number, number, number]
    if (options.rotation) {
      rotation = options.rotation
    } else if (options.rotationEuler) {
      const quat = Quaternion.fromEuler(...options.rotationEuler)
      rotation = quat.toArray()
    } else {
      rotation = [1, 0, 0, 0] // Identity quaternion
    }

    const dto: ViewpointDto = {
      id,
      name,
      filename,
      url,
      imageWidth,
      imageHeight,
      focalLength: options.focalLength ?? defaultFocalLength,
      principalPointX: options.principalPointX ?? imageWidth / 2,
      principalPointY: options.principalPointY ?? imageHeight / 2,
      skewCoefficient: options.skewCoefficient ?? 0,
      aspectRatio: options.aspectRatio ?? 1,
      radialDistortion: options.radialDistortion ?? [0, 0, 0],
      tangentialDistortion: options.tangentialDistortion ?? [0, 0],
      position: options.position ?? [0, 0, 0],
      rotation,
      imagePoints: {},
      calibrationAccuracy: options.calibrationAccuracy ?? 0,
      calibrationDate: options.calibrationDate,
      calibrationNotes: options.calibrationNotes,
      isProcessed: options.isProcessed ?? false,
      processingNotes: options.processingNotes,
      metadata: options.metadata,
      isVisible: options.isVisible ?? true,
      opacity: options.opacity ?? 1.0,
      color: options.color || '#ffff00',
      group: options.group,
      tags: options.tags,
      createdAt: now,
      updatedAt: now
    }

    const viewpoint = new Viewpoint(repo, dto)
    viewpoint._isPoseLocked = options.isPoseLocked ?? false
    return viewpoint
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  toDTO(): ViewpointDto {
    return {
      ...this._data,
      radialDistortion: [...this._data.radialDistortion],
      tangentialDistortion: [...this._data.tangentialDistortion],
      position: [...this._data.position],
      rotation: [...this._data.rotation],
      imagePoints: { ...this._data.imagePoints },
      metadata: this._data.metadata ? { ...this._data.metadata } : undefined
    }
  }

  // ============================================================================
  // ISelectable implementation
  // ============================================================================

  getId(): ViewpointId {
    return this._data.id
  }

  getType(): SelectableType {
    return 'viewpoint'
  }

  getName(): string {
    return this._data.name
  }

  isVisible(): boolean {
    return this._data.isVisible
  }

  isLocked(): boolean {
    return this._isPoseLocked
  }

  getDependencies(): EntityId[] {
    // Depends on world points referenced by image points
    return Object.values(this._data.imagePoints).map(ip => ip.worldPointId as EntityId)
  }

  getDependents(): EntityId[] {
    return []
  }

  isSelected(): boolean {
    return this._selected
  }

  setSelected(selected: boolean): void {
    this._selected = selected
  }

  canDelete(): boolean {
    return true
  }

  getDeleteWarning(): string | null {
    const count = Object.keys(this._data.imagePoints).length
    if (count > 0) {
      return `Deleting viewpoint "${this._data.name}" will remove ${count} image point${count === 1 ? '' : 's'}`
    }
    return null
  }

  // ============================================================================
  // IValidatable implementation
  // ============================================================================

  validate(context: ValidationContext): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Basic validation
    const nameError = ValidationHelpers.validateRequiredField(this._data.name, 'name', this._data.id, 'viewpoint')
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this._data.id, 'viewpoint')
    if (idError) errors.push(idError)

    // Image validation
    if (this._data.imageWidth <= 0) {
      errors.push(ValidationHelpers.createError('INVALID_WIDTH', 'imageWidth must be > 0', this._data.id, 'viewpoint', 'imageWidth'))
    }
    if (this._data.imageHeight <= 0) {
      errors.push(ValidationHelpers.createError('INVALID_HEIGHT', 'imageHeight must be > 0', this._data.id, 'viewpoint', 'imageHeight'))
    }

    // Camera intrinsics validation
    if (this._data.focalLength <= 0) {
      errors.push(ValidationHelpers.createError('INVALID_FOCAL_LENGTH', 'focalLength must be > 0', this._data.id, 'viewpoint', 'focalLength'))
    }
    if (this._data.aspectRatio <= 0) {
      errors.push(ValidationHelpers.createError('INVALID_ASPECT_RATIO', 'aspectRatio must be > 0', this._data.id, 'viewpoint', 'aspectRatio'))
    }

    // Quaternion validation
    if (this._data.rotation.length === 4) {
      const [w, x, y, z] = this._data.rotation
      const magSq = w * w + x * x + y * y + z * z
      if (Math.abs(magSq - 1.0) > 0.01) {
        warnings.push(ValidationHelpers.createWarning('NON_UNIT_QUATERNION', `rotation quaternion not unit length (|q|² = ${magSq.toFixed(4)})`, this._data.id, 'viewpoint', 'rotation'))
      }
    }

    // Image points validation
    Object.entries(this._data.imagePoints).forEach(([imagePointId, imagePoint]) => {
      if (imagePoint.u < 0 || imagePoint.u > this._data.imageWidth) {
        warnings.push(ValidationHelpers.createWarning('IMAGE_POINT_OUT_OF_BOUNDS', `Image point ${imagePointId} u-coordinate outside bounds`, this._data.id, 'viewpoint', 'imagePoints'))
      }
      if (imagePoint.v < 0 || imagePoint.v > this._data.imageHeight) {
        warnings.push(ValidationHelpers.createWarning('IMAGE_POINT_OUT_OF_BOUNDS', `Image point ${imagePointId} v-coordinate outside bounds`, this._data.id, 'viewpoint', 'imagePoints'))
      }
      if (imagePoint.confidence < 0 || imagePoint.confidence > 1) {
        errors.push(ValidationHelpers.createError('INVALID_CONFIDENCE', `Image point ${imagePointId} confidence must be 0-1`, this._data.id, 'viewpoint', 'imagePoints'))
      }
    })

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Viewpoint validation passed' : `Viewpoint validation failed: ${errors.length} errors`
    }
  }

  private static validateDto(dto: ViewpointDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) errors.push(ValidationHelpers.createError('MISSING_REQUIRED_FIELD', 'id required', dto.id, 'viewpoint', 'id'))
    if (!dto.name) errors.push(ValidationHelpers.createError('MISSING_REQUIRED_FIELD', 'name required', dto.id, 'viewpoint', 'name'))
    if (!dto.filename) errors.push(ValidationHelpers.createError('MISSING_REQUIRED_FIELD', 'filename required', dto.id, 'viewpoint', 'filename'))
    if (!dto.url) errors.push(ValidationHelpers.createError('MISSING_REQUIRED_FIELD', 'url required', dto.id, 'viewpoint', 'url'))

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'DTO validation passed' : `DTO validation failed: ${errors.length} errors`
    }
  }

  // ============================================================================
  // Domain getters/setters
  // ============================================================================

  get name(): string { return this._data.name }
  set name(v: string) { this._data.name = v; this.updateTimestamp() }

  get filename(): string { return this._data.filename }
  get url(): string { return this._data.url }
  set url(v: string) { this._data.url = v; this.updateTimestamp() }

  get imageDimensions(): [number, number] { return [this._data.imageWidth, this._data.imageHeight] }

  get focalLength(): number { return this._data.focalLength }
  set focalLength(v: number) { this._data.focalLength = v; this.updateTimestamp() }

  get position(): [number, number, number] { return [...this._data.position] }
  set position(v: [number, number, number]) { this._data.position = [...v]; this.updateTimestamp() }

  get rotation(): [number, number, number, number] { return [...this._data.rotation] }
  set rotation(v: [number, number, number, number]) { this._data.rotation = [...v]; this.updateTimestamp() }

  getRotationEuler(): [number, number, number] {
    const quat = Vec4.fromData(...this._data.rotation)
    return Quaternion.toEuler(quat)
  }

  setRotationEuler(roll: number, pitch: number, yaw: number): void {
    const quat = Quaternion.fromEuler(roll, pitch, yaw)
    this._data.rotation = quat.toArray()
    this.updateTimestamp()
  }

  get opacity(): number { return this._data.opacity }
  set opacity(v: number) {
    if (v < 0 || v > 1) throw new Error('Opacity must be 0-1')
    this._data.opacity = v
    this.updateTimestamp()
  }

  get color(): string { return this._data.color }
  set color(v: string) { this._data.color = v; this.updateTimestamp() }

  get group(): string | undefined { return this._data.group }
  set group(v: string | undefined) { this._data.group = v; this.updateTimestamp() }

  get tags(): string[] { return this._data.tags ? [...this._data.tags] : [] }
  set tags(v: string[]) { this._data.tags = [...v]; this.updateTimestamp() }

  get createdAt(): string { return this._data.createdAt }
  get updatedAt(): string { return this._data.updatedAt }

  // ============================================================================
  // Image point management
  // ============================================================================

  getImagePoints(): ImagePointDto[] {
    return Object.values(this._data.imagePoints)
  }

  getImagePoint(id: ImagePointId): ImagePointDto | undefined {
    return this._data.imagePoints[id]
  }

  addImagePoint(imagePoint: ImagePointDto): void {
    this._data.imagePoints[imagePoint.id] = { ...imagePoint }
    this.updateTimestamp()
  }

  removeImagePoint(id: ImagePointId): void {
    delete this._data.imagePoints[id]
    this.updateTimestamp()
  }

  updateImagePoint(id: ImagePointId, updates: Partial<ImagePointDto>): void {
    const existing = this._data.imagePoints[id]
    if (existing) {
      this._data.imagePoints[id] = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString()
      }
      this.updateTimestamp()
    }
  }

  getImagePointCount(): number {
    return Object.keys(this._data.imagePoints).length
  }

  getImagePointsForWorldPoint(worldPointId: string): ImagePointDto[] {
    return Object.values(this._data.imagePoints).filter(ip => ip.worldPointId === worldPointId)
  }

  getVisibleImagePoints(): ImagePointDto[] {
    return Object.values(this._data.imagePoints).filter(ip => ip.isVisible)
  }

  // ============================================================================
  // Utility methods
  // ============================================================================

  getIntrinsicMatrix(): number[][] {
    const fx = this._data.focalLength
    const fy = this._data.focalLength * this._data.aspectRatio
    const cx = this._data.principalPointX
    const cy = this._data.principalPointY
    const s = this._data.skewCoefficient

    return [
      [fx, s, cx],
      [0, fy, cy],
      [0, 0, 1]
    ]
  }

  getAspectRatio(): number {
    return this._data.imageWidth / this._data.imageHeight
  }

  isInBounds(u: number, v: number): boolean {
    return u >= 0 && u <= this._data.imageWidth && v >= 0 && v <= this._data.imageHeight
  }

  pixelToNormalized(u: number, v: number): [number, number] {
    return [u / this._data.imageWidth, v / this._data.imageHeight]
  }

  normalizedToPixel(u: number, v: number): [number, number] {
    return [u * this._data.imageWidth, v * this._data.imageHeight]
  }

  clone(newId: ViewpointId, newName?: string): Viewpoint {
    const now = new Date().toISOString()
    const clonedData: ViewpointDto = {
      ...this._data,
      id: newId,
      name: newName || `${this._data.name} (copy)`,
      radialDistortion: [...this._data.radialDistortion],
      tangentialDistortion: [...this._data.tangentialDistortion],
      position: [...this._data.position],
      rotation: [...this._data.rotation],
      imagePoints: { ...this._data.imagePoints },
      metadata: this._data.metadata ? { ...this._data.metadata } : undefined,
      createdAt: now,
      updatedAt: now
    }
    return new Viewpoint(this._repo, clonedData)
  }

  setVisible(visible: boolean): void {
    this._data.isVisible = visible
    this.updateTimestamp()
  }

  setPoseLocked(locked: boolean): void {
    this._isPoseLocked = locked
  }

  private updateTimestamp(): void {
    this._data.updatedAt = new Date().toISOString()
  }

  // ============================================================================
  // IValueMapContributor implementation
  // ============================================================================

  addToValueMap(
    valueMap: ValueMap,
    options: {
      optimizePose?: boolean
      optimizeIntrinsics?: boolean
      optimizeDistortion?: boolean
    } = {}
  ): Value[] {
    const variables: Value[] = []
    const {
      optimizePose = !this._isPoseLocked,
      optimizeIntrinsics = false,
      optimizeDistortion = false
    } = options

    // Position
    const px = optimizePose ? V.W(this._data.position[0]) : V.C(this._data.position[0])
    const py = optimizePose ? V.W(this._data.position[1]) : V.C(this._data.position[1])
    const pz = optimizePose ? V.W(this._data.position[2]) : V.C(this._data.position[2])
    const position = new Vec3(px, py, pz)
    if (optimizePose) variables.push(px, py, pz)

    // Rotation quaternion
    const qw = optimizePose ? V.W(this._data.rotation[0]) : V.C(this._data.rotation[0])
    const qx = optimizePose ? V.W(this._data.rotation[1]) : V.C(this._data.rotation[1])
    const qy = optimizePose ? V.W(this._data.rotation[2]) : V.C(this._data.rotation[2])
    const qz = optimizePose ? V.W(this._data.rotation[3]) : V.C(this._data.rotation[3])
    const rotation = new Vec4(qw, qx, qy, qz)
    if (optimizePose) variables.push(qw, qx, qy, qz)

    // Intrinsics
    const focalLength = optimizeIntrinsics ? V.W(this._data.focalLength) : V.C(this._data.focalLength)
    const aspectRatio = optimizeIntrinsics ? V.W(this._data.aspectRatio) : V.C(this._data.aspectRatio)
    const principalPointX = optimizeIntrinsics ? V.W(this._data.principalPointX) : V.C(this._data.principalPointX)
    const principalPointY = optimizeIntrinsics ? V.W(this._data.principalPointY) : V.C(this._data.principalPointY)
    const skew = optimizeIntrinsics ? V.W(this._data.skewCoefficient) : V.C(this._data.skewCoefficient)
    if (optimizeIntrinsics) variables.push(focalLength, aspectRatio, principalPointX, principalPointY, skew)

    // Distortion
    const k1 = optimizeDistortion ? V.W(this._data.radialDistortion[0]) : V.C(this._data.radialDistortion[0])
    const k2 = optimizeDistortion ? V.W(this._data.radialDistortion[1]) : V.C(this._data.radialDistortion[1])
    const k3 = optimizeDistortion ? V.W(this._data.radialDistortion[2]) : V.C(this._data.radialDistortion[2])
    const p1 = optimizeDistortion ? V.W(this._data.tangentialDistortion[0]) : V.C(this._data.tangentialDistortion[0])
    const p2 = optimizeDistortion ? V.W(this._data.tangentialDistortion[1]) : V.C(this._data.tangentialDistortion[1])
    if (optimizeDistortion) variables.push(k1, k2, k3, p1, p2)

    const cameraValues: CameraValues = {
      position,
      rotation,
      focalLength,
      aspectRatio,
      principalPointX,
      principalPointY,
      skew,
      k1, k2, k3, p1, p2
    }

    valueMap.cameras.set(this as any, cameraValues)
    return variables
  }

  computeResiduals(valueMap: ValueMap): Value[] {
    const cameraValues = valueMap.cameras.get(this as any)
    if (!cameraValues) return []

    // Enforce unit quaternion: |q|² = 1
    return [quaternionNormalizationResidual(cameraValues.rotation)]
  }

  applyOptimizationResultFromValueMap(valueMap: ValueMap): void {
    const cameraValues = valueMap.cameras.get(this as any)
    if (!cameraValues) return

    this._data.position = [cameraValues.position.x.data, cameraValues.position.y.data, cameraValues.position.z.data]
    this._data.rotation = [cameraValues.rotation.w.data, cameraValues.rotation.x.data, cameraValues.rotation.y.data, cameraValues.rotation.z.data]
    this._data.focalLength = cameraValues.focalLength.data
    this._data.aspectRatio = cameraValues.aspectRatio.data
    this._data.principalPointX = cameraValues.principalPointX.data
    this._data.principalPointY = cameraValues.principalPointY.data
    this._data.skewCoefficient = cameraValues.skew.data
    this._data.radialDistortion = [cameraValues.k1.data, cameraValues.k2.data, cameraValues.k3.data]
    this._data.tangentialDistortion = [cameraValues.p1.data, cameraValues.p2.data]

    const residuals = this.computeResiduals(valueMap)
    this._lastResiduals = residuals.map(r => r.data)
    this.updateTimestamp()
  }

  getLastResiduals(): number[] {
    return [...this._lastResiduals]
  }
}
