import type { ProjectDto } from '../project/ProjectDto'
import { CURRENT_FORMAT_VERSION } from '../project/ProjectDto'
import type { LineDto } from '../line/LineDto'

// Old direction type from v0
type V0LineDirection = 'free' | 'horizontal' | 'vertical' | 'x-aligned' | 'z-aligned'

/**
 * Migrate a ProjectDto from any older version to the current version.
 * Migrations are applied sequentially from the source version to the current version.
 */
export function migrateProject(dto: ProjectDto): ProjectDto {
  const sourceVersion = dto.formatVersion ?? 0

  if (sourceVersion === CURRENT_FORMAT_VERSION) {
    return dto
  }

  if (sourceVersion > CURRENT_FORMAT_VERSION) {
    throw new Error(
      `Project format version ${sourceVersion} is newer than supported version ${CURRENT_FORMAT_VERSION}. ` +
      `Please update your application.`
    )
  }

  let migrated = dto

  // Apply migrations sequentially
  if (sourceVersion < 1) {
    migrated = migrateV0ToV1(migrated)
  }

  return migrated
}

/**
 * Migrate from v0 to v1:
 * - Convert line directions from old naming to new axis-based naming
 *   - 'horizontal' -> 'xz' (lies in XZ plane, Y=0)
 *   - 'vertical' -> 'y' (parallel to Y axis)
 *   - 'x-aligned' -> 'x' (parallel to X axis)
 *   - 'z-aligned' -> 'z' (parallel to Z axis)
 *   - 'free' -> 'free' (unchanged)
 */
function migrateV0ToV1(dto: ProjectDto): ProjectDto {
  console.log('[Migration] Migrating project from v0 to v1 (line direction naming)')

  const migratedLines = dto.lines.map(line => {
    const oldDirection = line.direction as V0LineDirection
    let newDirection: string

    switch (oldDirection) {
      case 'horizontal':
        newDirection = 'xz'
        break
      case 'vertical':
        newDirection = 'y'
        break
      case 'x-aligned':
        newDirection = 'x'
        break
      case 'z-aligned':
        newDirection = 'z'
        break
      case 'free':
      default:
        newDirection = 'free'
        break
    }

    if (oldDirection !== newDirection) {
      console.log(`[Migration] Line "${line.name}": direction '${oldDirection}' -> '${newDirection}'`)
    }

    return {
      ...line,
      direction: newDirection
    } as LineDto
  })

  return {
    ...dto,
    formatVersion: 1,
    lines: migratedLines
  }
}
