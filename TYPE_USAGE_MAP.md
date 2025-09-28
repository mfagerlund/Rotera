# Type Usage Mapping - Current State

This document maps current types to their usage locations to help with safe refactoring.

## Key Types to Replace

### 1. `Constraint` Type Usage
### Constraint Type Usage:
src\services\export.ts:3:import { Project, WorldPoint, Constraint, Camera } from '../types/project'
src\services\export.ts:10:  includeConstraints: boolean
src\services\export.ts:74:    if (options.includeConstraints) {
src\services\export.ts:107:    if (options.includeConstraints) {
src\services\export.ts:108:      headers.push('ConstraintCount', 'ConstraintTypes')
src\services\export.ts:127:      if (options.includeConstraints) {
src\services\export.ts:128:        const constraintsForPoint = this.getConstraintsForPoint(wp.id)
src\services\export.ts:331:    if (options.includeConstraints && this.project.constraints) {
src\services\export.ts:382:  private getConstraintsForPoint(pointId: string): Constraint[] {
src\services\export.ts:386:      const pointIds = this.getConstraintPointIds(constraint)
src\services\export.ts:391:  private getConstraintPointIds(constraint: Constraint): string[] {
src\services\export.ts:448:- Constraints: ${stats.constraintCount}
src\services\export.ts:457:- Include Constraints: ${options.includeConstraints}
src\services\export.ts:492:  includeConstraints: true,
src\constants\visualLanguage.ts:3:import { EntityColor, ConstraintGlyph, ConstraintStatus } from '../types/project'
src\constants\visualLanguage.ts:16:// Constraint glyphs for visual feedback
src\constants\visualLanguage.ts:56:    showConstraintGlyphs: false,
src\constants\visualLanguage.ts:62:    showConstraintGlyphs: true,
src\constants\visualLanguage.ts:68:    showConstraintGlyphs: true,
src\constants\visualLanguage.ts:105:export function getConstraintStatusColor(status: ConstraintStatus): string {
src\constants\visualLanguage.ts:109:export function getEntityColorForStatus(status: ConstraintStatus): string {
src\constants\visualLanguage.ts:134:// Constraint type to glyph mapping
src\constants\visualLanguage.ts:135:export function getConstraintGlyph(constraintType: string): string {
src\constants\visualLanguage.ts:190:  getConstraintStatusColor,
src\constants\visualLanguage.ts:196:  getConstraintGlyph
src\hooks\useEnhancedConstraints.ts:5:  EnhancedConstraint,
src\hooks\useEnhancedConstraints.ts:6:  ConstraintType,
src\hooks\useEnhancedConstraints.ts:7:  ConstraintTypeDefinition,
src\hooks\useEnhancedConstraints.ts:8:  ConstraintStatus,
src\hooks\useEnhancedConstraints.ts:9:  ConstraintParameter

### WorldPoint Type Usage:
src\entities\world-point.ts:1:// WorldPoint entity with DTO and domain class co-located
src\entities\world-point.ts:9:export interface WorldPointDto {
src\entities\world-point.ts:24:export interface WorldPointRepository {
src\entities\world-point.ts:31:export class WorldPoint implements ISelectable, IValidatable {
src\entities\world-point.ts:35:    private repo: WorldPointRepository,
src\entities\world-point.ts:36:    private data: WorldPointDto
src\entities\world-point.ts:40:  static fromDTO(dto: WorldPointDto, repo: WorldPointRepository): WorldPoint {
src\entities\world-point.ts:42:    const validation = WorldPoint.validateDto(dto)
src\entities\world-point.ts:44:      throw new Error(`Invalid WorldPoint DTO: ${validation.errors.map(e => e.message).join(', ')}`)
src\entities\world-point.ts:46:    return new WorldPoint(repo, { ...dto })
src\entities\world-point.ts:52:    repo: WorldPointRepository,
src\entities\world-point.ts:62:  ): WorldPoint {
src\entities\world-point.ts:64:    const dto: WorldPointDto = {
src\entities\world-point.ts:77:    return new WorldPoint(repo, dto)
src\entities\world-point.ts:81:  toDTO(): WorldPointDto {
src\entities\world-point.ts:223:  private static validateDto(dto: WorldPointDto): ValidationResult {
src\entities\world-point.ts:332:  distanceTo(other: WorldPoint): number | null {
src\entities\world-point.ts:347:  clone(newId: PointId, newName?: string): WorldPoint {
src\entities\world-point.ts:348:    const clonedData: WorldPointDto = {
src\entities\world-point.ts:355:    return new WorldPoint(this.repo, clonedData)
src\components\BatchOperationsPanel.tsx:4:import { Project, WorldPoint, Constraint } from '../types/project'
src\services\projectTemplates.ts:2:import { Project, Constraint, WorldPoint, ProjectImage } from '../types/project'
src\services\export.ts:3:import { Project, WorldPoint, Constraint, Camera } from '../types/project'
src\services\export.ts:70:      worldPoints: this.getFormattedWorldPoints(options),
src\services\export.ts:104:    const worldPoints = this.getFormattedWorldPoints(options)
src\services\export.ts:165:    const worldPoints = this.getFormattedWorldPoints(options)
src\services\export.ts:199:    const worldPoints = this.getFormattedWorldPoints(options)
src\services\export.ts:232:    const worldPoints = this.getFormattedWorldPoints(options)
src\services\export.ts:299:    const worldPoints = this.getFormattedWorldPoints(options)
src\services\export.ts:360:  private getFormattedWorldPoints(options: ExportOptions): Record<string, WorldPoint> {
src\services\validation.ts:3:import { WorldPoint, Constraint } from '../types/project'
src\services\validation.ts:44:  private worldPoints: Record<string, WorldPoint>
src\services\validation.ts:48:  constructor(worldPoints: Record<string, WorldPoint>, constraints: Constraint[], tolerance: number = 1e-6) {
src\types\project.ts:3:export interface WorldPoint {
src\types\project.ts:72:    points?: string[]   // WorldPoint IDs
src\types\project.ts:167:  worldPoints: Record<string, WorldPoint>
src\types\project.ts:241:  selectedPoints: string[]      // WorldPoint IDs
src\types\project.ts:284:  worldPoints: WorldPoint[]
src\components\ConstraintTemplatesPanel.tsx:4:import { Project, WorldPoint, Constraint } from '../types/project'
src\components\CoordinateSystemPanel.tsx:4:import { WorldPoint, Project } from '../types/project'
src\components\CoordinateSystemPanel.tsx:8:  worldPoints: Record<string, WorldPoint>
src\hooks\useProject.ts:4:import { Project, WorldPoint, ProjectImage, Camera, Constraint, Line } from '../types/project'
src\hooks\useProject.ts:61:  const createWorldPoint = useCallback((imageId: string, u: number, v: number): WorldPoint | null => {
src\hooks\useProject.ts:67:    const worldPoint: WorldPoint = {
src\hooks\useProject.ts:93:  const addImagePointToWorldPoint = useCallback((worldPointId: string, imageId: string, u: number, v: number) => {
src\hooks\useProject.ts:124:  const renameWorldPoint = useCallback((id: string, newName: string) => {
src\hooks\useProject.ts:139:  const deleteWorldPoint = useCallback((id: string) => {
src\hooks\useProject.ts:141:      const { [id]: deleted, ...remainingWorldPoints } = prev.worldPoints
src\hooks\useProject.ts:150:        worldPoints: remainingWorldPoints,
src\hooks\useProject.ts:202:      const updatedWorldPoints = { ...prev.worldPoints }
src\hooks\useProject.ts:203:      Object.values(updatedWorldPoints).forEach(wp => {
src\hooks\useProject.ts:208:      Object.entries(updatedWorldPoints).forEach(([wpId, wp]) => {
src\hooks\useProject.ts:210:          delete updatedWorldPoints[wpId]
src\hooks\useProject.ts:222:        worldPoints: updatedWorldPoints
src\hooks\useProject.ts:407:    createWorldPoint,
src\hooks\useProject.ts:408:    addImagePointToWorldPoint,
src\hooks\useProject.ts:409:    renameWorldPoint,
src\hooks\useProject.ts:410:    deleteWorldPoint,
src\components\ConstraintEditor.tsx:4:import { Constraint, WorldPoint } from '../types/project'
src\components\ConstraintEditor.tsx:8:  worldPoints: Record<string, WorldPoint>
src\hooks\useImageViewport.tsx:4:import { WorldPoint, ProjectImage } from '../types/project'
src\hooks\useImageViewport.tsx:65:    worldPoints: Record<string, WorldPoint>
src\hooks\useImageViewport.tsx:113:  const zoomToFitAll = useCallback((worldPoints: Record<string, WorldPoint>) => {
src\components\ConstraintGlyphs.tsx:4:import { Constraint, WorldPoint, ProjectImage } from '../types/project'
src\components\ConstraintGlyphs.tsx:9:  worldPoints: Record<string, WorldPoint>
src\tests\testUtils.tsx:4:import { Project, WorldPoint, Constraint, ProjectImage } from '../types/project'
src\tests\testUtils.tsx:99:export const mockWorldPoint: WorldPoint = {
src\components\GroundPlanePanel.tsx:4:import { Project, WorldPoint } from '../types/project'
src\components\ImageViewer.tsx:4:import { ProjectImage, WorldPoint } from '../types/project'
src\components\ImageViewer.tsx:30:  worldPoints: Record<string, WorldPoint>
src\components\ImageViewer.tsx:290:      renderWorldPoints(ctx)
src\components\ImageViewer.tsx:316:  const renderWorldPoints = (ctx: CanvasRenderingContext2D) => {
src\components\ImageNavigationToolbar.tsx:4:import { ProjectImage, WorldPoint } from '../types/project'
src\components\ImageNavigationToolbar.tsx:10:  worldPoints: Record<string, WorldPoint>
src\components\ImageNavigationToolbar.tsx:11:  selectedWorldPointIds: string[]
src\components\ImageNavigationToolbar.tsx:25:  selectedWorldPointIds,
src\components\ImageNavigationToolbar.tsx:67:  const getSelectedWorldPointsInImage = (imageId: string): number => {
src\components\ImageNavigationToolbar.tsx:68:    return selectedWorldPointIds.filter(wpId => {
src\components\ImageNavigationToolbar.tsx:103:              selectedWorldPointIds={selectedWorldPointIds}
src\components\ImageNavigationToolbar.tsx:107:              selectedWorldPointCount={getSelectedWorldPointsInImage(image.id)}
src\components\ImageNavigationToolbar.tsx:132:  worldPoints: Record<string, WorldPoint>
src\components\ImageNavigationToolbar.tsx:133:  selectedWorldPointIds: string[]
src\components\ImageNavigationToolbar.tsx:137:  selectedWorldPointCount: number
src\components\ImageNavigationToolbar.tsx:146:  selectedWorldPointIds,
src\components\ImageNavigationToolbar.tsx:150:  selectedWorldPointCount,
src\components\ImageNavigationToolbar.tsx:186:        {selectedWorldPointCount > 0 && (
src\components\ImageNavigationToolbar.tsx:188:            <span className="selected-wp-count">{selectedWorldPointCount}</span>
src\components\ImageNavigationToolbar.tsx:207:              const isSelected = selectedWorldPointIds.includes(wp.id)
src\components\MainLayout.tsx:19:import WorldPointPanel from './WorldPointPanel'
src\components\MainLayout.tsx:74:    createWorldPoint,
src\components\MainLayout.tsx:75:    renameWorldPoint,
src\components\MainLayout.tsx:76:    deleteWorldPoint,
src\components\MainLayout.tsx:77:    addImagePointToWorldPoint,
src\components\MainLayout.tsx:287:      addImagePointToWorldPoint(placementMode.worldPointId, currentImage.id, u, v)
src\components\MainLayout.tsx:291:      createWorldPoint(currentImage.id, u, v)
src\components\MainLayout.tsx:300:      addImagePointToWorldPoint(worldPointId, currentImage.id, u, v)
src\components\MainLayout.tsx:554:                selectedWorldPointIds={selectedPoints}
src\components\MainLayout.tsx:663:              <WorldPointPanel
src\components\MainLayout.tsx:666:                selectedWorldPointIds={selectedPoints}
src\components\MainLayout.tsx:669:                onSelectWorldPoint={(pointId: string, ctrlKey: boolean, shiftKey: boolean) =>
src\components\MainLayout.tsx:672:                onHighlightWorldPoint={() => {}}
src\components\MainLayout.tsx:673:                onRenameWorldPoint={renameWorldPoint}
src\components\MainLayout.tsx:674:                onDeleteWorldPoint={deleteWorldPoint}
src\components\MeasurementTools.tsx:4:import { WorldPoint, ProjectImage, Constraint } from '../types/project'
src\components\MeasurementTools.tsx:19:  worldPoints: Record<string, WorldPoint>
src\components\MeasurementTools.tsx:53:  const calculateDistance = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {
src\components\MeasurementTools.tsx:64:  const calculateAngle = useCallback((pointA: WorldPoint, vertex: WorldPoint, pointC: WorldPoint): number => {
src\components\MeasurementTools.tsx:93:  const calculateArea = useCallback((points: WorldPoint[]): number => {
src\components\MeasurementTools.tsx:111:  const calculatePerimeter = useCallback((points: WorldPoint[]): number => {
src\components\OptimizationPanel.tsx:4:import { Project, WorldPoint, Constraint } from '../types/project'
src\components\PointGroupsPanel.tsx:4:import { Project, WorldPoint } from '../types/project'
src\components\PointMergeDialog.tsx:4:import { Project, WorldPoint, Constraint } from '../types/project'
src\components\PointMergeDialog.tsx:7:  sourcePoint: WorldPoint
src\components\PointMergeDialog.tsx:8:  targetPoint: WorldPoint
src\components\PointMergeDialog.tsx:49:  const calculateDistance = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {
src\components\PointMergeDialog.tsx:60:  const calculateMergeConfidence = useCallback((pointA: WorldPoint, pointB: WorldPoint, distance: number): number => {
src\components\PointMergeDialog.tsx:99:  const getSharedImages = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {
src\components\PointMergeDialog.tsx:187:  const getMergeReason = useCallback((pointA: WorldPoint, pointB: WorldPoint, distance: number, confidence: number): string => {
src\components\PointSearchFilter.tsx:4:import { WorldPoint, Constraint } from '../types/project'
src\components\PointSearchFilter.tsx:8:  worldPoints: Record<string, WorldPoint>
src\components\SymmetryConstraintsPanel.tsx:4:import { Project, WorldPoint, Constraint } from '../types/project'
src\components\ValidationPanel.tsx:4:import { Project, WorldPoint, Constraint } from '../types/project'
src\components\Viewer3D.tsx:4:import { WorldPoint, ProjectImage, Camera, PointCloud } from '../types/project'
src\components\Viewer3D.tsx:7:  worldPoints: Record<string, WorldPoint>
src\components\WorldPointPanel.tsx:4:import { WorldPoint, Constraint } from '../types/project'
src\components\WorldPointPanel.tsx:13:interface WorldPointPanelProps {
src\components\WorldPointPanel.tsx:14:  worldPoints: Record<string, WorldPoint>
src\components\WorldPointPanel.tsx:16:  selectedWorldPointIds: string[]
src\components\WorldPointPanel.tsx:19:  onSelectWorldPoint: (id: string, ctrlKey: boolean, shiftKey: boolean) => void
src\components\WorldPointPanel.tsx:20:  onRenameWorldPoint: (id: string, newName: string) => void
src\components\WorldPointPanel.tsx:21:  onDeleteWorldPoint: (id: string) => void
src\components\WorldPointPanel.tsx:22:  onHighlightWorldPoint: (id: string | null) => void
src\components\WorldPointPanel.tsx:27:export const WorldPointPanel: React.FC<WorldPointPanelProps> = ({
src\components\WorldPointPanel.tsx:30:  selectedWorldPointIds,
src\components\WorldPointPanel.tsx:33:  onSelectWorldPoint,
src\components\WorldPointPanel.tsx:34:  onRenameWorldPoint,
src\components\WorldPointPanel.tsx:35:  onDeleteWorldPoint,
src\components\WorldPointPanel.tsx:36:  onHighlightWorldPoint,
src\components\WorldPointPanel.tsx:47:  const prevWorldPointCount = React.useRef(Object.keys(worldPoints).length)
src\components\WorldPointPanel.tsx:51:    if (currentCount > prevWorldPointCount.current) {
src\components\WorldPointPanel.tsx:54:        !Object.keys(worldPoints).slice(0, prevWorldPointCount.current).includes(id)
src\components\WorldPointPanel.tsx:93:    prevWorldPointCount.current = currentCount
src\components\WorldPointPanel.tsx:97:  const getConstraintsForWorldPoint = (wpId: string): Constraint[] => {
src\components\WorldPointPanel.tsx:106:    const wpConstraints = getConstraintsForWorldPoint(wpId)
src\components\WorldPointPanel.tsx:113:  const startEditing = (wp: WorldPoint) => {
src\components\WorldPointPanel.tsx:120:      onRenameWorldPoint(editingId, editingName.trim())
src\components\WorldPointPanel.tsx:150:    const involvedConstraints = getConstraintsForWorldPoint(wpId)
src\components\WorldPointPanel.tsx:161:      onDeleteWorldPoint(wpId)
src\components\WorldPointPanel.tsx:179:  const isWorldPointMissingFromImage = (wp: WorldPoint): boolean => {
src\components\WorldPointPanel.tsx:185:  const presentWPs = Object.values(worldPoints).filter(wp => !isWorldPointMissingFromImage(wp))
src\components\WorldPointPanel.tsx:186:  const missingWPs = Object.values(worldPoints).filter(wp => isWorldPointMissingFromImage(wp))
src\components\WorldPointPanel.tsx:244:            const isSelected = selectedWorldPointIds.includes(wp.id)
src\components\WorldPointPanel.tsx:245:            const involvedConstraints = getConstraintsForWorldPoint(wp.id)
src\components\WorldPointPanel.tsx:248:            const isMissingFromImage = isWorldPointMissingFromImage(wp)
src\components\WorldPointPanel.tsx:254:              <EnhancedWorldPointItem
src\components\WorldPointPanel.tsx:267:                onSelect={(ctrlKey, shiftKey) => onSelectWorldPoint(wp.id, ctrlKey, shiftKey)}
src\components\WorldPointPanel.tsx:270:                onHighlight={onHighlightWorldPoint}
src\components\WorldPointPanel.tsx:296:interface EnhancedWorldPointItemProps {
src\components\WorldPointPanel.tsx:297:  worldPoint: WorldPoint
src\components\WorldPointPanel.tsx:319:const EnhancedWorldPointItem: React.FC<EnhancedWorldPointItemProps> = ({
src\components\WorldPointPanel.tsx:545:export default WorldPointPanel
src\components\WorldView.tsx:3:import { WorldPoint, Line, Plane, Project, ConstraintStatus } from '../types/project'
src\components\WorldView.tsx:105:  const renderWorldPoints = useCallback((ctx: CanvasRenderingContext2D) => {
src\components\WorldView.tsx:306:    renderWorldPoints(ctx)
src\components\WorldView.tsx:307:  }, [renderAxes, renderPlanes, renderLines, renderWorldPoints])

### Project Type Usage:
src\components\BatchOperationsPanel.tsx:4:import { Project, WorldPoint, Constraint } from '../types/project'
src\components\BatchOperationsPanel.tsx:31:  project: Project
src\services\export.ts:3:import { Project, WorldPoint, Constraint, Camera } from '../types/project'
src\services\export.ts:26:  private project: Project
src\services\export.ts:28:  constructor(project: Project) {
src\services\export.ts:87:        statistics: this.getProjectStatistics()
src\services\export.ts:203:# Project: ${this.project.name}
src\services\export.ts:416:  private getProjectStatistics() {
src\services\export.ts:433:    const stats = this.getProjectStatistics()
src\services\export.ts:435:    return `Pictorigo Project Report
src\services\export.ts:438:Project: ${this.project.name}
src\services\optimization.ts:177:  // Project management
src\services\optimization.ts:178:  async createProject(): Promise<string> {
src\services\optimization.ts:195:  async updateProject(projectId: string, project: any): Promise<void> {
src\services\optimization.ts:231:      const projectId = await this.createProject()
src\services\optimization.ts:234:      await this.updateProject(projectId, project)
src\validation\validator.ts:48:  static validateProject(entities: IValidatable[], context: ValidationContext): ValidationResult {
src\validation\validator.ts:60:    const projectValidation = this.validateProjectIntegrity(context)
src\validation\validator.ts:75:  private static validateProjectIntegrity(context: ValidationContext): ValidationResult {
src\validation\validator.ts:213:      return 'Project validation passed successfully'
