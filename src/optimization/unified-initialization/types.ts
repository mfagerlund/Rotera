import type { Viewpoint } from '../../entities/viewpoint'

export interface InitializationOptions {
  sceneScale?: number
  verbose?: boolean
  initializedViewpoints?: Set<Viewpoint>
  /** Cameras initialized via Vanishing Points (accurate poses for ray-based sign determination) */
  vpInitializedViewpoints?: Set<Viewpoint>
  /** If true, don't pre-set locked points to their target positions (for Essential Matrix free solve) */
  skipLockedPoints?: boolean
}
