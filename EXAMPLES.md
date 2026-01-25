# Example Projects

Rotera includes example projects to help new users learn the tool. This document describes how examples are managed, served, and offered to users.

## Overview

Example projects demonstrate common workflows:
- Room/interior reconstruction
- Product photography calibration
- Architectural measurement
- Multi-camera alignment

Examples are **opt-in** - users choose whether to import them. They're offered once on first visit and always available via the project browser.

## Storage

### Server-side
```
public/
  examples/
    index.json              # Manifest listing all examples
    room-corner.rotera      # Individual project files
    product-table.rotera
    ...
```

### Client-side
- Examples import into user's IndexedDB like any other project
- Placed in an "Examples" folder (created automatically)
- User can delete, modify, or move them freely
- No special treatment after import

## Manifest Format

`public/examples/index.json`:
```json
{
  "version": "1.0",
  "examples": [
    {
      "id": "room-corner",
      "name": "Room Corner",
      "description": "Single photo, axis-aligned walls. Learn coordinate locking and axis constraints.",
      "file": "room-corner.rotera",
      "thumbnail": "room-corner.png",
      "difficulty": "beginner",
      "concepts": ["origin", "axis-alignment", "distance"],
      "estimatedMinutes": 5
    },
    {
      "id": "product-table",
      "name": "Product Photography",
      "description": "Calibrate camera for product shots on a known-size surface.",
      "file": "product-table.rotera",
      "thumbnail": "product-table.png",
      "difficulty": "beginner",
      "concepts": ["focal-length", "known-distance", "single-camera"],
      "estimatedMinutes": 10
    },
    {
      "id": "two-camera-hallway",
      "name": "Two-Camera Hallway",
      "description": "Link two photos through shared points. Learn multi-camera solving.",
      "file": "two-camera-hallway.rotera",
      "thumbnail": "two-camera-hallway.png",
      "difficulty": "intermediate",
      "concepts": ["multi-camera", "shared-points", "bundle-adjustment"],
      "estimatedMinutes": 15
    }
  ]
}
```

## Onboarding Flow

### First Visit Detection
```typescript
// localStorage key (survives browser data clear better than IndexedDB)
const ONBOARDING_KEY = 'rotera_onboarding_v1'

interface OnboardingState {
  examplesOffered: boolean      // Have we shown the examples prompt?
  examplesImported: boolean     // Did user choose to import?
  dismissedAt?: string          // When user declined
}
```

### First Visit Prompt
When a user visits with no projects and `!examplesOffered`:

```
┌─────────────────────────────────────────────────────┐
│  Welcome to Rotera                                  │
│                                                     │
│  Would you like to load example projects?           │
│  They demonstrate common workflows and can be       │
│  deleted anytime.                                   │
│                                                     │
│  [Load Examples]  [Start Fresh]  [Maybe Later]      │
└─────────────────────────────────────────────────────┘
```

- **Load Examples**: Fetches and imports all examples into "Examples" folder
- **Start Fresh**: Sets `examplesOffered: true`, never prompts again
- **Maybe Later**: Dismisses without setting flag, will prompt next session

### Project Browser Access
Always available button in toolbar:
```
[+ New Project] [📁 New Folder] [📥 Load Examples]
```

Shows modal with example cards:
- Thumbnail
- Name and description
- Difficulty badge
- "Import" button per example (or "Import All")
- Indicates which are already imported

## Multi-Machine Behavior

The `examplesOffered` flag is in **localStorage**, not IndexedDB:
- Each browser/machine has independent onboarding state
- User on Machine A imports examples → Machine B still offers them
- This is intentional: user might want examples on one machine but not another

If user wants to sync examples across machines:
1. Export examples folder as ZIP from Machine A
2. Import ZIP on Machine B
3. Or just decline examples on machines where not wanted

## Implementation

### Service: `src/services/example-projects.ts`
```typescript
interface ExampleManifest {
  version: string
  examples: ExampleProject[]
}

interface ExampleProject {
  id: string
  name: string
  description: string
  file: string
  thumbnail?: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  concepts: string[]
  estimatedMinutes?: number
}

class ExampleProjectService {
  // Fetch manifest from server
  async getManifest(): Promise<ExampleManifest>

  // Fetch and import a single example
  async importExample(example: ExampleProject): Promise<void>

  // Import all examples into "Examples" folder
  async importAllExamples(): Promise<{ success: number; failed: number }>

  // Check if example already imported (by matching name in Examples folder)
  async isExampleImported(exampleId: string): Promise<boolean>

  // Onboarding state management
  getOnboardingState(): OnboardingState
  setExamplesOffered(): void
  setExamplesImported(): void
}
```

### Component: `src/components/ExamplesModal.tsx`
- Grid of example cards with thumbnails
- Import individual or all
- Shows import progress
- Indicates already-imported examples

### Integration Points
1. `App.tsx`: Check onboarding state, show welcome prompt
2. `ProjectBrowser.tsx`: Add "Load Examples" button
3. `useProjectBrowser.ts`: Add example import handlers

## Publishing New Example Projects

### Quick Reference

**File locations:**
- Example files: `public/examples/*.rotera` (can use subfolders)
- Manifest: `public/examples/index.json`
- File extension: `.rotera` (NOT `.json`)

### Step-by-Step Publishing Process

1. **Prepare your projects in Rotera**
   - Create and solve each example project
   - Use descriptive point/line names ("Floor Corner A" not "Point 1")
   - Ensure projects are fully optimized

2. **Export from Rotera using "Export Folder"**
   - Put all example projects in a folder in the Project Browser
   - Click "Export Folder" on that folder
   - **IMPORTANT:** Make sure "Exclude images" is UNCHECKED (images must be included!)
   - This creates a ZIP file with `.rotera` files

3. **Extract and place files**
   ```bash
   # Extract the ZIP
   unzip your-export.zip -d public/examples/

   # Verify files have .rotera extension
   ls public/examples/
   ```

4. **Update the manifest** (`public/examples/index.json`)
   ```json
   {
     "version": "1.0",
     "examples": [
       {
         "id": "unique-id",
         "name": "Display Name",
         "description": "Brief description of what this example demonstrates.",
         "file": "Filename.rotera",
         "difficulty": "beginner",
         "concepts": ["vanishing-lines", "multi-camera"]
       }
     ]
   }
   ```

   **Manifest fields:**
   - `id`: Unique identifier (lowercase, hyphens, e.g., "room-corner")
   - `name`: Display name shown to users
   - `description`: What the example demonstrates
   - `file`: Path relative to `public/examples/` (e.g., "Subfolder/File.rotera")
   - `difficulty`: "beginner", "intermediate", or "advanced"
   - `concepts`: Array of tags (optional)

5. **Commit and deploy**
   ```bash
   git add public/examples/
   git commit -m "Update example projects"
   git push
   ```

### Guidelines for Example Authors
1. **Keep images small** - Resize to ~1920px max dimension before adding to Rotera
2. **Use descriptive names** - "Floor Corner A" not "Point 1"
3. **Include solved state** - Examples should already be optimized
4. **Test the round-trip** - Import your exported examples back into Rotera to verify they work

## Local Storage Warning

The examples modal and project browser should include a notice:

```
⚠️ Projects are stored in your browser only.
Export important work to avoid data loss.
```

This addresses the storage locality concern without being intrusive.

## Future Considerations

### Cloud Sync (Not Implemented)
If cloud storage is added later:
- Examples would sync like any other project
- Could offer "don't sync examples" option
- Onboarding could check cloud for existing examples

### Community Examples
- User-submitted examples (curated)
- External URL support in manifest
- Rating/difficulty system

### Interactive Tutorials
- Step-by-step guided mode
- Highlight UI elements
- Validate user actions
- Beyond scope of this document

## File Checklist

To implement example projects:

- [ ] `public/examples/index.json` - Manifest
- [ ] `public/examples/*.rotera` - Example project files
- [ ] `public/examples/*.png` - Thumbnails (optional)
- [ ] `src/services/example-projects.ts` - Fetch and import service
- [ ] `src/components/ExamplesModal.tsx` - Selection UI
- [ ] `src/components/WelcomeModal.tsx` - First-visit prompt
- [ ] Update `ProjectBrowser.tsx` - Add "Load Examples" button
- [ ] Update `App.tsx` - Onboarding flow integration
