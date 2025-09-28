// Image entity with DTO and domain class co-located

import type { ImageId, CameraId, ImagePointId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import { ValidationHelpers } from '../validation/validator'

// ImagePoint DTO (was missing in current architecture)
export interface ImagePointDto {
  id: ImagePointId
  worldPointId: string // Will be PointId after migration
  u: number // pixel coordinate x
  v: number // pixel coordinate y
  isVisible: boolean
  isManuallyPlaced: boolean
  confidence: number // 0-1, quality of detection/placement
  createdAt: string
  updatedAt: string
}

// Image DTO for storage (clean, no legacy)
export interface ImageDto {
  id: ImageId
  name: string
  filename: string
  url: string
  width: number
  height: number
  cameraId?: CameraId

  // Image points collection (normalized)
  imagePoints: Record<ImagePointId, ImagePointDto>

  // Processing metadata
  isProcessed: boolean
  processingNotes?: string
  metadata?: {
    fileSize?: number
    mimeType?: string
    exifData?: Record<string, any>
    captureDate?: string
    gpsCoordinates?: [number, number]
  }

  // Display properties
  isVisible: boolean
  opacity: number
  group?: string
  tags?: string[]

  createdAt: string
  updatedAt: string
}

// Repository interface (to avoid circular dependency)
export interface ImageRepository {
  getCamera(cameraId: CameraId): EntityId | undefined
  getWorldPoint(pointId: string): EntityId | undefined
  entityExists(id: EntityId): boolean
  cameraExists(cameraId: CameraId): boolean
}

// Domain class with runtime behavior
export class Image implements ISelectable, IValidatable {
  private selected = false

  private constructor(
    private repo: ImageRepository,
    private data: ImageDto
  ) {}

  // Factory methods
  static fromDTO(dto: ImageDto, repo: ImageRepository): Image {
    const validation = Image.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid Image DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new Image(repo, { ...dto })
  }

  static create(
    id: ImageId,
    name: string,
    filename: string,
    url: string,
    width: number,
    height: number,
    repo: ImageRepository,
    options: {
      cameraId?: CameraId
      isProcessed?: boolean
      processingNotes?: string
      metadata?: ImageDto['metadata']
      isVisible?: boolean
      opacity?: number
      group?: string
      tags?: string[]
    } = {}
  ): Image {
    const now = new Date().toISOString()
    const dto: ImageDto = {
      id,
      name,
      filename,
      url,
      width,
      height,
      cameraId: options.cameraId,
      imagePoints: {},
      isProcessed: options.isProcessed ?? false,
      processingNotes: options.processingNotes,
      metadata: options.metadata,
      isVisible: options.isVisible ?? true,
      opacity: options.opacity ?? 1.0,
      group: options.group,
      tags: options.tags,
      createdAt: now,
      updatedAt: now
    }
    return new Image(repo, dto)
  }

  // Serialization
  toDTO(): ImageDto {
    return {
      ...this.data,
      imagePoints: { ...this.data.imagePoints },
      metadata: this.data.metadata ? { ...this.data.metadata } : undefined
    }
  }

  // ISelectable implementation
  getId(): ImageId {
    return this.data.id
  }

  getType(): SelectableType {
    return 'image'
  }

  getName(): string {
    return this.data.name
  }

  isVisible(): boolean {
    return this.data.isVisible
  }

  isLocked(): boolean {
    // Images aren't directly lockable
    return false
  }

  getDependencies(): EntityId[] {
    const dependencies: EntityId[] = []

    // Depends on camera if specified
    if (this.data.cameraId) {
      dependencies.push(this.data.cameraId as EntityId)
    }

    // Depends on world points referenced by image points
    Object.values(this.data.imagePoints).forEach(imagePoint => {
      dependencies.push(imagePoint.worldPointId as EntityId)
    })

    return dependencies
  }

  getDependents(): EntityId[] {
    // Images typically don't have dependents (they're leaf nodes in dependency graph)
    return []
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    // Images can usually be deleted safely
    return true
  }

  getDeleteWarning(): string | null {
    const imagePointCount = Object.keys(this.data.imagePoints).length
    if (imagePointCount > 0) {
      return `Deleting image "${this.data.name}" will remove ${imagePointCount} image point${imagePointCount === 1 ? '' : 's'}`
    }
    return null
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
      'image'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this.data.id, 'image')
    if (idError) errors.push(idError)

    const filenameError = ValidationHelpers.validateRequiredField(
      this.data.filename,
      'filename',
      this.data.id,
      'image'
    )
    if (filenameError) errors.push(filenameError)

    const urlError = ValidationHelpers.validateRequiredField(
      this.data.url,
      'url',
      this.data.id,
      'image'
    )
    if (urlError) errors.push(urlError)

    // Dimension validation
    if (this.data.width <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_WIDTH',
        'width must be greater than 0',
        this.data.id,
        'image',
        'width'
      ))
    }

    if (this.data.height <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_HEIGHT',
        'height must be greater than 0',
        this.data.id,
        'image',
        'height'
      ))
    }

    // Camera validation
    if (this.data.cameraId && !context.cameraExists(this.data.cameraId as EntityId)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_CAMERA_REFERENCE',
        `cameraId references non-existent camera: ${this.data.cameraId}`,
        this.data.id,
        'image',
        'cameraId'
      ))
    }

    // Opacity validation
    if (this.data.opacity < 0 || this.data.opacity > 1) {
      errors.push(ValidationHelpers.createError(
        'INVALID_OPACITY',
        'opacity must be between 0 and 1',
        this.data.id,
        'image',
        'opacity'
      ))
    }

    // Image points validation
    Object.entries(this.data.imagePoints).forEach(([imagePointId, imagePoint]) => {
      // Validate image point coordinates
      if (imagePoint.u < 0 || imagePoint.u > this.data.width) {
        warnings.push(ValidationHelpers.createWarning(
          'IMAGE_POINT_OUT_OF_BOUNDS',
          `Image point ${imagePointId} u-coordinate is outside image bounds`,
          this.data.id,
          'image',
          'imagePoints'
        ))
      }

      if (imagePoint.v < 0 || imagePoint.v > this.data.height) {
        warnings.push(ValidationHelpers.createWarning(
          'IMAGE_POINT_OUT_OF_BOUNDS',
          `Image point ${imagePointId} v-coordinate is outside image bounds`,
          this.data.id,
          'image',
          'imagePoints'
        ))
      }

      // Validate confidence
      if (imagePoint.confidence < 0 || imagePoint.confidence > 1) {
        errors.push(ValidationHelpers.createError(
          'INVALID_CONFIDENCE',
          `Image point ${imagePointId} confidence must be between 0 and 1`,
          this.data.id,
          'image',
          'imagePoints'
        ))
      }

      // Check world point reference exists
      // Note: Using string for now, will be PointId after migration
      if (!this.repo.getWorldPoint(imagePoint.worldPointId)) {
        errors.push(ValidationHelpers.createError(
          'INVALID_WORLD_POINT_REFERENCE',
          `Image point ${imagePointId} references non-existent world point: ${imagePoint.worldPointId}`,
          this.data.id,
          'image',
          'imagePoints'
        ))
      }
    })

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Image validation passed' : `Image validation failed: ${errors.length} errors`
    }
  }

  // Static DTO validation
  private static validateDto(dto: ImageDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'id is required',
        dto.id,
        'image',
        'id'
      ))
    }

    if (!dto.name) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'name is required',
        dto.id,
        'image',
        'name'
      ))
    }

    if (!dto.filename) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'filename is required',
        dto.id,
        'image',
        'filename'
      ))
    }

    if (!dto.url) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'url is required',
        dto.id,
        'image',
        'url'
      ))
    }

    if (dto.width <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_WIDTH',
        'width must be greater than 0',
        dto.id,
        'image',
        'width'
      ))
    }

    if (dto.height <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_HEIGHT',
        'height must be greater than 0',
        dto.id,
        'image',
        'height'
      ))
    }

    if (dto.opacity !== undefined && (dto.opacity < 0 || dto.opacity > 1)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_OPACITY',
        'opacity must be between 0 and 1',
        dto.id,
        'image',
        'opacity'
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

  get filename(): string {
    return this.data.filename
  }

  get url(): string {
    return this.data.url
  }

  set url(value: string) {
    this.data.url = value
    this.updateTimestamp()
  }

  get dimensions(): [number, number] {
    return [this.data.width, this.data.height]
  }

  get cameraId(): CameraId | undefined {
    return this.data.cameraId
  }

  set cameraId(value: CameraId | undefined) {
    this.data.cameraId = value
    this.updateTimestamp()
  }

  get isProcessed(): boolean {
    return this.data.isProcessed
  }

  set isProcessed(value: boolean) {
    this.data.isProcessed = value
    this.updateTimestamp()
  }

  get processingNotes(): string | undefined {
    return this.data.processingNotes
  }

  set processingNotes(value: string | undefined) {
    this.data.processingNotes = value
    this.updateTimestamp()
  }

  get metadata(): ImageDto['metadata'] {
    return this.data.metadata ? { ...this.data.metadata } : undefined
  }

  set metadata(value: ImageDto['metadata']) {
    this.data.metadata = value ? { ...value } : undefined
    this.updateTimestamp()
  }

  get opacity(): number {
    return this.data.opacity
  }

  set opacity(value: number) {
    if (value < 0 || value > 1) {
      throw new Error('Opacity must be between 0 and 1')
    }
    this.data.opacity = value
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

  // Image point management
  getImagePoints(): ImagePointDto[] {
    return Object.values(this.data.imagePoints)
  }

  getImagePoint(id: ImagePointId): ImagePointDto | undefined {
    return this.data.imagePoints[id]
  }

  addImagePoint(imagePoint: ImagePointDto): void {
    this.data.imagePoints[imagePoint.id] = { ...imagePoint }
    this.updateTimestamp()
  }

  removeImagePoint(id: ImagePointId): void {
    delete this.data.imagePoints[id]
    this.updateTimestamp()
  }

  updateImagePoint(id: ImagePointId, updates: Partial<ImagePointDto>): void {
    const existing = this.data.imagePoints[id]
    if (existing) {
      this.data.imagePoints[id] = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString()
      }
      this.updateTimestamp()
    }
  }

  getImagePointCount(): number {
    return Object.keys(this.data.imagePoints).length
  }

  // Utility methods
  hasCamera(): boolean {
    return this.data.cameraId !== undefined
  }

  getAspectRatio(): number {
    return this.data.width / this.data.height
  }

  isInBounds(u: number, v: number): boolean {
    return u >= 0 && u <= this.data.width && v >= 0 && v <= this.data.height
  }

  clone(newId: ImageId, newName?: string): Image {
    const clonedData: ImageDto = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      imagePoints: { ...this.data.imagePoints },
      metadata: this.data.metadata ? { ...this.data.metadata } : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new Image(this.repo, clonedData)
  }

  private updateTimestamp(): void {
    this.data.updatedAt = new Date().toISOString()
  }

  // Override visibility
  setVisible(visible: boolean): void {
    this.data.isVisible = visible
    this.updateTimestamp()
  }

  // Image-specific operations
  getImagePointsForWorldPoint(worldPointId: string): ImagePointDto[] {
    return Object.values(this.data.imagePoints).filter(
      ip => ip.worldPointId === worldPointId
    )
  }

  getVisibleImagePoints(): ImagePointDto[] {
    return Object.values(this.data.imagePoints).filter(ip => ip.isVisible)
  }

  // Convert pixel coordinates to normalized coordinates (0-1)
  pixelToNormalized(u: number, v: number): [number, number] {
    return [u / this.data.width, v / this.data.height]
  }

  // Convert normalized coordinates to pixel coordinates
  normalizedToPixel(u: number, v: number): [number, number] {
    return [u * this.data.width, v * this.data.height]
  }
}