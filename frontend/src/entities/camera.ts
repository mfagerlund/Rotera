// Camera entity with DTO and domain class co-located

import type { CameraId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import type { IValueMapContributor, ValueMap, CameraValues, ValueProvenance } from '../optimization/IOptimizable'
import { V, Value, Vec3 } from 'scalar-autograd'
import { ValidationHelpers } from '../validation/validator'
import { Vec4 } from '../optimization/Vec4'
import { Quaternion } from '../optimization/Quaternion'
import { quaternionNormalizationResidual } from '../optimization/residuals/quaternion-normalization-residual'

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
  rotation: [number, number, number, number] // quaternion (w, x, y, z) - unit quaternion for rotation

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
export class Camera implements ISelectable, IValidatable, IValueMapContributor {
  private selected = false
  private poseProvenance?: ValueProvenance
  private intrinsicsProvenance?: ValueProvenance
  private isPoseLocked = false // For optimization control

  // Store residuals from intrinsic constraints (quaternion normalization)
  private lastResiduals: number[] = []

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
      rotation?: [number, number, number, number] // quaternion (w, x, y, z)
      rotationEuler?: [number, number, number] // alternative: euler angles (roll, pitch, yaw) in radians
      calibrationAccuracy?: number
      calibrationDate?: string
      calibrationNotes?: string
      isVisible?: boolean
      color?: string
      group?: string
      tags?: string[]
      isPoseLocked?: boolean // Lock camera pose during optimization
    } = {}
  ): Camera {
    const now = new Date().toISOString()

    // Handle rotation: prefer quaternion, fallback to euler, default to identity
    let rotation: [number, number, number, number];
    if (options.rotation) {
      rotation = options.rotation;
    } else if (options.rotationEuler) {
      const quat = Quaternion.fromEuler(...options.rotationEuler);
      rotation = quat.toArray();
    } else {
      rotation = [1, 0, 0, 0]; // Identity quaternion
    }

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
      rotation,
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
    const camera = new Camera(repo, dto)
    camera.isPoseLocked = options.isPoseLocked ?? false
    return camera
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

    if (!Array.isArray(this.data.rotation) || this.data.rotation.length !== 4) {
      errors.push(ValidationHelpers.createError(
        'INVALID_ROTATION',
        'rotation must be an array of 4 numbers (quaternion: w, x, y, z)',
        this.data.id,
        'camera',
        'rotation'
      ))
    }

    // Validate quaternion is roughly unit length
    if (this.data.rotation.length === 4) {
      const [w, x, y, z] = this.data.rotation;
      const magSq = w * w + x * x + y * y + z * z;
      if (Math.abs(magSq - 1.0) > 0.01) {
        warnings.push(ValidationHelpers.createWarning(
          'NON_UNIT_QUATERNION',
          `rotation quaternion is not unit length (|q|² = ${magSq.toFixed(4)}, expected 1.0)`,
          this.data.id,
          'camera',
          'rotation'
        ))
      }
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

  get rotation(): [number, number, number, number] {
    return [...this.data.rotation]
  }

  set rotation(value: [number, number, number, number]) {
    this.data.rotation = [...value]
    this.updateTimestamp()
  }

  /**
   * Get rotation as Euler angles (roll, pitch, yaw) in radians.
   * Useful for UI display and backward compatibility.
   */
  getRotationEuler(): [number, number, number] {
    const quat = Vec4.fromData(...this.data.rotation);
    return Quaternion.toEuler(quat);
  }

  /**
   * Set rotation from Euler angles (roll, pitch, yaw) in radians.
   */
  setRotationEuler(roll: number, pitch: number, yaw: number): void {
    const quat = Quaternion.fromEuler(roll, pitch, yaw);
    this.data.rotation = quat.toArray();
    this.updateTimestamp();
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

  // IValueMapContributor implementation
  /**
   * Add camera parameters to the ValueMap for optimization.
   * By default, optimizes camera pose (position + rotation).
   * Intrinsics are constants unless explicitly marked for optimization.
   *
   * @param valueMap - The ValueMap to add camera parameters to
   * @param options - Control what gets optimized
   * @returns Array of Value objects that are optimization variables
   */
  addToValueMap(
    valueMap: ValueMap,
    options: {
      optimizePose?: boolean;
      optimizeIntrinsics?: boolean;
      optimizeDistortion?: boolean;
    } = {}
  ): Value[] {
    const variables: Value[] = [];
    const {
      optimizePose = !this.isPoseLocked, // Respect pose lock
      optimizeIntrinsics = false,
      optimizeDistortion = false,
    } = options;

    // Position (3 variables if optimizing pose)
    const px = optimizePose ? V.W(this.data.position[0]) : V.C(this.data.position[0]);
    const py = optimizePose ? V.W(this.data.position[1]) : V.C(this.data.position[1]);
    const pz = optimizePose ? V.W(this.data.position[2]) : V.C(this.data.position[2]);
    const position = new Vec3(px, py, pz);

    if (optimizePose) {
      variables.push(px, py, pz);
    }

    // Rotation as quaternion (4 variables if optimizing pose)
    const qw = optimizePose ? V.W(this.data.rotation[0]) : V.C(this.data.rotation[0]);
    const qx = optimizePose ? V.W(this.data.rotation[1]) : V.C(this.data.rotation[1]);
    const qy = optimizePose ? V.W(this.data.rotation[2]) : V.C(this.data.rotation[2]);
    const qz = optimizePose ? V.W(this.data.rotation[3]) : V.C(this.data.rotation[3]);
    const rotation = new Vec4(qw, qx, qy, qz);

    if (optimizePose) {
      variables.push(qw, qx, qy, qz);
    }

    // Intrinsics (constants by default)
    const focalLength = optimizeIntrinsics
      ? V.W(this.data.focalLength)
      : V.C(this.data.focalLength);

    const aspectRatio = optimizeIntrinsics
      ? V.W(this.data.aspectRatio)
      : V.C(this.data.aspectRatio);

    const principalPointX = optimizeIntrinsics
      ? V.W(this.data.principalPointX)
      : V.C(this.data.principalPointX);

    const principalPointY = optimizeIntrinsics
      ? V.W(this.data.principalPointY)
      : V.C(this.data.principalPointY);

    const skew = optimizeIntrinsics
      ? V.W(this.data.skewCoefficient)
      : V.C(this.data.skewCoefficient);

    if (optimizeIntrinsics) {
      variables.push(focalLength, aspectRatio, principalPointX, principalPointY, skew);
    }

    // Distortion (constants by default)
    const k1 = optimizeDistortion ? V.W(this.data.radialDistortion[0]) : V.C(this.data.radialDistortion[0]);
    const k2 = optimizeDistortion ? V.W(this.data.radialDistortion[1]) : V.C(this.data.radialDistortion[1]);
    const k3 = optimizeDistortion ? V.W(this.data.radialDistortion[2]) : V.C(this.data.radialDistortion[2]);
    const p1 = optimizeDistortion ? V.W(this.data.tangentialDistortion[0]) : V.C(this.data.tangentialDistortion[0]);
    const p2 = optimizeDistortion ? V.W(this.data.tangentialDistortion[1]) : V.C(this.data.tangentialDistortion[1]);

    if (optimizeDistortion) {
      variables.push(k1, k2, k3, p1, p2);
    }

    // Build CameraValues and add to map
    const cameraValues: CameraValues = {
      position,
      rotation,
      focalLength,
      aspectRatio,
      principalPointX,
      principalPointY,
      skew,
      k1,
      k2,
      k3,
      p1,
      p2,
    };

    valueMap.cameras.set(this, cameraValues);

    return variables;
  }

  /**
   * Compute residuals for camera.
   * Enforces quaternion normalization constraint: |q|² = 1
   * Other constraints (reprojection error) come from ProjectionConstraint.
   *
   * @param valueMap - The ValueMap containing camera values
   * @returns Array of residuals (quaternion normalization)
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const cameraValues = valueMap.cameras.get(this);
    if (!cameraValues) {
      return [];
    }

    // Enforce unit quaternion: |q|² = 1
    const qNormResidual = quaternionNormalizationResidual(cameraValues.rotation);

    return [qNormResidual];
  }

  /**
   * Apply optimization results from ValueMap.
   * Extracts solved camera parameters and marks them as optimized.
   *
   * @param valueMap - The ValueMap with solved values
   */
  applyOptimizationResultFromValueMap(valueMap: ValueMap): void {
    const cameraValues = valueMap.cameras.get(this);
    if (!cameraValues) {
      return;
    }

    // Extract position
    this.data.position = [
      cameraValues.position.x.data,
      cameraValues.position.y.data,
      cameraValues.position.z.data,
    ];

    // Extract rotation (quaternion)
    this.data.rotation = [
      cameraValues.rotation.w.data,
      cameraValues.rotation.x.data,
      cameraValues.rotation.y.data,
      cameraValues.rotation.z.data,
    ];

    // Extract intrinsics (in case they were optimized)
    this.data.focalLength = cameraValues.focalLength.data;
    this.data.aspectRatio = cameraValues.aspectRatio.data;
    this.data.principalPointX = cameraValues.principalPointX.data;
    this.data.principalPointY = cameraValues.principalPointY.data;
    this.data.skewCoefficient = cameraValues.skew.data;

    // Extract distortion (in case it was optimized)
    this.data.radialDistortion = [
      cameraValues.k1.data,
      cameraValues.k2.data,
      cameraValues.k3.data,
    ];
    this.data.tangentialDistortion = [
      cameraValues.p1.data,
      cameraValues.p2.data,
    ];

    // Compute and store residuals from intrinsic constraints
    const residuals = this.computeResiduals(valueMap);
    this.lastResiduals = residuals.map(r => r.data);

    // Mark pose as optimized
    this.poseProvenance = {
      source: 'optimized',
      timestamp: new Date(),
    };

    this.updateTimestamp();
  }

  /**
   * Get the last computed residuals from intrinsic constraints.
   * These are stored after each optimization run.
   *
   * @returns Array of residual values (should be near zero if well-optimized)
   */
  getLastResiduals(): number[] {
    return [...this.lastResiduals];
  }
}