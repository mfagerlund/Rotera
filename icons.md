# Icon Reference Guide

This document defines the standard icons used throughout Pictorigo. All icons use Font Awesome via `@fortawesome/react-fontawesome`.

## Usage

```tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faIconName } from '@fortawesome/free-solid-svg-icons'
// or
import { faIconName } from '@fortawesome/free-regular-svg-icons'

<FontAwesomeIcon icon={faIconName} />
```

## Icon Mapping

### Measurement & Geometry
| Purpose | Icon | Import |
|---------|------|--------|
| Ruler / Linear measurement | `faRuler` | `@fortawesome/free-solid-svg-icons` |
| Triangle / Geometry | `faDraftingCompass` | `@fortawesome/free-solid-svg-icons` |
| Angle measurement | `faRuler` | `@fortawesome/free-solid-svg-icons` |

### Actions
| Purpose | Icon | Import |
|---------|------|--------|
| Add / Create | `faPlus` | `@fortawesome/free-solid-svg-icons` |
| Edit / Modify | `faPencil` | `@fortawesome/free-solid-svg-icons` |
| Delete / Remove | `faTrash` | `@fortawesome/free-solid-svg-icons` |
| Save | `faFloppyDisk` | `@fortawesome/free-solid-svg-icons` |
| Copy | `faCopy` | `@fortawesome/free-solid-svg-icons` |
| Undo | `faRotateLeft` | `@fortawesome/free-solid-svg-icons` |

### Navigation & Search
| Purpose | Icon | Import |
|---------|------|--------|
| Search / Find | `faMagnifyingGlass` | `@fortawesome/free-solid-svg-icons` |
| Arrow right | `faArrowRight` | `@fortawesome/free-solid-svg-icons` |
| Chevron right | `faChevronRight` | `@fortawesome/free-solid-svg-icons` |
| Chevron left | `faChevronLeft` | `@fortawesome/free-solid-svg-icons` |

### Visibility & State
| Purpose | Icon | Import |
|---------|------|--------|
| Visible / Show | `faEye` | `@fortawesome/free-solid-svg-icons` |
| Hidden / Hide | `faEyeSlash` | `@fortawesome/free-solid-svg-icons` |
| Lock | `faLock` | `@fortawesome/free-solid-svg-icons` |
| Unlock | `faLockOpen` | `@fortawesome/free-solid-svg-icons` |

### Status & Feedback
| Purpose | Icon | Import |
|---------|------|--------|
| Check / Confirm | `faCheck` | `@fortawesome/free-solid-svg-icons` |
| Close / Cancel | `faXmark` | `@fortawesome/free-solid-svg-icons` |
| Error | `faCircleXmark` | `@fortawesome/free-solid-svg-icons` |
| Warning | `faTriangleExclamation` | `@fortawesome/free-solid-svg-icons` |
| Info | `faCircleInfo` | `@fortawesome/free-solid-svg-icons` |
| Success | `faCircleCheck` | `@fortawesome/free-solid-svg-icons` |

### Application Features
| Purpose | Icon | Import |
|---------|------|--------|
| Settings / Configure | `faGear` | `@fortawesome/free-solid-svg-icons` |
| Sliders / Adjust | `faSliders` | `@fortawesome/free-solid-svg-icons` |
| Camera | `faCamera` | `@fortawesome/free-solid-svg-icons` |
| Image | `faImage` | `@fortawesome/free-solid-svg-icons` |
| Target / Aim | `faBullseye` | `@fortawesome/free-solid-svg-icons` |
| Location / Pin | `faLocationDot` | `@fortawesome/free-solid-svg-icons` |

### Data & Analysis
| Purpose | Icon | Import |
|---------|------|--------|
| Chart / Stats | `faChartSimple` | `@fortawesome/free-solid-svg-icons` |
| Graph | `faChartBar` | `@fortawesome/free-solid-svg-icons` |
| Table | `faTable` | `@fortawesome/free-solid-svg-icons` |

### Tools & Construction
| Purpose | Icon | Import |
|---------|------|--------|
| Wrench / Tool | `faWrench` | `@fortawesome/free-solid-svg-icons` |
| Hammer | `faHammer` | `@fortawesome/free-solid-svg-icons` |
| Grid | `faTableCells` | `@fortawesome/free-solid-svg-icons` |

### Organization
| Purpose | Icon | Import |
|---------|------|--------|
| Tag / Label | `faTag` | `@fortawesome/free-solid-svg-icons` |
| Multiple tags | `faTags` | `@fortawesome/free-solid-svg-icons` |
| Folder | `faFolder` | `@fortawesome/free-solid-svg-icons` |
| File | `faFile` | `@fortawesome/free-solid-svg-icons` |

### Symmetry & Transformation
| Purpose | Icon | Import |
|---------|------|--------|
| Rotate / Refresh | `faRotate` | `@fortawesome/free-solid-svg-icons` |
| Horizontal symmetry | `faArrowsLeftRight` | `@fortawesome/free-solid-svg-icons` |
| Vertical symmetry | `faArrowsUpDown` | `@fortawesome/free-solid-svg-icons` |
| Expand | `faExpand` | `@fortawesome/free-solid-svg-icons` |

### Media Controls
| Purpose | Icon | Import |
|---------|------|--------|
| Play | `faPlay` | `@fortawesome/free-solid-svg-icons` |
| Stop | `faStop` | `@fortawesome/free-solid-svg-icons` |
| Pause | `faPause` | `@fortawesome/free-solid-svg-icons` |

### Shapes (Outline versions)
| Purpose | Icon | Import |
|---------|------|--------|
| Circle outline | `faCircle` | `@fortawesome/free-regular-svg-icons` |
| Square outline | `faSquare` | `@fortawesome/free-regular-svg-icons` |

## Guidelines

1. **Consistency**: Always use the same icon for the same purpose across the application
2. **Import**: Import only the specific icons needed in each component to optimize bundle size
3. **Size**: Use CSS or the `size` prop to adjust icon size: `<FontAwesomeIcon icon={faIcon} size="lg" />`
4. **Color**: Icons inherit color from parent text color. Use CSS classes for custom colors
5. **Accessibility**: Always provide context (aria-label, title, or surrounding text) for icon-only buttons
6. **Solid vs Regular**: Use solid (`free-solid-svg-icons`) by default. Use regular (`free-regular-svg-icons`) for outlined/hollow versions

## Common Patterns

### Icon Button
```tsx
<button onClick={handleClick} title="Delete">
  <FontAwesomeIcon icon={faTrash} />
</button>
```

### Icon with Text
```tsx
<button>
  <FontAwesomeIcon icon={faPlus} /> Add Point
</button>
```

### Conditional Icons
```tsx
<FontAwesomeIcon icon={isVisible ? faEye : faEyeSlash} />
```

### Styled Icons
```tsx
<FontAwesomeIcon
  icon={faCheck}
  style={{ color: 'green' }}
/>
```

## Legacy UTF-8 Characters

Some UTF-8 characters remain for specific cases:
- `×` - Multiplication symbol in mathematical contexts (e.g., "1920×1080")
- Mirror emoji `🪞` - No suitable Font Awesome alternative
- `💡` - Lightbulb for tips (decorative only)

These should be used sparingly and only where appropriate.