// Camera entity with DTO and domain class co-located

import type { CameraId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import { ValidationHelpers } from '../validation/validator'

// DTO for storage (clean, no legacy)
export interface CameraDto {
  id: CameraId
  name: string

  // Intrinsic parameters
  focalLength: number
  principalPointX: number
  principalPointY: number
  skewCoefficient: number
  aspectRatio: number

  // Distortion parameters
  radialDistortion: [number, number, number] // k1, k2, k3
  tangentialDistortion: [number, number] // p1, p2

  // Extrinsic parameters (camera pose in world coordinates)
  position: [number, number, number] // x, y, z
  rotation: [number, number, number] // rotation angles or quaternion representation

  // Image dimensions
  imageWidth: number
  imageHeight: number

  // Calibration metadata
  calibrationAccuracy: number
  calibrationDate?: string
  calibrationNotes?: string

  // Display properties
  isVisible: boolean
  color: string
  group?: string
  tags?: string[]

  createdAt: string
  updatedAt: string
}

// Repository interface (to avoid circular dependency)
export interface CameraRepository {
  getImagesByCamera(cameraId: CameraId): EntityId[]
  entityExists(id: EntityId): boolean
}

// Domain class with runtime behavior
export class Camera implements ISelectable, IValidatable {
  private selected = false

  private constructor(
    private repo: CameraRepository,
    private data: CameraDto
  ) {}

  // Factory methods
  static fromDTO(dto: CameraDto, repo: CameraRepository): Camera {
    const validation = Camera.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid Camera DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new Camera(repo, { ...dto })
  }

  static create(
    id: CameraId,
    name: string,
    focalLength: number,
    imageWidth: number,
    imageHeight: number,
    repo: CameraRepository,
    options: {
      principalPointX?: number
      principalPointY?: number
      skewCoefficient?: number
      aspectRatio?: number
      radialDistortion?: [number, number, number]
      tangentialDistortion?: [number, number]
      position?: [number, number, number]
      rotation?: [number, number, number]
      calibrationAccuracy?: number
      calibrationDate?: string
      calibrationNotes?: string
      isVisible?: boolean
      color?: string
      group?: string
      tags?: string[]
    } = {}
  ): Camera {
    const now = new Date().toISOString()
    const dto: CameraDto = {
      id,
      name,
      focalLength,
      principalPointX: options.principalPointX ?? imageWidth / 2,
      principalPointY: options.principalPointY ?? imageHeight / 2,
      skewCoefficient: options.skewCoefficient ?? 0,
      aspectRatio: options.aspectRatio ?? 1,
      radialDistortion: options.radialDistortion ?? [0, 0, 0],
      tangentialDistortion: options.tangentialDistortion ?? [0, 0],
      position: options.position ?? [0, 0, 0],
      rotation: options.rotation ?? [0, 0, 0],
      imageWidth,
      imageHeight,
      calibrationAccuracy: options.calibrationAccuracy ?? 0,
      calibrationDate: options.calibrationDate,
      calibrationNotes: options.calibrationNotes,
      isVisible: options.isVisible ?? true,
      color: options.color || '#ffff00',
      group: options.group,
      tags: options.tags,
      createdAt: now,
      updatedAt: now
    }
    return new Camera(repo, dto)
  }

  // Serialization
  toDTO(): CameraDto {
    return {
      ...this.data,
      radialDistortion: [...this.data.radialDistortion],
      tangentialDistortion: [...this.data.tangentialDistortion],
      position: [...this.data.position],
      rotation: [...this.data.rotation]
    }
  }

  // ISelectable implementation
  getId(): CameraId {
    return this.data.id
  }

  getType(): SelectableType {
    return 'camera'
  }

  getName(): string {
    return this.data.name
  }

  isVisible(): boolean {
    return this.data.isVisible
  }

  isLocked(): boolean {
    // Cameras aren't directly lockable
    return false
  }

  getDependencies(): EntityId[] {
    // Cameras are typically independent entities
    return []
  }

  getDependents(): EntityId[] {
    // Images that depend on this camera
    return this.repo.getImagesByCamera(this.data.id)
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    // Can delete if no images depend on this camera
    return this.getDependents().length === 0
  }

  getDeleteWarning(): string | null {
    const dependents = this.getDependents()
    if (dependents.length === 0) {
      return null
    }

    return `Deleting camera "${this.data.name}" will affect ${dependents.length} image${dependents.length === 1 ? '' : 's'}`
  }

  // IValidatable implementation
  validate(context: ValidationContext): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Required field validation
    const nameError = ValidationHelpers.validateRequiredField(
      this.data.name,
      'name',
      this.data.id,
      'camera'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this.data.id, 'camera')
    if (idError) errors.push(idError)

    // Focal length validation
    if (this.data.focalLength <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_FOCAL_LENGTH',
        'focalLength must be greater than 0',
        this.data.id,
        'camera',
        'focalLength'
      ))
    }

    // Image dimensions validation
    if (this.data.imageWidth <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_IMAGE_WIDTH',
        'imageWidth must be greater than 0',
        this.data.id,
        'camera',
        'imageWidth'
      ))
    }

    if (this.data.imageHeight <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_IMAGE_HEIGHT',
        'imageHeight must be greater than 0',
        this.data.id,
        'camera',
        'imageHeight'
      ))
    }

    // Principal point validation
    if (this.data.principalPointX < 0 || this.data.principalPointX > this.data.imageWidth) {
      warnings.push(ValidationHelpers.createWarning(
        'PRINCIPAL_POINT_OUT_OF_BOUNDS',
        'principalPointX is outside image bounds',
        this.data.id,
        'camera',
        'principalPointX'
      ))
    }

    if (this.data.principalPointY < 0 || this.data.principalPointY > this.data.imageHeight) {
      warnings.push(ValidationHelpers.createWarning(
        'PRINCIPAL_POINT_OUT_OF_BOUNDS',
        'principalPointY is outside image bounds',
        this.data.id,
        'camera',
        'principalPointY'
      ))
    }

    // Aspect ratio validation
    if (this.data.aspectRatio <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_ASPECT_RATIO',
        'aspectRatio must be greater than 0',
        this.data.id,
        'camera',
        'aspectRatio'
      ))
    }

    // Distortion validation
    if (!Array.isArray(this.data.radialDistortion) || this.data.radialDistortion.length !== 3) {
      errors.push(ValidationHelpers.createError(
        'INVALID_RADIAL_DISTORTION',
        'radialDistortion must be an array of 3 numbers',
        this.data.id,
        'camera',
        'radialDistortion'
      ))
    }

    if (!Array.isArray(this.data.tangentialDistortion) || this.data.tangentialDistortion.length !== 2) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TANGENTIAL_DISTORTION',
        'tangentialDistortion must be an array of 2 numbers',
        this.data.id,
        'camera',
        'tangentialDistortion'
      ))
    }

    // Position and rotation validation
    if (!Array.isArray(this.data.position) || this.data.position.length !== 3) {
      errors.push(ValidationHelpers.createError(
        'INVALID_POSITION',
        'position must be an array of 3 numbers',
        this.data.id,
        'camera',
        'position'
      ))
    }

    if (!Array.isArray(this.data.rotation) || this.data.rotation.length !== 3) {
      errors.push(ValidationHelpers.createError(
        'INVALID_ROTATION',
        'rotation must be an array of 3 numbers',
        this.data.id,
        'camera',
        'rotation'
      ))
    }

    // Color validation
    if (this.data.color && !/^#[0-9A-Fa-f]{6}$/.test(this.data.color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        this.data.id,
        'camera',
        'color'
      ))
    }

    // Calibration accuracy validation
    if (this.data.calibrationAccuracy < 0 || this.data.calibrationAccuracy > 1) {
      warnings.push(ValidationHelpers.createWarning(
        'CALIBRATION_ACCURACY_OUT_OF_RANGE',
        'calibrationAccuracy should be between 0 and 1',
        this.data.id,
        'camera',
        'calibrationAccuracy'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Camera validation passed' : `Camera validation failed: ${errors.length} errors`
    }
  }

  // Static DTO validation
  private static validateDto(dto: CameraDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'id is required',
        dto.id,
        'camera',
        'id'
      ))
    }

    if (!dto.name) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'name is required',
        dto.id,
        'camera',
        'name'
      ))
    }

    if (dto.focalLength <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_FOCAL_LENGTH',
        'focalLength must be greater than 0',
        dto.id,
        'camera',
        'focalLength'
      ))
    }

    if (dto.imageWidth <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_IMAGE_WIDTH',
        'imageWidth must be greater than 0',
        dto.id,
        'camera',
        'imageWidth'
      ))
    }

    if (dto.imageHeight <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_IMAGE_HEIGHT',
        'imageHeight must be greater than 0',
        dto.id,
        'camera',
        'imageHeight'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'DTO validation passed' : `DTO validation failed: ${errors.length} errors`
    }
  }

  // Domain methods (getters/setters)
  get name(): string {
    return this.data.name
  }

  set name(value: string) {
    this.data.name = value
    this.updateTimestamp()
  }

  get focalLength(): number {
    return this.data.focalLength
  }

  set focalLength(value: number) {
    if (value <= 0) {
      throw new Error('Focal length must be greater than 0')
    }
    this.data.focalLength = value
    this.updateTimestamp()
  }

  get principalPoint(): [number, number] {
    return [this.data.principalPointX, this.data.principalPointY]
  }

  setPrincipalPoint(x: number, y: number): void {
    this.data.principalPointX = x
    this.data.principalPointY = y
    this.updateTimestamp()
  }

  get distortionParameters(): { radial: [number, number, number]; tangential: [number, number] } {
    return {
      radial: [...this.data.radialDistortion],
      tangential: [...this.data.tangentialDistortion]
    }
  }

  setDistortionParameters(radial: [number, number, number], tangential: [number, number]): void {
    this.data.radialDistortion = [...radial]
    this.data.tangentialDistortion = [...tangential]
    this.updateTimestamp()
  }

  get position(): [number, number, number] {
    return [...this.data.position]
  }

  set position(value: [number, number, number]) {
    this.data.position = [...value]
    this.updateTimestamp()
  }

  get rotation(): [number, number, number] {
    return [...this.data.rotation]
  }

  set rotation(value: [number, number, number]) {
    this.data.rotation = [...value]
    this.updateTimestamp()
  }

  get imageDimensions(): [number, number] {
    return [this.data.imageWidth, this.data.imageHeight]
  }

  setImageDimensions(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new Error('Image dimensions must be greater than 0')
    }
    this.data.imageWidth = width
    this.data.imageHeight = height
    this.updateTimestamp()
  }

  get calibrationAccuracy(): number {
    return this.data.calibrationAccuracy
  }

  set calibrationAccuracy(value: number) {
    this.data.calibrationAccuracy = value
    this.updateTimestamp()
  }

  get calibrationDate(): string | undefined {
    return this.data.calibrationDate
  }

  set calibrationDate(value: string | undefined) {
    this.data.calibrationDate = value
    this.updateTimestamp()
  }

  get calibrationNotes(): string | undefined {
    return this.data.calibrationNotes
  }

  set calibrationNotes(value: string | undefined) {
    this.data.calibrationNotes = value
    this.updateTimestamp()
  }

  get color(): string {
    return this.data.color
  }

  set color(value: string) {
    this.data.color = value
    this.updateTimestamp()
  }

  get group(): string | undefined {
    return this.data.group
  }

  set group(value: string | undefined) {
    this.data.group = value
    this.updateTimestamp()
  }

  get tags(): string[] {
    return this.data.tags ? [...this.data.tags] : []
  }

  set tags(value: string[]) {
    this.data.tags = [...value]
    this.updateTimestamp()
  }

  get createdAt(): string {
    return this.data.createdAt
  }

  get updatedAt(): string {
    return this.data.updatedAt
  }

  // Utility methods
  isCalibrated(): boolean {
    return this.data.calibrationAccuracy > 0
  }

  getIntrinsicMatrix(): number[][] {
    // K = [[fx, s, cx], [0, fy, cy], [0, 0, 1]]
    const fx = this.data.focalLength
    const fy = this.data.focalLength * this.data.aspectRatio
    const cx = this.data.principalPointX
    const cy = this.data.principalPointY
    const s = this.data.skewCoefficient

    return [
      [fx, s, cx],
      [0, fy, cy],
      [0, 0, 1]
    ]
  }

  clone(newId: CameraId, newName?: string): Camera {
    const clonedData: CameraDto = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      radialDistortion: [...this.data.radialDistortion],
      tangentialDistortion: [...this.data.tangentialDistortion],
      position: [...this.data.position],
      rotation: [...this.data.rotation],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new Camera(this.repo, clonedData)
  }

  private updateTimestamp(): void {
    this.data.updatedAt = new Date().toISOString()
  }

  // Override visibility
  setVisible(visible: boolean): void {
    this.data.isVisible = visible
    this.updateTimestamp()
  }

  // Camera-specific operations
  projectPoint(worldPoint: [number, number, number]): [number, number] | null {
    // Project 3D world point to 2D image coordinates
    // This is a placeholder - actual implementation would involve full camera projection
    return null
  }

  unprojectPoint(imagePoint: [number, number], depth: number): [number, number, number] | null {
    // Unproject 2D image point to 3D world coordinates at given depth
    // This is a placeholder
    return null
  }
}