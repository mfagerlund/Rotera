import type {WorldPoint} from '../world-point'
import type {Line} from '../line'
import type {Viewpoint} from '../viewpoint'
import type {ImagePoint} from '../imagePoint'
import type {Constraint} from '../constraints'
import { CoplanarPointsConstraint } from '../constraints/coplanar-points-constraint'
import {makeAutoObservable} from 'mobx'
import { propagateCoordinateInferences, type InferenceConflict } from '../world-point/coordinate-inference'
import { ViewSettings, DEFAULT_VIEW_SETTINGS } from '../../types/visibility'

export type MeasurementUnits = 'meters' | 'feet' | 'inches'
export type Theme = 'dark' | 'light'
export type WorkspaceType = 'image' | 'world'
export type VisualFeedbackLevel = 'minimal' | 'standard' | 'detailed'
export type ImageSortOrder = string[]

export type ProjectSettings = Pick<Project,
    'showPointNames' |
    'autoSave' |
    'theme' |
    'measurementUnits' |
    'precisionDigits' |
    'showConstraintGlyphs' |
    'showMeasurements' |
    'autoOptimize' |
    'gridVisible' |
    'snapToGrid' |
    'defaultWorkspace' |
    'showConstructionGeometry' |
    'enableSmartSnapping' |
    'constraintPreview' |
    'visualFeedbackLevel' |
    'imageSortOrder' |
    'viewSettings'
>

export class Project {
    name: string
    worldPoints: Set<WorldPoint>
    lines: Set<Line>
    viewpoints: Set<Viewpoint>
    imagePoints: Set<ImagePoint>
    constraints: Set<Constraint>
    inferenceConflicts: InferenceConflict[] = []

    showPointNames: boolean
    autoSave: boolean
    theme: Theme
    measurementUnits: MeasurementUnits
    precisionDigits: number
    showConstraintGlyphs: boolean
    showMeasurements: boolean
    autoOptimize: boolean
    gridVisible: boolean
    snapToGrid: boolean
    defaultWorkspace: WorkspaceType
    showConstructionGeometry: boolean
    enableSmartSnapping: boolean
    constraintPreview: boolean
    visualFeedbackLevel: VisualFeedbackLevel
    imageSortOrder?: ImageSortOrder
    viewSettings: ViewSettings

    private constructor(
        name: string,
        worldPoints: Set<WorldPoint>,
        lines: Set<Line>,
        viewpoints: Set<Viewpoint>,
        imagePoints: Set<ImagePoint>,
        constraints: Set<Constraint>,
        showPointNames: boolean,
        autoSave: boolean,
        theme: Theme,
        measurementUnits: MeasurementUnits,
        precisionDigits: number,
        showConstraintGlyphs: boolean,
        showMeasurements: boolean,
        autoOptimize: boolean,
        gridVisible: boolean,
        snapToGrid: boolean,
        defaultWorkspace: WorkspaceType,
        showConstructionGeometry: boolean,
        enableSmartSnapping: boolean,
        constraintPreview: boolean,
        visualFeedbackLevel: VisualFeedbackLevel,
        viewSettings: ViewSettings,
        imageSortOrder?: ImageSortOrder
    ) {
        this.name = name
        this.worldPoints = worldPoints
        this.lines = lines
        this.viewpoints = viewpoints
        this.imagePoints = imagePoints
        this.constraints = constraints
        this.showPointNames = showPointNames
        this.autoSave = autoSave
        this.theme = theme
        this.measurementUnits = measurementUnits
        this.precisionDigits = precisionDigits
        this.showConstraintGlyphs = showConstraintGlyphs
        this.showMeasurements = showMeasurements
        this.autoOptimize = autoOptimize
        this.gridVisible = gridVisible
        this.snapToGrid = snapToGrid
        this.defaultWorkspace = defaultWorkspace
        this.showConstructionGeometry = showConstructionGeometry
        this.enableSmartSnapping = enableSmartSnapping
        this.constraintPreview = constraintPreview
        this.visualFeedbackLevel = visualFeedbackLevel
        this.viewSettings = viewSettings
        this.imageSortOrder = imageSortOrder

        makeAutoObservable(this, {}, { autoBind: true })
    }

    static create(name: string): Project {
        const now = new Date().toISOString()
        return new Project(
            name,
            new Set<WorldPoint>(),
            new Set<Line>(),
            new Set<Viewpoint>(),
            new Set<ImagePoint>(),
            new Set<Constraint>(),
            true,
            true,
            'dark',
            'meters',
            3,
            true,
            true,
            false,
            true,
            false,
            'world',
            true,
            true,
            true,
            'standard',
            DEFAULT_VIEW_SETTINGS
        )
    }

    static createFull(
        name: string,
        worldPoints: Set<WorldPoint>,
        lines: Set<Line>,
        viewpoints: Set<Viewpoint>,
        imagePoints: Set<ImagePoint>,
        constraints: Set<Constraint>,
        showPointNames: boolean,
        autoSave: boolean,
        theme: Theme,
        measurementUnits: MeasurementUnits,
        precisionDigits: number,
        showConstraintGlyphs: boolean,
        showMeasurements: boolean,
        autoOptimize: boolean,
        gridVisible: boolean,
        snapToGrid: boolean,
        defaultWorkspace: WorkspaceType,
        showConstructionGeometry: boolean,
        enableSmartSnapping: boolean,
        constraintPreview: boolean,
        visualFeedbackLevel: VisualFeedbackLevel,
        viewSettings: ViewSettings,
        imageSortOrder?: ImageSortOrder
    ): Project {
        return new Project(
            name,
            worldPoints,
            lines,
            viewpoints,
            imagePoints,
            constraints,
            showPointNames,
            autoSave,
            theme,
            measurementUnits,
            precisionDigits,
            showConstraintGlyphs,
            showMeasurements,
            autoOptimize,
            gridVisible,
            snapToGrid,
            defaultWorkspace,
            showConstructionGeometry,
            enableSmartSnapping,
            constraintPreview,
            visualFeedbackLevel,
            viewSettings,
            imageSortOrder
        )
    }


    addWorldPoint(point: WorldPoint): void {
        this.worldPoints.add(point)
    }

    removeWorldPoint(point: WorldPoint): void {
        this.worldPoints.delete(point)
    }

    addLine(line: Line): void {
        this.lines.add(line)
    }

    removeLine(line: Line): void {
        this.lines.delete(line)
    }

    addViewpoint(viewpoint: Viewpoint): void {
        this.viewpoints.add(viewpoint)
    }

    removeViewpoint(viewpoint: Viewpoint): void {
        this.viewpoints.delete(viewpoint)
    }

    addImagePoint(imagePoint: ImagePoint): void {
        this.imagePoints.add(imagePoint)
    }

    removeImagePoint(imagePoint: ImagePoint): void {
        this.imagePoints.delete(imagePoint)
    }

    addConstraint(constraint: Constraint): void {
        this.constraints.add(constraint)
    }

    removeConstraint(constraint: Constraint): void {
        this.constraints.delete(constraint)
    }

    clear(): void {
        // Clear nested collections first (in case UI holds stale references)
        for (const viewpoint of this.viewpoints) {
            viewpoint.vanishingLines.clear()
            viewpoint.imagePoints.clear()
        }
        for (const worldPoint of this.worldPoints) {
            worldPoint.imagePoints.clear()
            worldPoint.connectedLines.clear()
            worldPoint.referencingConstraints.clear()
        }
        for (const line of this.lines) {
            line.referencingConstraints.clear()
        }
        // Then clear top-level collections
        this.worldPoints.clear()
        this.lines.clear()
        this.viewpoints.clear()
        this.imagePoints.clear()
        this.constraints.clear()
        this.inferenceConflicts = []
    }

    getStats() {
        return {
            worldPoints: this.worldPoints.size,
            lines: this.lines.size,
            viewpoints: this.viewpoints.size,
            imagePoints: this.imagePoints.size,
            constraints: this.constraints.size
        }
    }

    propagateInferences(): void {
        const result = propagateCoordinateInferences(this.worldPoints, this.lines)
        this.inferenceConflicts = result.conflicts
    }

    get coplanarConstraints(): CoplanarPointsConstraint[] {
        return Array.from(this.constraints).filter(
            (c): c is CoplanarPointsConstraint => c instanceof CoplanarPointsConstraint
        )
    }

    get nonCoplanarConstraints(): Constraint[] {
        return Array.from(this.constraints).filter(
            c => !(c instanceof CoplanarPointsConstraint)
        )
    }
}
