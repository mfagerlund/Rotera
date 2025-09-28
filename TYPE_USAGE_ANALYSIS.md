# TypeScript Type Usage Analysis

## Constraint Usage Locations

### GENERIC_USAGE

- **components/ConstraintEditor.tsx:10** - `onSave: (updates: Partial<Constraint>) => void`
- **components/ConstraintTemplatesPanel.tsx:12** - `constraints: Omit<Constraint, 'id'>[]`
- **components/ConstraintTemplatesPanel.tsx:30** - `const createConstraint = (constraintData: any): Omit<Constraint, 'id'> => ({`
- **components/SymmetryConstraintsPanel.tsx:13** - `export interface SymmetryConstraint extends Omit<Constraint, 'type'> {`
- **hooks/useConstraints.ts:10** - `onUpdateConstraint: (id: string, updates: Partial<Constraint>) => void,`
- **hooks/useProject.ts:241** - `const updateConstraint = useCallback((id: string, updates: Partial<Constraint>) => {`
- **services/projectTemplates.ts:5** - `const createConstraint = (base: any): Omit<Constraint, "id" | "enabled"> => ({`
- **services/projectTemplates.ts:34** - `defaultConstraints: Omit<Constraint, 'id' | 'enabled'>[]`

### IMPORT

- **components/BatchOperationsPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/ConstraintEditor.tsx:4** - `import { Constraint, WorldPoint } from '../types/project'`
- **components/ConstraintGlyphs.tsx:4** - `import { Constraint, WorldPoint, ProjectImage } from '../types/project'`
- **components/ConstraintTemplatesPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/MeasurementTools.tsx:4** - `import { WorldPoint, ProjectImage, Constraint } from '../types/project'`
- **components/OptimizationPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/PointMergeDialog.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/PointSearchFilter.tsx:4** - `import { WorldPoint, Constraint } from '../types/project'`
- **components/SymmetryConstraintsPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/ValidationPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/WorldPointPanel.tsx:4** - `import { WorldPoint, Constraint } from '../types/project'`
- **hooks/useConstraints.ts:4** - `import { Constraint, ConstraintType, AvailableConstraint, Line } from '../types/project'`
- **hooks/useProject.ts:4** - `import { Project, WorldPoint, ProjectImage, Camera, Constraint, Line } from '../types/project'`
- **services/export.ts:3** - `import { Project, WorldPoint, Constraint, Camera } from '../types/project'`
- **services/projectTemplates.ts:2** - `import { Project, Constraint, WorldPoint, ProjectImage } from '../types/project'`
- **services/validation.ts:3** - `import { WorldPoint, Constraint } from '../types/project'`
- **tests/testUtils.tsx:4** - `import { Project, WorldPoint, Constraint, ProjectImage } from '../types/project'`
- **types/utils.ts:3** - `import type { Constraint } from './project'`

### INHERITANCE

- **types/project.ts:356** - `export interface SymmetryConstraint extends Constraint {`

### TYPE_ANNOTATION

- **components/ConstraintEditor.tsx:7** - `constraint: Constraint | null`
- **components/ConstraintEditor.tsx:64** - `const getConstraintDisplayName = (c: Constraint) => {`
- **components/ConstraintGlyphs.tsx:10** - `constraints: Constraint[]`
- **components/ConstraintGlyphs.tsx:156** - `function getConstraintTooltip(constraint: Constraint): string {`
- **components/MeasurementTools.tsx:21** - `constraints: Constraint[]`
- **components/PointSearchFilter.tsx:9** - `constraints: Constraint[]`
- **components/WorldPointPanel.tsx:15** - `constraints: Constraint[]`
- **components/WorldPointPanel.tsx:97** - `const getConstraintsForWorldPoint = (wpId: string): Constraint[] => {`
- **components/WorldPointPanel.tsx:301** - `involvedConstraints: Constraint[]`
- **components/WorldPointPanel.tsx:502** - `function getConstraintDisplayName(constraint: Constraint): string {`
- **hooks/useConstraints.ts:8** - `constraints: Constraint[],`
- **hooks/useConstraints.ts:9** - `onAddConstraint: (constraint: Constraint) => void,`
- **hooks/useConstraints.ts:249** - `const constraint: Constraint = {`
- **hooks/useConstraints.ts:308** - `const getConstraintDisplayName = useCallback((constraint: Constraint) => {`
- **hooks/useConstraints.ts:331** - `const getConstraintSummary = useCallback((constraint: Constraint) => {`
- **hooks/useProject.ts:234** - `const addConstraint = useCallback((constraint: Constraint) => {`
- **services/export.ts:382** - `private getConstraintsForPoint(pointId: string): Constraint[] {`
- **services/export.ts:391** - `private getConstraintPointIds(constraint: Constraint): string[] {`
- **services/projectTemplates.ts:492** - `const constraints: Constraint[] = template.setup.defaultConstraints.map(constraint => ({`
- **services/validation.ts:45** - `private constraints: Constraint[]`
- **services/validation.ts:48** - `constructor(worldPoints: Record<string, WorldPoint>, constraints: Constraint[], tolerance: number = 1e-6) {`
- **services/validation.ts:80** - `private validateConstraint(constraint: Constraint): ValidationResult {`
- **tests/testUtils.tsx:108** - `export const mockConstraint: Constraint = {`
- **types/project.ts:172** - `constraints: Constraint[]`
- **types/project.ts:283** - `constraints: Constraint[]`
- **types/utils.ts:119** - `export function getConstraintPointIds(constraint: Constraint): string[] {`

### USAGE

- **components/ConstraintGlyphs.tsx:10** - `constraints: Constraint[]`
- **components/ConstraintGlyphs.tsx:10** - `constraints: Constraint[]`
- **components/ConstraintGlyphs.tsx:28** - `const result: Record<string, Constraint[]> = {}`
- **components/ConstraintGlyphs.tsx:28** - `const result: Record<string, Constraint[]> = {}`
- **components/ConstraintTimeline.tsx:9** - `constraints: EnhancedConstraint[]`
- **components/ConstraintTimeline.tsx:86** - `}, {} as Record<string, EnhancedConstraint[]>)`
- **components/ConstraintTimeline.tsx:164** - `const renderCategory = (category: string, categoryConstraints: EnhancedConstraint[]) => {`
- **components/ConstraintTimeline.tsx:244** - `function getStatusCounts(constraints: EnhancedConstraint[]): Record<string, number> {`
- **components/ConstraintToolbar.tsx:9** - `availableConstraints: AvailableConstraint[]`
- **components/MainLayout.tsx:117** - `const enhancedConstraints: EnhancedConstraint[] = constraints.map(constraint => ({`
- **components/MeasurementTools.tsx:21** - `constraints: Constraint[]`
- **components/MeasurementTools.tsx:21** - `constraints: Constraint[]`
- **components/PointSearchFilter.tsx:9** - `constraints: Constraint[]`
- **components/PointSearchFilter.tsx:9** - `constraints: Constraint[]`
- **components/WorldPointPanel.tsx:15** - `constraints: Constraint[]`
- **components/WorldPointPanel.tsx:15** - `constraints: Constraint[]`
- **components/WorldPointPanel.tsx:97** - `const getConstraintsForWorldPoint = (wpId: string): Constraint[] => {`
- **components/WorldPointPanel.tsx:97** - `const getConstraintsForWorldPoint = (wpId: string): Constraint[] => {`
- **components/WorldPointPanel.tsx:301** - `involvedConstraints: Constraint[]`
- **components/WorldPointPanel.tsx:301** - `involvedConstraints: Constraint[]`
- **hooks/useConstraints.ts:8** - `constraints: Constraint[],`
- **hooks/useConstraints.ts:8** - `constraints: Constraint[],`
- **hooks/useConstraints.ts:19** - `const getAllConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {`
- **hooks/useConstraints.ts:94** - `const getAvailableConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {`
- **hooks/useConstraints.ts:95** - `const constraints: AvailableConstraint[] = []`
- **hooks/useEnhancedConstraints.ts:238** - `constraints: EnhancedConstraint[],`
- **hooks/useEnhancedConstraints.ts:425** - `const getConstraintsForEntity = useCallback((entityId: string): EnhancedConstraint[] => {`
- **hooks/useEnhancedConstraints.ts:481** - `const grouped: Record<string, EnhancedConstraint[]> = {}`
- **hooks/useEntityManager.ts:26** - `constraints: EnhancedConstraint[] = []`
- **hooks/useEntityManager.ts:392** - `const getConstraintsForEntity = useCallback((id: string): EnhancedConstraint[] => {`
- **services/export.ts:382** - `private getConstraintsForPoint(pointId: string): Constraint[] {`
- **services/export.ts:382** - `private getConstraintsForPoint(pointId: string): Constraint[] {`
- **services/projectTemplates.ts:492** - `const constraints: Constraint[] = template.setup.defaultConstraints.map(constraint => ({`
- **services/projectTemplates.ts:492** - `const constraints: Constraint[] = template.setup.defaultConstraints.map(constraint => ({`
- **services/validation.ts:45** - `private constraints: Constraint[]`
- **services/validation.ts:45** - `private constraints: Constraint[]`
- **services/validation.ts:48** - `constructor(worldPoints: Record<string, WorldPoint>, constraints: Constraint[], tolerance: number = 1e-6) {`
- **services/validation.ts:48** - `constructor(worldPoints: Record<string, WorldPoint>, constraints: Constraint[], tolerance: number = 1e-6) {`
- **types/enhanced-project.ts:210** - `constraintsBefore?: EnhancedConstraint[]`
- **types/enhanced-project.ts:211** - `constraintsAfter?: EnhancedConstraint[]`
- **types/enhanced-project.ts:231** - `constraints: EnhancedConstraint[]`
- **types/enhanced-project.ts:333** - `constraints: EnhancedConstraint[]`
- **types/entities.ts:77** - `getConstraintsForEntity: (id: string) => EnhancedConstraint[]`
- **types/project.ts:172** - `constraints: Constraint[]`
- **types/project.ts:172** - `constraints: Constraint[]`
- **types/project.ts:283** - `constraints: Constraint[]`
- **types/project.ts:283** - `constraints: Constraint[]`

## WorldPoint Usage Locations

### GENERIC

- **components/ConstraintEditor.tsx:8** - `worldPoints: Record<string, WorldPoint>`
- **components/ConstraintGlyphs.tsx:9** - `worldPoints: Record<string, WorldPoint>`
- **components/CoordinateSystemPanel.tsx:8** - `worldPoints: Record<string, WorldPoint>`
- **components/ImageNavigationToolbar.tsx:10** - `worldPoints: Record<string, WorldPoint>`
- **components/ImageNavigationToolbar.tsx:132** - `worldPoints: Record<string, WorldPoint>`
- **components/ImageViewer.tsx:30** - `worldPoints: Record<string, WorldPoint>`
- **components/MeasurementTools.tsx:19** - `worldPoints: Record<string, WorldPoint>`
- **components/PointSearchFilter.tsx:8** - `worldPoints: Record<string, WorldPoint>`
- **components/Viewer3D.tsx:7** - `worldPoints: Record<string, WorldPoint>`
- **components/WorldPointPanel.tsx:14** - `worldPoints: Record<string, WorldPoint>`
- **hooks/useImageViewport.tsx:65** - `worldPoints: Record<string, WorldPoint>`
- **hooks/useImageViewport.tsx:113** - `const zoomToFitAll = useCallback((worldPoints: Record<string, WorldPoint>) => {`
- **services/export.ts:360** - `private getFormattedWorldPoints(options: ExportOptions): Record<string, WorldPoint> {`
- **services/validation.ts:44** - `private worldPoints: Record<string, WorldPoint>`
- **services/validation.ts:48** - `constructor(worldPoints: Record<string, WorldPoint>, constraints: Constraint[], tolerance: number = 1e-6) {`
- **types/project.ts:167** - `worldPoints: Record<string, WorldPoint>`

### IMPORT

- **components/BatchOperationsPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/ConstraintEditor.tsx:4** - `import { Constraint, WorldPoint } from '../types/project'`
- **components/ConstraintGlyphs.tsx:4** - `import { Constraint, WorldPoint, ProjectImage } from '../types/project'`
- **components/ConstraintTemplatesPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/CoordinateSystemPanel.tsx:4** - `import { WorldPoint, Project } from '../types/project'`
- **components/GroundPlanePanel.tsx:4** - `import { Project, WorldPoint } from '../types/project'`
- **components/ImageNavigationToolbar.tsx:4** - `import { ProjectImage, WorldPoint } from '../types/project'`
- **components/ImageViewer.tsx:4** - `import { ProjectImage, WorldPoint } from '../types/project'`
- **components/MeasurementTools.tsx:4** - `import { WorldPoint, ProjectImage, Constraint } from '../types/project'`
- **components/OptimizationPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/PointGroupsPanel.tsx:4** - `import { Project, WorldPoint } from '../types/project'`
- **components/PointMergeDialog.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/PointSearchFilter.tsx:4** - `import { WorldPoint, Constraint } from '../types/project'`
- **components/SymmetryConstraintsPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/ValidationPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/Viewer3D.tsx:4** - `import { WorldPoint, ProjectImage, Camera, PointCloud } from '../types/project'`
- **components/WorldPointPanel.tsx:4** - `import { WorldPoint, Constraint } from '../types/project'`
- **components/WorldView.tsx:3** - `import { WorldPoint, Line, Plane, Project, ConstraintStatus } from '../types/project'`
- **hooks/useImageViewport.tsx:4** - `import { WorldPoint, ProjectImage } from '../types/project'`
- **hooks/useProject.ts:4** - `import { Project, WorldPoint, ProjectImage, Camera, Constraint, Line } from '../types/project'`
- **services/export.ts:3** - `import { Project, WorldPoint, Constraint, Camera } from '../types/project'`
- **services/projectTemplates.ts:2** - `import { Project, Constraint, WorldPoint, ProjectImage } from '../types/project'`
- **services/validation.ts:3** - `import { WorldPoint, Constraint } from '../types/project'`
- **tests/testUtils.tsx:4** - `import { Project, WorldPoint, Constraint, ProjectImage } from '../types/project'`

### TYPE_ANNOTATION

- **components/MeasurementTools.tsx:53** - `const calculateDistance = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {`
- **components/MeasurementTools.tsx:53** - `const calculateDistance = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {`
- **components/MeasurementTools.tsx:64** - `const calculateAngle = useCallback((pointA: WorldPoint, vertex: WorldPoint, pointC: WorldPoint): number => {`
- **components/MeasurementTools.tsx:64** - `const calculateAngle = useCallback((pointA: WorldPoint, vertex: WorldPoint, pointC: WorldPoint): number => {`
- **components/MeasurementTools.tsx:64** - `const calculateAngle = useCallback((pointA: WorldPoint, vertex: WorldPoint, pointC: WorldPoint): number => {`
- **components/MeasurementTools.tsx:93** - `const calculateArea = useCallback((points: WorldPoint[]): number => {`
- **components/MeasurementTools.tsx:111** - `const calculatePerimeter = useCallback((points: WorldPoint[]): number => {`
- **components/PointMergeDialog.tsx:7** - `sourcePoint: WorldPoint`
- **components/PointMergeDialog.tsx:8** - `targetPoint: WorldPoint`
- **components/PointMergeDialog.tsx:49** - `const calculateDistance = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {`
- **components/PointMergeDialog.tsx:49** - `const calculateDistance = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {`
- **components/PointMergeDialog.tsx:60** - `const calculateMergeConfidence = useCallback((pointA: WorldPoint, pointB: WorldPoint, distance: number): number => {`
- **components/PointMergeDialog.tsx:60** - `const calculateMergeConfidence = useCallback((pointA: WorldPoint, pointB: WorldPoint, distance: number): number => {`
- **components/PointMergeDialog.tsx:99** - `const getSharedImages = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {`
- **components/PointMergeDialog.tsx:99** - `const getSharedImages = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {`
- **components/PointMergeDialog.tsx:187** - `const getMergeReason = useCallback((pointA: WorldPoint, pointB: WorldPoint, distance: number, confidence: number): string => {`
- **components/PointMergeDialog.tsx:187** - `const getMergeReason = useCallback((pointA: WorldPoint, pointB: WorldPoint, distance: number, confidence: number): string => {`
- **components/WorldPointPanel.tsx:113** - `const startEditing = (wp: WorldPoint) => {`
- **components/WorldPointPanel.tsx:179** - `const isWorldPointMissingFromImage = (wp: WorldPoint): boolean => {`
- **components/WorldPointPanel.tsx:297** - `worldPoint: WorldPoint`
- **entities/world-point.ts:40** - `static fromDTO(dto: WorldPointDto, repo: WorldPointRepository): WorldPoint {`
- **entities/world-point.ts:62** - `): WorldPoint {`
- **entities/world-point.ts:332** - `distanceTo(other: WorldPoint): number | null {`
- **entities/world-point.ts:347** - `clone(newId: PointId, newName?: string): WorldPoint {`
- **hooks/useProject.ts:61** - `const createWorldPoint = useCallback((imageId: string, u: number, v: number): WorldPoint | null => {`
- **hooks/useProject.ts:67** - `const worldPoint: WorldPoint = {`
- **tests/testUtils.tsx:99** - `export const mockWorldPoint: WorldPoint = {`
- **types/project.ts:284** - `worldPoints: WorldPoint[]`

### USAGE

- **components/MeasurementTools.tsx:93** - `const calculateArea = useCallback((points: WorldPoint[]): number => {`
- **components/MeasurementTools.tsx:93** - `const calculateArea = useCallback((points: WorldPoint[]): number => {`
- **components/MeasurementTools.tsx:111** - `const calculatePerimeter = useCallback((points: WorldPoint[]): number => {`
- **components/MeasurementTools.tsx:111** - `const calculatePerimeter = useCallback((points: WorldPoint[]): number => {`
- **types/project.ts:284** - `worldPoints: WorldPoint[]`
- **types/project.ts:284** - `worldPoints: WorldPoint[]`

## Project Usage Locations

### GENERIC_USAGE

- **components/ProjectManager.tsx:28** - `const [project, setProject] = useState<Project | null>(null)`
- **hooks/useProject.ts:10** - `const [project, setProject] = useState<Project | null>(null)`
- **services/fileManager.ts:153** - `static async importProjectData(file: File): Promise<Project> {`
- **services/projectTemplates.ts:44** - `project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'nextWpNumber' | 'settings' | 'optimization' | 'history'>`
- **types/project.ts:351** - `optimize: (project: Project) => Promise<Project>`
- **types/project.ts:352** - `simulateOptimization: (project: Project) => Promise<Project>`

### IMPORT

- **components/BatchOperationsPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/CameraCalibrationPanel.tsx:4** - `import { Project, Camera, CameraIntrinsics, CameraExtrinsics } from '../types/project'`
- **components/ConstraintTemplatesPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/CoordinateSystemPanel.tsx:4** - `import { WorldPoint, Project } from '../types/project'`
- **components/ExportDialog.tsx:4** - `import { Project } from '../types/project'`
- **components/GroundPlanePanel.tsx:4** - `import { Project, WorldPoint } from '../types/project'`
- **components/OptimizationPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/PointGroupsPanel.tsx:4** - `import { Project, WorldPoint } from '../types/project'`
- **components/PointMergeDialog.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/ProjectFileDialog.tsx:3** - `import { Project } from '../types/project'`
- **components/ProjectFileDialog.tsx:176** - `case 'import': return 'Import Project Data'`
- **components/SymmetryConstraintsPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/ValidationPanel.tsx:4** - `import { Project, WorldPoint, Constraint } from '../types/project'`
- **components/WorldView.tsx:3** - `import { WorldPoint, Line, Plane, Project, ConstraintStatus } from '../types/project'`
- **hooks/useHistory.ts:4** - `import { Project, ProjectHistoryEntry } from '../types/project'`
- **hooks/useProject.ts:4** - `import { Project, WorldPoint, ProjectImage, Camera, Constraint, Line } from '../types/project'`
- **services/export.ts:3** - `import { Project, WorldPoint, Constraint, Camera } from '../types/project'`
- **services/fileManager.ts:2** - `import { Project } from '../types/project'`
- **services/fileManager.ts:153** - `static async importProjectData(file: File): Promise<Project> {`
- **services/projectTemplates.ts:2** - `import { Project, Constraint, WorldPoint, ProjectImage } from '../types/project'`
- **tests/testUtils.tsx:4** - `import { Project, WorldPoint, Constraint, ProjectImage } from '../types/project'`
- **utils/storage.ts:3** - `import { Project, ProjectSettings } from '../types/project'`

### TYPE_ANNOTATION

- **components/BatchOperationsPanel.tsx:31** - `project: Project`
- **components/CameraCalibrationPanel.tsx:23** - `project: Project`
- **components/ConstraintTemplatesPanel.tsx:20** - `project: Project`
- **components/CoordinateSystemPanel.tsx:7** - `project: Project`
- **components/ExportDialog.tsx:9** - `project: Project`
- **components/GroundPlanePanel.tsx:26** - `project: Project`
- **components/OptimizationPanel.tsx:9** - `project: Project`
- **components/OptimizationPanel.tsx:10** - `onProjectUpdate: (project: Project) => void`
- **components/PointGroupsPanel.tsx:18** - `project: Project`
- **components/PointMergeDialog.tsx:23** - `project: Project`
- **components/ProjectFileDialog.tsx:10** - `project: Project`
- **components/ProjectFileDialog.tsx:12** - `onProjectImport?: (project: Project) => void`
- **components/ProjectFileDialog.tsx:40** - `const [autoSaveData, setAutoSaveData] = useState<{ project: Project; savedAt: string } | null>(null)`
- **components/SymmetryConstraintsPanel.tsx:40** - `project: Project`
- **components/ValidationPanel.tsx:9** - `project: Project`
- **components/WorldView.tsx:6** - `project: Project`
- **hooks/useHistory.ts:10** - `project: Project,`
- **hooks/useHistory.ts:15** - `): Project => {`
- **hooks/useHistory.ts:44** - `const canUndo = useCallback((project: Project) => {`
- **hooks/useHistory.ts:48** - `const canRedo = useCallback((project: Project) => {`
- **hooks/useHistory.ts:52** - `const undo = useCallback((project: Project): Project | null => {`
- **hooks/useHistory.ts:52** - `const undo = useCallback((project: Project): Project | null => {`
- **hooks/useHistory.ts:70** - `const redo = useCallback((project: Project): Project | null => {`
- **hooks/useHistory.ts:70** - `const redo = useCallback((project: Project): Project | null => {`
- **hooks/useHistory.ts:88** - `const getCurrentEntry = useCallback((project: Project): ProjectHistoryEntry | null => {`
- **hooks/useHistory.ts:93** - `const getHistoryStats = useCallback((project: Project) => {`
- **hooks/useHistory.ts:103** - `const resetHistory = useCallback((project: Project): Project => {`
- **hooks/useHistory.ts:103** - `const resetHistory = useCallback((project: Project): Project => {`
- **hooks/useProject.ts:40** - `const saveProject = useCallback((updatedProject: Project) => {`
- **hooks/useProject.ts:51** - `const updateProject = useCallback((updater: (prev: Project) => Project) => {`
- **services/export.ts:26** - `private project: Project`
- **services/export.ts:28** - `constructor(project: Project) {`
- **services/fileManager.ts:17** - `project: Project`
- **services/fileManager.ts:27** - `project: Project,`
- **services/fileManager.ts:108** - `project: Project,`
- **services/fileManager.ts:185** - `project: Project,`
- **services/fileManager.ts:283** - `private static migrateProject(project: Project, fromVersion: string): Project {`
- **services/fileManager.ts:283** - `private static migrateProject(project: Project, fromVersion: string): Project {`
- **services/fileManager.ts:301** - `project: Project,`
- **services/fileManager.ts:326** - `static recoverAutoSavedProject(): { project: Project; savedAt: string } | null {`
- **services/projectTemplates.ts:487** - `static createProjectFromTemplate(template: ProjectTemplate, customName?: string): Project {`
- **tests/testUtils.tsx:7** - `export const mockProject: Project = {`
- **tests/testUtils.tsx:129** - `project?: Project`
- **types/project.ts:351** - `optimize: (project: Project) => Promise<Project>`
- **types/project.ts:352** - `simulateOptimization: (project: Project) => Promise<Project>`
- **utils/storage.ts:9** - `static save(project: Project): void {`
- **utils/storage.ts:29** - `static load(): Project | null {`
- **utils/storage.ts:105** - `static createEmptyProject(): Project {`
- **utils/storage.ts:128** - `static compressImages(project: Project): Project {`
- **utils/storage.ts:128** - `static compressImages(project: Project): Project {`
- **utils/storage.ts:134** - `static estimateProjectSize(project: Project): number {`

## Line Usage Locations

### GENERIC

- **types/entities.ts:8** - `lines: Record<string, Line>`
- **types/project.ts:168** - `lines: Record<string, Line>`

### GENERIC_USAGE

- **hooks/useProject.ts:355** - `const updateLine = useCallback((lineId: string, updates: Partial<Line>) => {`

### IMPORT

- **components/ConstraintPropertyPanel.tsx:4** - `import { Line } from '../types/project'`
- **components/ConstraintToolbar.tsx:4** - `import { AvailableConstraint, Line } from '../types/project'`
- **components/EditLineWindow.tsx:3** - `import { Line } from '../types/project'`
- **components/MainLayout.tsx:8** - `import { Line } from '../types/project'`
- **components/tools/LineCreationTool.tsx:4** - `import { Line } from '../../types/geometry'`
- **components/WorldView.tsx:3** - `import { WorldPoint, Line, Plane, Project, ConstraintStatus } from '../types/project'`
- **hooks/useConstraints.ts:4** - `import { Constraint, ConstraintType, AvailableConstraint, Line } from '../types/project'`
- **hooks/useLines.ts:4** - `import { Line } from '../types/geometry'`
- **hooks/useProject.ts:4** - `import { Project, WorldPoint, ProjectImage, Camera, Constraint, Line } from '../types/project'`
- **types/entities.ts:3** - `import { GeometricEntity, Point, Line, Plane, Circle, EnhancedConstraint } from './geometry'`

### TYPE_ANNOTATION

- **components/ConstraintPropertyPanel.tsx:9** - `selectedLines: Line[]`
- **components/ConstraintPropertyPanel.tsx:98** - `selectedLines: Line[]`
- **components/ConstraintToolbar.tsx:8** - `selectedLines: Line[]`
- **components/ConstraintToolbar.tsx:11** - `onConstraintClick: (type: string, selectedPoints: string[], selectedLines: Line[]) => void`
- **components/EditLineWindow.tsx:6** - `line: Line | null`
- **components/EditLineWindow.tsx:9** - `onSave: (updatedLine: Line) => void`
- **components/EditLineWindow.tsx:85** - `const updatedLine: Line = {`
- **components/EditLineWindow.tsx:124** - `console.log('🔥 EDIT LINE WINDOW: Line is null/undefined')`
- **components/MainLayout.tsx:239** - `const createLineFromData = (lineData: any, lineObj: any): Line => ({`
- **components/MainLayout.tsx:309** - `const handleEditLineSave = (updatedLine: Line) => {`
- **components/MainLayout.tsx:593** - `console.log('MainLayout: Line created successfully with ID:', lineId)`
- **hooks/useConstraints.ts:19** - `const getAllConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {`
- **hooks/useConstraints.ts:94** - `const getAvailableConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {`
- **hooks/useConstraints.ts:228** - `selectedLines: Line[]`
- **hooks/useConstraints.ts:392** - `selectedLines: Line[]`
- **hooks/useLines.ts:59** - `console.warn('useLines: Line already exists between these points:', existingLine.name)`
- **hooks/useProject.ts:320** - `console.warn('useProject: Line already exists between these points:', existingLine.name)`
- **hooks/useProject.ts:329** - `const newLine: Line = {`
- **types/project.ts:259** - `selectedLines: Line[]`

### USAGE

- **components/ConstraintPropertyPanel.tsx:9** - `selectedLines: Line[]`
- **components/ConstraintPropertyPanel.tsx:9** - `selectedLines: Line[]`
- **components/ConstraintPropertyPanel.tsx:98** - `selectedLines: Line[]`
- **components/ConstraintPropertyPanel.tsx:98** - `selectedLines: Line[]`
- **components/ConstraintToolbar.tsx:8** - `selectedLines: Line[]`
- **components/ConstraintToolbar.tsx:8** - `selectedLines: Line[]`
- **components/ConstraintToolbar.tsx:11** - `onConstraintClick: (type: string, selectedPoints: string[], selectedLines: Line[]) => void`
- **components/ConstraintToolbar.tsx:11** - `onConstraintClick: (type: string, selectedPoints: string[], selectedLines: Line[]) => void`
- **hooks/useConstraints.ts:19** - `const getAllConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {`
- **hooks/useConstraints.ts:19** - `const getAllConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {`
- **hooks/useConstraints.ts:94** - `const getAvailableConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {`
- **hooks/useConstraints.ts:94** - `const getAvailableConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {`
- **hooks/useConstraints.ts:228** - `selectedLines: Line[]`
- **hooks/useConstraints.ts:228** - `selectedLines: Line[]`
- **hooks/useConstraints.ts:392** - `selectedLines: Line[]`
- **hooks/useConstraints.ts:392** - `selectedLines: Line[]`
- **types/project.ts:259** - `selectedLines: Line[]`
- **types/project.ts:259** - `selectedLines: Line[]`

## Plane Usage Locations

### GENERIC

- **types/entities.ts:9** - `planes: Record<string, Plane>`
- **types/project.ts:169** - `planes: Record<string, Plane>`

### IMPORT

- **components/WorldView.tsx:3** - `import { WorldPoint, Line, Plane, Project, ConstraintStatus } from '../types/project'`
- **types/entities.ts:3** - `import { GeometricEntity, Point, Line, Plane, Circle, EnhancedConstraint } from './geometry'`

## Camera Usage Locations

### GENERIC

- **components/Viewer3D.tsx:9** - `cameras: Record<string, Camera>`
- **types/project.ts:171** - `cameras: Record<string, Camera>`

### GENERIC_USAGE

- **components/CameraCalibrationPanel.tsx:24** - `onCameraUpdate: (cameraId: string, updates: Partial<Camera>) => void`
- **components/CameraCalibrationPanel.tsx:198** - `const updates: Partial<Camera> = {}`

### IMPORT

- **components/CameraCalibrationPanel.tsx:4** - `import { Project, Camera, CameraIntrinsics, CameraExtrinsics } from '../types/project'`
- **components/Viewer3D.tsx:4** - `import { WorldPoint, ProjectImage, Camera, PointCloud } from '../types/project'`
- **hooks/useProject.ts:4** - `import { Project, WorldPoint, ProjectImage, Camera, Constraint, Line } from '../types/project'`
- **services/export.ts:3** - `import { Project, WorldPoint, Constraint, Camera } from '../types/project'`

### TYPE_ANNOTATION

- **components/CameraCalibrationPanel.tsx:79** - `const getCalibrationStatus = useCallback((camera: Camera) => {`
- **hooks/useProject.ts:161** - `const camera: Camera = {`

