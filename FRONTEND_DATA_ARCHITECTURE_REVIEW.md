# TS JSON Architecture — Assessment & Recommendations

## Snapshot: how you’re doing

**Strong foundation, but the model mixes storage and runtime, duplicates type concepts, and keeps legacy hooks you don’t want. A small structural pivot will make JSON persistence clean and keep the frontend ergonomic.**

---

## Strengths

* **Clear domain concepts.** Points/lines/planes/circles and constraints are modeled explicitly with useful metadata and parameters.  
* **Entity collection + manager shape.** Centralized `EntityCollection` and `EntityManager` interfaces anticipate queries, selection, and stats. Good direction for a repository. 
* **Project-level scaffolding.** History, templates, export options, optimization state, settings: the surfaces you’ll need exist.   

---

## Weaknesses / Risks

* **Storage ↔ runtime coupling.** `EnhancedProject` includes runtime-only fields (`entityManager`, selection, workspace view state). These shouldn’t live in persisted JSON. 
* **Legacy hooks everywhere (you said: remove).**

  * `Constraint` carries many legacy properties; utils rely on them.  
  * Constraint unions keep legacy types; `ProjectMigration` exists.  
* **Duplication / drift risk.** Overlapping “project” shapes across `project.ts` and `enhanced-project.ts` (templates, history, export options, settings). This will diverge.  
* **No explicit DTO vs Domain split.** Interfaces read like domain structs; there’s no hydrator and no deterministic de/serialization contract. 
* **IDs are plain `string`.** Easy to mix entity IDs by mistake. Branded types would prevent cross-wiring. (Multiple places use `string` ids.) 
* **Some value objects lack stable ids.** `ImagePoint` has no `id`, making targeted updates/undo granularities harder. 

---

## Position on “local DTO in the same file”

* **Yes to co-locating.** Put the DTO type next to the domain class, with `static fromDTO()` and `toDTO()`. This gives “one file to touch” per entity and stays idiomatic.
* **No to nested class declarations** (e.g., `class Point { static DTO = class {...}}`). It works, but hurts readability, tooling, and type exports. Prefer `export interface XDto` + `export class X`.

---

## Practical recommendations

### 1) Formalize a two-layer model (no legacy)

**Rule:** DTOs are for storage; Domain classes are for runtime.

**Per entity file** (your “one file to edit”):

```ts
// world-point.ts
export type PointId = string & { __brand: 'PointId' }

export interface WorldPointDto {
  id: PointId
  name: string
  xyz?: [number, number, number]
  color: string
  isVisible: boolean
  isOrigin?: boolean
  isLocked?: boolean
  group?: string
  tags?: string[]
}

export class WorldPoint {
  private constructor(private repo: Repo, private d: WorldPointDto) {}
  static fromDTO(dto: WorldPointDto, repo: Repo) { return new WorldPoint(repo, dto) }
  toDTO(): WorldPointDto { return { ...this.d } }

  get id() { return this.d.id }
  get name() { return this.d.name }
  set name(v: string) { this.d.name = v }
  // relations via repo, never stored as objects in DTO
}
```

Repeat for `Line`, `Plane`, `Camera`, etc. Keep DTO + Domain side-by-side in the same file.

### 2) Add a thin repository as the bridge

```ts
export class Repo {
  constructor(private store: ProjectDto) {}
  private cache = new Map<string, any>()

  point(id: PointId) {
    if (!this.cache.has(id)) this.cache.set(id, WorldPoint.fromDTO(this.store.points[id], this))
    return this.cache.get(id) as WorldPoint
  }
  // similar for lines, planes, cameras...
}
```

* Build **inverse indexes** (e.g., points → imagePoints) in memory on load; don’t store back-refs in JSON.
* Provide batch queries for views.

### 3) Split the big “project” into DTO vs session

Create explicit types; persist only DTO.

```ts
// project.dto.ts  (storage only)
export interface ProjectDto {
  version: number
  points: Record<PointId, WorldPointDto>
  lines: Record<LineId, LineDto>
  planes: Record<PlaneId, PlaneDto>
  cameras: Record<CameraId, CameraDto>
  images: Record<ImageId, ImageDto>
  constraints: ConstraintDto[]
  settings: ProjectSettingsDto
  // no entityManager / selection / workspace state here
}
```

```ts
// project.session.ts (runtime only, not persisted)
export interface ProjectSession {
  repo: Repo
  selection: EntitySelection
  workspace: WorkspaceState
  history: UndoStack
}
```

Move `entityManager`, `selection`, `workspaceState` out of persisted models. 

### 4) Remove legacy now (your requirement)

* **Delete** legacy union members from constraint types. 
* **Strip** legacy fields from `Constraint`, `ProjectImage`, `Camera`. 
* **Replace** `utils.getConstraintPointIds` with a new version over the non-legacy schema; delete the old. 
* **Remove** `ProjectMigration` from the main model; if needed later, implement converters in a separate package/module. 

### 5) Normalize relations; give every addressable thing an id

* Add `id` to `ImagePoint` (or make it a tuple-id), store them under `images[imageId].imagePoints[imagePointId]` (DTO). 
* Keep DTOs acyclic and reference by id; hydrate relations in getters.

### 6) Brand ids to prevent cross-wiring

Define `PointId`, `LineId`, etc., and use them across DTOs and domain classes instead of plain `string`. This prevents mixing types at compile time (several current places accept plain `string`). 

### 7) Unify duplicate project concepts

Pick **one** project DTO (drop “enhanced vs legacy”), and one session model. Merge template/history/export/settings definitions into that single source to avoid drift.  

### 8) Deterministic de/serialization

* `Project.toJSON()` returns sorted keys, arrays ordered by `createdAt` or `name`.
* Round-trip test: `dehydrate(hydrate(dto))` deep-equals original (ignoring order).
* Keep `version` as a schema version, **without** bundling migration code.

### 9) API ergonomics for the UI

* Components consume **domain objects or view models**, never raw ids.
* Provide memoized selectors returning domain instances for React; hide the repo.

### 10) Minimal example for constraints (non-legacy)

```ts
export interface ConstraintDto {
  id: ConstraintId
  type: 'distance_point_point' | 'lines_parallel' | /* ...non-legacy only... */
  entities: { points?: PointId[]; lines?: LineId[]; planes?: PlaneId[] }
  parameters: Record<string, number | string | boolean>
  enabled: boolean
  weight: number
}

export class Constraint {
  constructor(private d: ConstraintDto) {}
  static fromDTO(d: ConstraintDto) { return new Constraint(d) }
  toDTO(): ConstraintDto { return { ...this.d } }
}
```

---

## Migration of current code to the above (tight, no legacy)

1. **Create DTO/domain pairs** for `WorldPoint`, `Line`, `Plane`, `Camera`, `Image`, `Constraint`.
2. **Introduce `ProjectDto` + `ProjectSession`.** Move `entityManager`, selection, workspace out. 
3. **Delete legacy:** remove legacy fields and unions; replace utils that reference them.   
4. **Add ids where missing** (e.g., `ImagePoint`). 
5. **Adopt branded ids** and update signatures.
6. **Implement repo** and switch UI to getters (no raw id plumbing).
7. **Write round-trip tests** for each entity and the whole project.

---

## Bottom line

Co-locate each DTO with its domain class and add `fromDTO`/`toDTO` static methods. Keep DTOs normalized and runtime state out of storage. Remove legacy now and unify the project shape. You’ll get painless JSON persistence and ergonomic, id-free UI code—without scattering changes across files.
