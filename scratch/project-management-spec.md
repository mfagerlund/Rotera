# Project Management & Storage System Specification

**Date:** 2025-10-18
**Status:** REVISED - File System Access API Approach
**Target:** Fusion 360-like project workflow with file-based storage

---

## ⚠️ IMPORTANT: Port Independence Issue

**Problem:** IndexedDB and localStorage are scoped to origin (protocol + host + **port**). When dev server port changes, the database becomes inaccessible.

**Solution:** Use **File System Access API** for primary storage (real files on disk). This is port-independent and gives users direct control over their project files.

---

## 1. Current State Analysis

### What We Have
- **Single project per session**: One hardcoded/default project loaded on startup
- **No persistence**: Project data exists only in memory during session
- **Export functionality**: Can export to JSON (with optional image blob stripping)
- **Placeholder buttons**: "Save" and "Load" buttons exist but do nothing
- **No project metadata**: No name, description, creation date, version history

### What's Missing
- Project selection/creation UI
- Save/Load implementation
- Project versioning
- Cloud storage (planned for future)
- Auto-save/crash recovery
- Unsaved changes detection

---

## 2. Fusion 360 Workflow Reference

### Key Features to Emulate
1. **File Operations**
   - New Project
   - Open Project (file picker)
   - Save (Ctrl+S)
   - Save As (create copy/branch)
   - Close Project
   - Recent files list

2. **Version Control**
   - Manual versioning (Save As with version suffix)
   - Auto-backup files (for crash recovery)
   - Optional: Embedded version history in project file

3. **Cloud Integration** (Future)
   - Save to cloud
   - Offline mode with local cache
   - Sync status indicator

4. **UX Patterns**
   - One document open per tab
   - Dirty state indicator (unsaved changes)
   - Confirm before closing unsaved work
   - Recent projects list
   - Quick-save vs explicit save dialog

---

## 3. Proposed Workflow for Pictorigo

### Phase 1: File System Access API (MVP)
Focus: Get basic project management working with real files on user's file system

#### Features
- **Project Creation**
  - "New Project" button/action
  - Creates empty project in memory
  - Project is "Untitled" until first save
  - Dirty state immediately active (unsaved)

- **Project Saving** (File System Access API)
  - **Save (Ctrl+S)**:
    - If no file handle: Show "Save As" file picker
    - If has file handle: Save directly to existing file
    - Also creates auto-backup in IndexedDB (crash recovery)
  - **Save As**:
    - Always shows file picker
    - Creates new `.pictorigo` file at user-chosen location
    - Suggested filename from project name or "untitled.pictorigo"
  - **Auto-backup**:
    - Every 2 minutes, save snapshot to IndexedDB
    - Only for crash recovery (not versioning)
    - Cleared when user explicitly saves to file
  - **Dirty state tracking**: "*" indicator when unsaved changes exist

- **Project Loading** (File System Access API)
  - **Open (Ctrl+O)**:
    - Show file picker filtered to `.pictorigo` files
    - Load and parse JSON
    - Store file handle for future saves
    - Clear dirty state
  - **Recent Files**:
    - Store last 5-10 file handles (if permission granted)
    - Show on welcome screen
    - Click to reopen directly (no picker needed)
    - Gracefully handle if file moved/deleted

- **Project Versioning**
  - **Manual versioning** via Save As:
    - User creates `project-v1.pictorigo`, `project-v2.pictorigo`, etc.
    - File system handles version management
  - **Optional future**: Embed version history inside project file
    - Each save appends to history array in JSON
    - Keep last N versions embedded
    - "Restore Version" extracts old snapshot

- **Crash Recovery**
  - On startup, check IndexedDB for auto-backup
  - If found and newer than last known save, offer recovery:
    - Dialog: "Unsaved work detected. Restore?"
    - Options: Restore, Discard
  - After recovery, prompt to save to file

#### UI Changes
- **Welcome Screen** (if no project open)
  - "New Project" button (prominent)
  - "Open Project" button (shows file picker)
  - "Recent Files" list (last 5 file handles)
    - Click to reopen directly
    - Show filename and path (if available)

- **Top Toolbar Modifications**
  - **File Menu** (dropdown or separate section):
    - New Project (Ctrl+N)
    - Open Project (Ctrl+O) → file picker
    - ---
    - Save (Ctrl+S) → save to current file or show picker
    - Save As (Ctrl+Shift+S) → always show picker
    - ---
    - Close Project
    - ---
    - Export (existing functionality, with options)
    - ---
    - Project Settings
  - **Dirty State Indicator**: Filename with "*" suffix if unsaved
  - **Filename Display**: Show current file name (or "Untitled*" if new)
    - Optional: Show full path on hover

- **Export Dialog Enhancement**
  - Checkbox: "Include image data" (default: unchecked for fixtures)
  - Format: JSON
  - Button: "Export" (triggers download, separate from Save)

#### Storage Strategy
- **Primary Storage**: File System Access API
  - Real `.pictorigo` files on user's file system
  - User controls location (Documents, Desktop, project folders, etc.)
  - Files are standard JSON (can be versioned with git, backed up normally)

- **Secondary Storage**: IndexedDB (crash recovery only)
  - Auto-backup every 2 minutes
  - Single "current project" backup
  - Cleared on explicit save

- **IndexedDB Structure** (minimal):
  ```
  Database: "PictorigoBackup"

  ObjectStore: "autoBackup"
    - id: "current" (single record)
    - timestamp: number
    - data: ProjectDto (full DTO with images)
    - originalFileName: string (if known)

  ObjectStore: "recentFiles"
    - id: number (auto-increment)
    - fileHandle: FileSystemFileHandle
    - fileName: string
    - lastOpened: timestamp
    - maxRecords: 10 (keep newest 10)

  ObjectStore: "settings"
    - key-value pairs for app settings
    - autoBackupInterval: number (default 120000 = 2 min)
    - showWelcomeScreen: boolean
  ```

- **File Format** (`.pictorigo` JSON):
  - **Uses existing `ProjectDto` structure directly** (no wrapper needed)
  - **Save/Load always includes full image data** (url field with base64)
  - Example structure:
  ```json
  {
    "id": "project-uuid",
    "version": 1,
    "name": "Project Name",
    "description": "Optional",
    "worldPoints": {...},
    "cameras": {...},
    "lines": {...},
    "constraints": {...},
    "images": {
      "img1": {
        "id": "img1",
        "name": "Front view",
        "filename": "front.jpg",
        "width": 1920,
        "height": 1080,
        "url": "data:image/jpeg;base64,/9j/4AAQ...",  // ← Included in Save/Load
        "imagePoints": {...}
      }
    }
  }
  ```

#### Save vs Export Distinction

**Save (Ctrl+S)** - For normal project persistence:
- Always includes full image data (`url` field with base64)
- User wants to see images when they reload
- Saves to `.pictorigo` file via File System Access API

**Export** - For sharing/fixtures/testing:
- Shows dialog with checkbox: "Strip image data (for test fixtures)"
- If checked: Removes `url` field from all images
- Keeps all other metadata: width, height, filename, imagePoints
- Downloads as JSON file (separate from Save)

**Why this matters:**
- Image `url` field contains base64-encoded blob (large, 100KB-5MB per image)
- Stripping it reduces file size 10-100x for test fixtures
- But metadata (resolution, imagePoints) still preserved for optimization testing

---

### Phase 2: Cloud Storage (Future)

#### Features
- **Firebase Integration** (recommended)
  - Firestore for project metadata and small projects
  - Cloud Storage for large blobs (images, large project files)
  - Authentication (Google, Email, etc.)
  - Real-time sync (optional, nice-to-have)

- **Hybrid Storage Model**
  - Projects can be local-only or cloud-synced
  - Cloud projects have offline cache
  - Sync status indicators (synced, syncing, offline)
  - Conflict resolution (last-write-wins or manual merge)

- **Sharing & Collaboration** (nice-to-have)
  - Share project via link (read-only or editable)
  - Invite collaborators
  - Activity log (who changed what)

#### UI Changes
- **Storage Location Selector**
  - When creating/saving: Local or Cloud
  - Visual indicator on project cards (cloud icon)
  - "Upload to Cloud" / "Download to Local" actions

- **Account Management**
  - Sign in/sign out
  - Profile settings
  - Storage quota indicator

- **Sync Status**
  - Icon in toolbar showing sync state
  - Last synced timestamp
  - "Sync Now" button for manual sync

---

## 4. Technical Architecture

### Data Flow - Save Operation
```
User presses Ctrl+S
  ↓
ProjectManager.save()
  ↓
Has file handle?
  YES → FileSystemService.writeFile(handle, projectDto)
  NO → FileSystemService.saveAs(projectDto, suggestedName)
  ↓
File System Access API
  ↓
User's file system (.pictorigo file written)
  ↓
Update UI (clear dirty flag, show filename)
  ↓
BackupService.clearAutoBackup() (clear IndexedDB backup)
```

### Data Flow - Load Operation
```
User clicks "Open" or Ctrl+O
  ↓
Unsaved changes? → Warn user
  ↓
ProjectManager.open()
  ↓
FileSystemService.openFile(['.pictorigo', '.json'])
  ↓
File System Access API (show picker)
  ↓
Read file, parse JSON
  ↓
Validate ProjectDto structure
  ↓
Load into project state
  ↓
Store file handle for future saves
  ↓
Clear dirty flag
```

### Data Flow - Auto-Backup
```
Every 2 minutes (timer)
  ↓
Is project dirty?
  YES → BackupService.autoSave(projectDto)
  NO → Skip
  ↓
IndexedDB.put('autoBackup', {timestamp, data, fileName})
```

### Key Components

#### Phase 1A Components (Core)

**1. FileSystemService** (`src/services/FileSystemService.ts`)
```typescript
interface FileSystemService {
  // Check if File System Access API is available
  isSupported(): boolean

  // Show save picker, write file, return handle
  saveAs(data: ProjectDto, suggestedName: string): Promise<FileSystemFileHandle>

  // Write to existing handle (quick save)
  writeFile(handle: FileSystemFileHandle, data: ProjectDto): Promise<void>

  // Show open picker, read file
  openFile(acceptTypes: string[]): Promise<{handle: FileSystemFileHandle, data: ProjectDto}>

  // Fallback for unsupported browsers
  downloadFile(data: ProjectDto, filename: string): void
  uploadFile(): Promise<ProjectDto>
}
```

**2. ProjectManager** (`src/services/ProjectManager.ts`)
```typescript
interface ProjectManager {
  // Current state
  currentProject: ProjectDto | null
  currentFileHandle: FileSystemFileHandle | null
  isDirty: boolean
  fileName: string | null

  // Operations
  newProject(): void
  save(): Promise<void>
  saveAs(): Promise<void>
  open(): Promise<void>
  close(): Promise<boolean> // Returns false if user cancels

  // Dirty tracking
  markDirty(): void
  clearDirty(): void

  // Event listeners
  onProjectChange(callback: (project: ProjectDto) => void): void
  onDirtyStateChange(callback: (dirty: boolean) => void): void
}
```

**3. BackupService** (`src/services/BackupService.ts`)
```typescript
interface BackupService {
  // Auto-backup to IndexedDB
  startAutoBackup(intervalMs: number): void
  stopAutoBackup(): void
  saveBackup(data: ProjectDto, fileName?: string): Promise<void>
  loadBackup(): Promise<{timestamp: number, data: ProjectDto, fileName?: string} | null>
  clearBackup(): Promise<void>

  // Recent files
  addRecentFile(handle: FileSystemFileHandle, fileName: string): Promise<void>
  getRecentFiles(): Promise<Array<{handle: FileSystemFileHandle, fileName: string, lastOpened: number}>>
}
```

**4. useProjectManager Hook** (`src/hooks/useProjectManager.ts`)
- Wraps ProjectManager service
- Provides React state integration
- Handles keyboard shortcuts
- Manages UI state (dirty indicator, filename display)

**5. File Menu Component** (`src/components/FileMenu.tsx`)
- Dropdown menu in toolbar
- New, Open, Save, Save As, Close, Export
- Keyboard shortcut hints

#### Phase 1B Components (UX)

**6. WelcomeScreen Component** (`src/components/WelcomeScreen.tsx`)
- Full-screen when no project loaded
- New Project / Open Project buttons
- Recent files list

**7. ExportDialog Component** (`src/components/ExportDialog.tsx`)
- Modal dialog for export
- Checkbox for stripping image URLs
- Preview file size
- Download button

**8. UnsavedChangesDialog Component** (`src/components/UnsavedChangesDialog.tsx`)
- Reusable confirmation dialog
- Save / Don't Save / Cancel buttons
- Used before: new project, open project, close tab

#### Phase 2 Components (Cloud - Future)

**9. CloudRepository** (`src/repository/CloudRepository.ts`)
- Firebase integration
- Upload/download with metadata
- Versioning in Firestore
- Thumbnails in Cloud Storage

---

## 5. Implementation Phases

### Phase 1A: Core Save/Load with File System API
**Goal:** Get basic project persistence working

- [ ] **File System Access API wrapper** (`src/services/FileSystemService.ts`)
  - `saveFile(data, suggestedName)` - Show save picker, write JSON
  - `openFile(acceptTypes)` - Show open picker, read JSON
  - Handle permissions and errors gracefully
  - Browser compatibility check (Chrome/Edge only)

- [ ] **Project Manager** (`src/services/ProjectManager.ts`)
  - Track current file handle (for quick save)
  - Track dirty state (unsaved changes)
  - `newProject()` - Clear current, set dirty
  - `save()` - Use handle or show picker
  - `saveAs()` - Always show picker
  - `open()` - Show picker, load DTO
  - Serialize/deserialize ProjectDto

- [ ] **Hook into existing Save/Load buttons**
  - Wire up `onSave` handler in MainToolbar
  - Wire up `onLoad` handler in MainToolbar
  - Add File menu dropdown (New, Open, Save, Save As, Export)

- [ ] **Dirty state tracking**
  - Track changes to project (worldPoints, images, constraints, etc.)
  - Show "*" indicator in toolbar when dirty
  - Clear dirty flag on successful save

- [ ] **Keyboard shortcuts**
  - Ctrl+S: Save
  - Ctrl+Shift+S: Save As
  - Ctrl+O: Open
  - Ctrl+N: New Project

### Phase 1B: UX Polish & Safety
**Goal:** Make it production-ready

- [ ] **Unsaved changes warnings**
  - Warn on browser tab close (beforeunload)
  - Warn on "New Project" if dirty
  - Warn on "Open Project" if dirty
  - Dialog: "Save changes before [action]?"

- [ ] **Welcome screen** (when no project loaded)
  - "New Project" button
  - "Open Project" button
  - Recent files list (if file handles available)

- [ ] **Recent files** (IndexedDB)
  - Store last 5-10 file handles
  - Show on welcome screen
  - Gracefully handle moved/deleted files

- [ ] **Export dialog enhancement**
  - Replace immediate download with modal dialog
  - Checkbox: "Strip image data (for test fixtures)"
  - Default: unchecked (include images)
  - Help text explaining use case

- [ ] **Error handling**
  - File picker canceled → no-op
  - File read error → show error dialog
  - File write error → show error dialog, keep dirty state
  - Invalid JSON → show error, offer to export current state

### Phase 1C: Auto-Backup & Recovery
**Goal:** Prevent data loss from crashes

- [ ] **IndexedDB auto-backup** (`src/services/BackupService.ts`)
  - Auto-save to IndexedDB every 2 minutes
  - Single "current" backup record
  - Store timestamp and original filename

- [ ] **Crash recovery**
  - On app startup, check for backup newer than last save
  - Show recovery dialog: "Restore unsaved work?"
  - Options: Restore, Discard
  - After restore, prompt to save to file

- [ ] **Clear backup on explicit save**
  - When user saves to file, clear IndexedDB backup
  - Prevents false recovery prompts

### Phase 2: Firebase Cloud Storage (Future)
**Goal:** Add cloud sync as optional feature

- [ ] Firebase project setup & authentication
- [ ] Cloud storage for project files
- [ ] Hybrid mode: local files + cloud backup
- [ ] Sync status indicators
- [ ] Conflict resolution
- [ ] Versioning and thumbnails in cloud metadata

---

## 6. Open Questions & Recommendations

### Decisions Made
✅ **Storage approach**: File System Access API (port-independent)
✅ **File format**: Existing ProjectDto (no wrapper)
✅ **Save behavior**: Always include images (full DTO)
✅ **Export behavior**: Optional checkbox to strip image URLs

### Remaining Questions

#### Q1: Auto-Backup Interval
**Question:** How often should IndexedDB auto-backup run?
- A) Every 1 minute (very safe, more overhead)
- B) Every 2 minutes (balanced)
- C) Every 5 minutes (less overhead, more risk)
- D) User-configurable

**Recommendation:** **Option B (2 minutes)**
- Good balance between safety and performance
- Most users won't lose more than 2 min of work
- Can make configurable later if needed

#### Q2: Recent Files Count
**Question:** How many recent file handles to store?
- A) 5 files
- B) 10 files
- C) User-configurable

**Recommendation:** **Option A (5 files)**
- Enough for quick access to recent projects
- Keeps welcome screen clean
- File handles require permission, don't want too many

#### Q3: Browser Compatibility Warning
**Question:** File System Access API only works in Chrome/Edge. For Firefox/Safari users:
- A) Show error: "Browser not supported, use Chrome/Edge"
- B) Fallback to traditional download/upload (no quick save)
- C) Don't show the app at all (redirect to compatibility page)

**Recommendation:** **Option B (Fallback)**
- Show warning banner: "For best experience, use Chrome or Edge"
- Save/Load use traditional download/file input fallback
- No file handles, no quick save, but functional

#### Q4: Export Dialog Default
**Question:** Export dialog checkbox "Strip image data" should default to:
- A) Checked (strip images by default)
- B) Unchecked (include images by default)

**Recommendation:** **Option A (Strip by default)**
- You mentioned exports are mainly for test fixtures
- User can uncheck if they want full export
- Label: "Strip image data (recommended for test fixtures)"

#### Q5: New Project Behavior
**Question:** When user clicks "New Project":
- A) Always create new empty project immediately
- B) Show dialog to name the project first
- C) Check for unsaved changes, then create

**Recommendation:** **Option C**
- If current project has unsaved changes, warn first
- Then create new empty project
- Project is "Untitled*" until first save
- User names it during Save As

#### Q6: Crash Recovery Persistence
**Question:** How long should crash recovery backup be kept?
- A) Delete after 24 hours
- B) Delete after 7 days
- C) Keep until user explicitly discards
- D) Keep only until next successful save

**Recommendation:** **Option D (Delete on next save)**
- Simple and clean
- Once user saves successfully, backup no longer needed
- Prevents stale backups from cluttering IndexedDB
- If user wants to keep backup, they can save to file

#### Q7: File Extension Validation
**Question:** When opening files, should we:
- A) Only allow `.pictorigo` files
- B) Allow any `.json` file (validate structure inside)
- C) Allow both

**Recommendation:** **Option C**
- Filter shows `.pictorigo` by default
- But also allow `.json` in case user renamed or exported differently
- Validate structure after loading regardless of extension
- Show helpful error if invalid: "Not a valid Pictorigo project file"

#### Q8: Phase Priority
**Question:** Which phase should we implement first?
- A) Phase 1A only (basic save/load, no auto-backup)
- B) Phase 1A + 1B (add UX polish)
- C) All of Phase 1 (A+B+C, including auto-backup)

**Recommendation:** **Start with 1A, then 1C, then 1B**
- 1A: Core functionality, get it working
- 1C: Auto-backup is critical for preventing data loss
- 1B: UX polish can come after core is solid
- Skip welcome screen initially, add it later

---

## 7. Migration Path

### Existing Users (if any)
If there are users with existing data:
1. On first load of new version, detect if old project data exists
2. Show migration dialog: "Migrate to new project system?"
3. Create "Untitled Project" or "Migrated Project"
4. Import existing data as version 1
5. Save to IndexedDB
6. Optional: Clear old localStorage to free space

### Data Export for Safety
Before Phase 2 cloud migration:
1. Provide "Backup All Projects" feature
2. Downloads ZIP file with all projects as JSON
3. User can re-import if cloud sync fails

---

## 8. Recommended Technology Stack

### Phase 1
- **IndexedDB**: `idb` library (Promise-based wrapper)
- **State Management**: Existing hooks + Context API
- **UUID Generation**: `uuid` library
- **Thumbnail Generation**: Canvas API
- **Change Detection**: Simple object diffing or dirty flag

### Phase 2
- **Firebase**:
  - Firebase Authentication
  - Cloud Firestore (project metadata)
  - Cloud Storage (images, large projects)
  - Firebase Hosting (optional, for deployment)
- **State Management**: Consider Zustand or Jotai for more complex state
- **Offline Support**: Firebase offline persistence + service workers

---

## 9. File Structure (Proposed)

```
frontend/src/
├── components/
│   ├── project-management/
│   │   ├── ProjectBrowser.tsx       # Grid/list of projects
│   │   ├── ProjectCard.tsx          # Individual project item
│   │   ├── NewProjectDialog.tsx     # Create new project
│   │   ├── SaveAsDialog.tsx         # Save copy dialog
│   │   ├── VersionHistory.tsx       # Version timeline
│   │   ├── WelcomeScreen.tsx        # No project open state
│   │   ├── ExportDialog.tsx         # Enhanced export with options
│   │   └── ImportDialog.tsx         # Import project flow
│   ├── main-layout/
│   │   └── FileMenu.tsx             # New File menu dropdown
│   └── ...
├── services/
│   ├── ProjectManager.ts            # Project lifecycle management
│   ├── ThumbnailGenerator.ts        # Generate project previews
│   └── ChangeDetector.ts            # Track unsaved changes
├── repository/
│   ├── LocalRepository.ts           # IndexedDB operations (Phase 1)
│   ├── CloudRepository.ts           # Firebase operations (Phase 2)
│   └── RepositoryInterface.ts       # Shared interface
├── contexts/
│   ├── ProjectContext.tsx           # Current project state
│   └── AuthContext.tsx              # User auth (Phase 2)
├── types/
│   ├── project-management.ts        # Project metadata types
│   └── version.ts                   # Version types
└── hooks/
    ├── useProjectManager.ts         # Project CRUD operations
    ├── useAutoSave.ts               # Auto-save logic
    └── useDirtyState.ts             # Track unsaved changes
```

---

## 10. UI Mockups (Text-Based)

### Welcome Screen
```
┌──────────────────────────────────────────────────┐
│                   Pictorigo                      │
│                                                  │
│     ┌────────────────────┐                      │
│     │   NEW PROJECT      │                      │
│     └────────────────────┘                      │
│                                                  │
│     ┌────────────────────┐                      │
│     │   OPEN PROJECT     │                      │
│     └────────────────────┘                      │
│                                                  │
│   Recent Projects:                              │
│   • House Model (modified 2h ago)               │
│   • Garden Survey (modified yesterday)          │
│   • Test Fixture 1 (modified 3 days ago)        │
│                                                  │
│   [Import from JSON]                            │
└──────────────────────────────────────────────────┘
```

### Project Browser (Full-Screen)
```
┌────────────────────────────────────────────────────────┐
│  Projects                                     [x Close] │
│                                                         │
│  [Search projects...]              [Sort: Modified ▼]  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ [thumb]  │  │ [thumb]  │  │ [thumb]  │             │
│  │ House    │  │ Garden   │  │ Test     │             │
│  │ 45 pts   │  │ 23 pts   │  │ 12 pts   │             │
│  │ 2h ago   │  │ 1d ago   │  │ 3d ago   │             │
│  │ [Open]   │  │ [Open]   │  │ [Open]   │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                         │
│  ┌──────────┐  ┌──────────┐                            │
│  │ [+]      │  │ ...      │                            │
│  │ New      │  │          │                            │
│  │ Project  │  │          │                            │
│  └──────────┘  └──────────┘                            │
└────────────────────────────────────────────────────────┘
```

### File Menu (Dropdown)
```
┌─────────────────────┐
│ File              ▼ │
├─────────────────────┤
│ New Project    ^N   │
│ Open Project   ^O   │
│ Save           ^S   │
│ Save As...     ^⇧S  │
│ Close Project       │
│ ─────────────────── │
│ Version History     │
│ ─────────────────── │
│ Export...           │
│ Import...           │
│ ─────────────────── │
│ Project Settings    │
└─────────────────────┘
```

### Export Dialog
```
┌──────────────────────────────────────┐
│ Export Project                       │
├──────────────────────────────────────┤
│ Format:   [JSON ▼]                   │
│                                      │
│ Options:                             │
│ ☐ Include image data                │
│   (Uncheck for test fixtures)       │
│                                      │
│ Filename: house-model-2025-10-18     │
│                                      │
│         [Cancel]  [Export]           │
└──────────────────────────────────────┘
```

### Version History Panel
```
┌────────────────────────────────────┐
│ Version History: House Model       │
├────────────────────────────────────┤
│ ● Version 5 (Current)              │
│   Today at 2:15 PM                 │
│   "Added roof constraints"         │
│   [Restore] [Export]               │
│                                    │
│ ○ Version 4                        │
│   Today at 11:30 AM                │
│   +2 points, +1 constraint         │
│   [Restore] [Export] [Delete]      │
│                                    │
│ ○ Version 3                        │
│   Yesterday at 4:20 PM             │
│   "Initial structure"              │
│   [Restore] [Export] [Delete]      │
│                                    │
│ ... (7 more versions)              │
│                                    │
│ [Close]                            │
└────────────────────────────────────┘
```

---

## 11. Success Metrics

### Phase 1 Success Criteria
- Users can save and load projects without data loss
- Version history captures changes reliably
- Project browser is intuitive (user testing)
- No noticeable performance degradation
- Export with/without images works correctly

### Phase 2 Success Criteria
- Projects sync to cloud within 5 seconds
- Offline mode works seamlessly
- No data loss during sync conflicts
- Auth flow is smooth
- Storage costs remain within budget

---

## 10. Summary & Next Steps

### What We're Building (Phase 1)

A Fusion 360-style project management system using:
- **File System Access API** for real file storage (port-independent)
- **Existing ProjectDto** format (no new wrappers)
- **IndexedDB** for auto-backup and crash recovery only
- **Full image data** in save/load, optional stripping in export

### Implementation Priority

1. **Phase 1A** (Week 1-2): Core save/load functionality
   - Get basic file operations working
   - Dirty state tracking
   - Keyboard shortcuts

2. **Phase 1C** (Week 3): Auto-backup for crash recovery
   - Critical for preventing data loss
   - Simple IndexedDB backup every 2 min

3. **Phase 1B** (Week 4): UX polish
   - Welcome screen
   - Export dialog
   - Unsaved changes warnings
   - Recent files

4. **Phase 2** (Future): Firebase cloud storage
   - Add as optional feature
   - Versioning and thumbnails
   - Collaboration

### Key Decisions Needed

Please review and confirm/change these recommendations:

1. ✅ **Auto-backup interval**: 2 minutes
2. ✅ **Recent files count**: 5 files
3. ✅ **Browser fallback**: Download/upload for Firefox/Safari
4. ✅ **Export default**: Strip images by default
5. ✅ **New project**: Warn if unsaved changes
6. ✅ **Backup persistence**: Delete on next successful save
7. ✅ **File extensions**: Allow both `.pictorigo` and `.json`
8. ✅ **Implementation order**: 1A → 1C → 1B

### Ready to Start?

Once you approve the spec, we can begin with Phase 1A:
- Implement FileSystemService
- Implement ProjectManager
- Wire up Save/Load buttons
- Add keyboard shortcuts
- Test save/load round-trip

---

## Appendix A: Code Examples

### Example: File System Access API Usage

```typescript
// Save file
const handle = await window.showSaveFilePicker({
  suggestedName: 'my-project.pictorigo',
  types: [{
    description: 'Pictorigo Project',
    accept: { 'application/json': ['.pictorigo', '.json'] }
  }]
})

const writable = await handle.createWritable()
await writable.write(JSON.stringify(projectDto, null, 2))
await writable.close()

// Open file
const [handle] = await window.showOpenFilePicker({
  types: [{
    description: 'Pictorigo Project',
    accept: { 'application/json': ['.pictorigo', '.json'] }
  }],
  multiple: false
})

const file = await handle.getFile()
const content = await file.text()
const projectDto = JSON.parse(content)
```

### Example: IndexedDB Auto-Backup

```typescript
// Save backup
const db = await openDB('PictorigoBackup', 1)
await db.put('autoBackup', {
  id: 'current',
  timestamp: Date.now(),
  data: projectDto,
  fileName: currentFileName
})

// Load backup
const backup = await db.get('autoBackup', 'current')
if (backup && backup.timestamp > lastSaveTime) {
  // Offer recovery
}
```

---

## Appendix B: Browser Compatibility

### File System Access API Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 86+ | ✅ Full | Recommended |
| Edge 86+ | ✅ Full | Recommended |
| Opera 72+ | ✅ Full | Should work |
| Firefox | ⚠️ Partial | Behind flag, not recommended |
| Safari | ❌ None | Use fallback |

**Fallback strategy**: For unsupported browsers, use traditional download (`<a>` tag with blob URL) and file upload (`<input type="file">`). No file handles, so no quick save, but functional.

---

**End of Specification**

Ready to implement when you are! 🚀
