// Project template system
import { Project, Constraint, WorldPoint, ProjectImage } from '../types/project'

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  category: 'Architecture' | 'Industrial' | 'Archaeological' | 'Cultural Heritage' | 'Mapping' | 'General'
  thumbnail?: string
  tags: string[]
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  estimatedTime: string
  requirements: {
    minImages: number
    recommendedImages: number
    specialEquipment?: string[]
    skillLevel: string
  }
  setup: {
    defaultConstraints: Omit<Constraint, 'id' | 'enabled'>[]
    recommendedCameraSettings: {
      overlap: number
      resolution: string
      focusMode: string
      exposureMode: string
    }
    shootingPattern: string
    guidelines: string[]
  }
  project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'nextWpNumber' | 'settings' | 'optimization' | 'history'>
}

export class ProjectTemplateService {
  // Get all available templates
  static getTemplates(): ProjectTemplate[] {
    return [
      {
        id: 'architectural-facade',
        name: 'Architectural Facade Documentation',
        description: 'Comprehensive facade documentation for heritage buildings and architectural analysis',
        category: 'Architecture',
        tags: ['facade', 'heritage', 'documentation', 'orthophoto'],
        difficulty: 'Intermediate',
        estimatedTime: '2-4 hours',
        requirements: {
          minImages: 20,
          recommendedImages: 40,
          specialEquipment: ['Tripod', 'Wide-angle lens'],
          skillLevel: 'Basic photography knowledge required'
        },
        setup: {
          defaultConstraints: [
            {
              type: 'parallel',
              pointIds: [],
              tolerance: 0.01,
              weight: 1.0,
              name: 'Horizontal Lines'
            },
            {
              type: 'perpendicular',
              pointIds: [],
              tolerance: 0.01,
              weight: 1.0,
              name: 'Vertical to Horizontal'
            }
          ],
          recommendedCameraSettings: {
            overlap: 80,
            resolution: '24MP or higher',
            focusMode: 'Manual',
            exposureMode: 'Manual'
          },
          shootingPattern: 'Systematic grid with 80% overlap',
          guidelines: [
            'Use a tripod for consistent height',
            'Maintain parallel camera orientation to facade',
            'Ensure even lighting conditions',
            'Capture detail shots of architectural elements',
            'Include scale references (measuring tape, coins)'
          ]
        },
        project: {
          name: 'Facade Documentation',
          worldPoints: {},
          images: {},
          constraints: [],
          cameras: {},
          pointGroups: {
            'corners': {
              name: 'Building Corners',
              color: '#FF6B6B',
              visible: true,
              points: []
            },
            'features': {
              name: 'Architectural Features',
              color: '#4ECDC4',
              visible: true,
              points: []
            },
            'reference': {
              name: 'Reference Points',
              color: '#45B7D1',
              visible: true,
              points: []
            }
          }
        }
      },
      {
        id: 'object-360',
        name: '360° Object Documentation',
        description: 'Complete 360-degree documentation of cultural heritage objects and artifacts',
        category: 'Cultural Heritage',
        tags: ['object', '360', 'artifact', 'museum', 'heritage'],
        difficulty: 'Beginner',
        estimatedTime: '1-2 hours',
        requirements: {
          minImages: 24,
          recommendedImages: 48,
          specialEquipment: ['Turntable', 'Controlled lighting'],
          skillLevel: 'Basic setup required'
        },
        setup: {
          defaultConstraints: [
            {
              type: 'distance',
              pointIds: [],
              distance: 0,
              tolerance: 0.001,
              weight: 1.0,
              name: 'Reference Distance'
            }
          ],
          recommendedCameraSettings: {
            overlap: 70,
            resolution: '16MP or higher',
            focusMode: 'Manual',
            exposureMode: 'Manual'
          },
          shootingPattern: 'Circular pattern with vertical variations',
          guidelines: [
            'Use controlled lighting setup',
            'Place object on turntable',
            'Capture every 15° around object',
            'Include top and bottom views',
            'Add scale reference objects'
          ]
        },
        project: {
          name: '360° Object Scan',
          worldPoints: {},
          images: {},
          constraints: [],
          cameras: {},
          pointGroups: {
            'outline': {
              name: 'Object Outline',
              color: '#FF6B6B',
              visible: true,
              points: []
            },
            'details': {
              name: 'Detail Features',
              color: '#4ECDC4',
              visible: true,
              points: []
            }
          }
        }
      },
      {
        id: 'industrial-inspection',
        name: 'Industrial Equipment Inspection',
        description: 'Detailed documentation for industrial equipment maintenance and inspection',
        category: 'Industrial',
        tags: ['industrial', 'inspection', 'maintenance', 'equipment'],
        difficulty: 'Advanced',
        estimatedTime: '4-8 hours',
        requirements: {
          minImages: 50,
          recommendedImages: 100,
          specialEquipment: ['Safety equipment', 'Drone (optional)', 'High-res camera'],
          skillLevel: 'Professional experience recommended'
        },
        setup: {
          defaultConstraints: [
            {
              type: 'parallel',
              pointIds: [],
              tolerance: 0.005,
              weight: 1.0,
              name: 'Structural Parallel Lines'
            },
            {
              type: 'distance',
              pointIds: [],
              distance: 0,
              tolerance: 0.001,
              weight: 1.0,
              name: 'Critical Measurements'
            }
          ],
          recommendedCameraSettings: {
            overlap: 75,
            resolution: '24MP or higher',
            focusMode: 'Manual',
            exposureMode: 'Manual'
          },
          shootingPattern: 'Multi-angle comprehensive coverage',
          guidelines: [
            'Follow all safety protocols',
            'Document all accessible surfaces',
            'Include close-ups of wear points',
            'Capture serial numbers and labels',
            'Use proper lighting for shadow areas'
          ]
        },
        project: {
          name: 'Equipment Inspection',
          worldPoints: {},
          images: {},
          constraints: [],
          cameras: {},
          pointGroups: {
            'structure': {
              name: 'Main Structure',
              color: '#FF6B6B',
              visible: true,
              points: []
            },
            'components': {
              name: 'Components',
              color: '#4ECDC4',
              visible: true,
              points: []
            },
            'defects': {
              name: 'Defects/Wear',
              color: '#FFA726',
              visible: true,
              points: []
            }
          }
        }
      },
      {
        id: 'archaeological-site',
        name: 'Archaeological Site Documentation',
        description: 'Systematic documentation of archaeological excavations and findings',
        category: 'Archaeological',
        tags: ['archaeology', 'excavation', 'documentation', 'site'],
        difficulty: 'Intermediate',
        estimatedTime: '3-6 hours',
        requirements: {
          minImages: 30,
          recommendedImages: 60,
          specialEquipment: ['Survey equipment', 'Measuring tape', 'North arrow'],
          skillLevel: 'Archaeological methods knowledge'
        },
        setup: {
          defaultConstraints: [
            {
              type: 'distance',
              pointIds: [],
              distance: 1.0,
              tolerance: 0.001,
              weight: 1.0,
              name: 'Survey Grid'
            },
            {
              type: 'parallel',
              pointIds: [],
              tolerance: 0.01,
              weight: 1.0,
              name: 'Grid Lines'
            }
          ],
          recommendedCameraSettings: {
            overlap: 85,
            resolution: '24MP or higher',
            focusMode: 'Manual',
            exposureMode: 'Manual'
          },
          shootingPattern: 'Systematic grid with high overlap',
          guidelines: [
            'Establish survey grid system',
            'Include scale and north arrow',
            'Document before/after excavation',
            'Capture stratigraphic relationships',
            'Maintain consistent lighting'
          ]
        },
        project: {
          name: 'Archaeological Documentation',
          worldPoints: {},
          images: {},
          constraints: [],
          cameras: {},
          pointGroups: {
            'grid': {
              name: 'Survey Grid',
              color: '#FF6B6B',
              visible: true,
              points: []
            },
            'features': {
              name: 'Archaeological Features',
              color: '#4ECDC4',
              visible: true,
              points: []
            },
            'finds': {
              name: 'Artifact Locations',
              color: '#45B7D1',
              visible: true,
              points: []
            }
          }
        }
      },
      {
        id: 'mapping-terrain',
        name: 'Terrain Mapping',
        description: 'Large-scale terrain and topographic mapping using photogrammetry',
        category: 'Mapping',
        tags: ['mapping', 'terrain', 'topography', 'landscape'],
        difficulty: 'Advanced',
        estimatedTime: '6-12 hours',
        requirements: {
          minImages: 100,
          recommendedImages: 200,
          specialEquipment: ['Drone', 'GPS equipment', 'Ground control points'],
          skillLevel: 'Surveying experience required'
        },
        setup: {
          defaultConstraints: [
            {
              type: 'distance',
              pointIds: [],
              distance: 0,
              tolerance: 0.01,
              weight: 1.0,
              name: 'Ground Control Distances'
            }
          ],
          recommendedCameraSettings: {
            overlap: 80,
            resolution: '20MP or higher',
            focusMode: 'Infinity',
            exposureMode: 'Auto'
          },
          shootingPattern: 'Systematic flight pattern with cross-strips',
          guidelines: [
            'Establish GPS ground control points',
            'Plan systematic flight pattern',
            'Maintain consistent altitude',
            'Consider wind and lighting conditions',
            'Include cross-strip images for accuracy'
          ]
        },
        project: {
          name: 'Terrain Map',
          worldPoints: {},
          images: {},
          constraints: [],
          cameras: {},
          pointGroups: {
            'gcp': {
              name: 'Ground Control Points',
              color: '#FF6B6B',
              visible: true,
              points: []
            },
            'features': {
              name: 'Terrain Features',
              color: '#4ECDC4',
              visible: true,
              points: []
            }
          }
        }
      },
      {
        id: 'general-object',
        name: 'General Object Documentation',
        description: 'Versatile template for documenting various objects and structures',
        category: 'General',
        tags: ['general', 'documentation', 'versatile', 'object'],
        difficulty: 'Beginner',
        estimatedTime: '1-3 hours',
        requirements: {
          minImages: 15,
          recommendedImages: 30,
          specialEquipment: ['Basic camera'],
          skillLevel: 'No special skills required'
        },
        setup: {
          defaultConstraints: [],
          recommendedCameraSettings: {
            overlap: 70,
            resolution: '12MP or higher',
            focusMode: 'Auto',
            exposureMode: 'Auto'
          },
          shootingPattern: 'Free-form with adequate coverage',
          guidelines: [
            'Ensure good lighting conditions',
            'Capture all important angles',
            'Include scale reference if needed',
            'Maintain sharp focus',
            'Avoid motion blur'
          ]
        },
        project: {
          name: 'General Documentation',
          worldPoints: {},
          images: {},
          constraints: [],
          cameras: {},
          pointGroups: {
            'main': {
              name: 'Main Features',
              color: '#FF6B6B',
              visible: true,
              points: []
            }
          }
        }
      }
    ]
  }

  // Get templates by category
  static getTemplatesByCategory(category: string): ProjectTemplate[] {
    return this.getTemplates().filter(template => template.category === category)
  }

  // Get template by ID
  static getTemplateById(id: string): ProjectTemplate | null {
    return this.getTemplates().find(template => template.id === id) || null
  }

  // Search templates
  static searchTemplates(query: string): ProjectTemplate[] {
    const lowerQuery = query.toLowerCase()
    return this.getTemplates().filter(template =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery) ||
      template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    )
  }

  // Create project from template
  static createProjectFromTemplate(template: ProjectTemplate, customName?: string): Project {
    const projectId = crypto.randomUUID()
    const now = new Date().toISOString()

    // Create constraints with unique IDs and enabled state
    const constraints: Constraint[] = template.setup.defaultConstraints.map(constraint => ({
      id: crypto.randomUUID(),
      type: constraint.type,
      enabled: true,
      ...constraint
    }))

    return {
      id: projectId,
      name: customName || template.project.name,
      createdAt: now,
      updatedAt: now,
      worldPoints: {},
      images: {},
      constraints,
      cameras: {},
      coordinateSystem: undefined,
      pointGroups: template.project.pointGroups,
      nextWpNumber: 1,
      settings: {
        showPointNames: true,
        autoSave: true,
        theme: 'dark' as const,
        measurementUnits: 'meters' as const,
        precisionDigits: 3,
        showConstraintGlyphs: true,
        showMeasurements: true,
        autoOptimize: false,
        gridVisible: true,
        snapToGrid: false
      },
      optimization: {
        status: 'not_run' as const
      },
      history: []
    }
  }

  // Get template categories
  static getCategories(): string[] {
    const templates = this.getTemplates()
    return Array.from(new Set(templates.map(t => t.category))).sort()
  }

  // Get template difficulty levels
  static getDifficultyLevels(): string[] {
    return ['Beginner', 'Intermediate', 'Advanced']
  }

  // Filter templates
  static filterTemplates(filters: {
    category?: string
    difficulty?: string
    tags?: string[]
    maxTime?: number
  }): ProjectTemplate[] {
    let templates = this.getTemplates()

    if (filters.category) {
      templates = templates.filter(t => t.category === filters.category)
    }

    if (filters.difficulty) {
      templates = templates.filter(t => t.difficulty === filters.difficulty)
    }

    if (filters.tags && filters.tags.length > 0) {
      templates = templates.filter(t =>
        filters.tags!.some(tag => t.tags.includes(tag))
      )
    }

    if (filters.maxTime) {
      templates = templates.filter(t => {
        const timeStr = t.estimatedTime
        const hours = parseInt(timeStr.match(/(\d+)-?\d*\s*hours?/)?.[1] || '0')
        return hours <= filters.maxTime!
      })
    }

    return templates
  }

  // Get popular tags
  static getPopularTags(): { tag: string; count: number }[] {
    const tagCounts: Record<string, number> = {}

    this.getTemplates().forEach(template => {
      template.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      })
    })

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
  }

  // Validate template
  static validateTemplate(template: ProjectTemplate): string[] {
    const errors: string[] = []

    if (!template.id || !template.name) {
      errors.push('Template must have ID and name')
    }

    if (!template.description) {
      errors.push('Template must have description')
    }

    if (!['Architecture', 'Industrial', 'Archaeological', 'Cultural Heritage', 'Mapping', 'General'].includes(template.category)) {
      errors.push('Invalid category')
    }

    if (!['Beginner', 'Intermediate', 'Advanced'].includes(template.difficulty)) {
      errors.push('Invalid difficulty level')
    }

    if (template.requirements.minImages < 1) {
      errors.push('Minimum images must be at least 1')
    }

    if (template.requirements.recommendedImages < template.requirements.minImages) {
      errors.push('Recommended images must be at least minimum images')
    }

    return errors
  }
}

export default ProjectTemplateService