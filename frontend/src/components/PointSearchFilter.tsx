// Search and filter component for world points

import React, { useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { WorldPoint, Constraint } from '../types/project'
import { getConstraintPointIds } from '../types/utils'

interface PointSearchFilterProps {
  worldPoints: Record<string, WorldPoint>
  constraints: Constraint[]
  currentImageId: string | null
  onPointSelect: (pointId: string) => void
  onPointHighlight: (pointId: string | null) => void
  onFilteredPointsChange: (pointIds: string[]) => void
}

export const PointSearchFilter: React.FC<PointSearchFilterProps> = ({
  worldPoints,
  constraints,
  currentImageId,
  onPointSelect,
  onPointHighlight,
  onFilteredPointsChange
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({
    hasConstraints: false,
    inCurrentImage: false,
    isOrigin: false,
    hasXYZ: false,
    group: 'all'
  })
  const [sortBy, setSortBy] = useState<'name' | 'images' | 'constraints'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Get constraint count for each point
  const getConstraintCount = (pointId: string) => {
    return constraints.filter(constraint => {
      return getConstraintPointIds(constraint).includes(pointId)
    }).length
  }

  // Filter and search points
  const filteredPoints = useMemo(() => {
    let points = Object.values(worldPoints)

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      points = points.filter(wp =>
        wp.name.toLowerCase().includes(query) ||
        wp.id.toLowerCase().includes(query) ||
        (wp.tags && wp.tags.some(tag => tag.toLowerCase().includes(query)))
      )
    }

    // Apply filters
    if (filters.hasConstraints) {
      points = points.filter(wp => getConstraintCount(wp.id) > 0)
    }

    if (filters.inCurrentImage && currentImageId) {
      points = points.filter(wp =>
        wp.imagePoints.some(ip => ip.imageId === currentImageId)
      )
    }

    if (filters.isOrigin) {
      points = points.filter(wp => wp.isOrigin)
    }

    if (filters.hasXYZ) {
      points = points.filter(wp => wp.xyz !== undefined)
    }

    if (filters.group !== 'all') {
      points = points.filter(wp => wp.group === filters.group)
    }

    // Sort points
    points.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'images':
          comparison = a.imagePoints.length - b.imagePoints.length
          break
        case 'constraints':
          comparison = getConstraintCount(a.id) - getConstraintCount(b.id)
          break
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return points
  }, [worldPoints, searchQuery, filters, sortBy, sortOrder, constraints, currentImageId])

  // Update parent component with filtered point IDs
  React.useEffect(() => {
    onFilteredPointsChange(filteredPoints.map(wp => wp.id))
  }, [filteredPoints, onFilteredPointsChange])

  // Get unique groups
  const availableGroups = useMemo(() => {
    const groups = new Set<string>()
    Object.values(worldPoints).forEach(wp => {
      if (wp.group) groups.add(wp.group)
    })
    return Array.from(groups).sort()
  }, [worldPoints])

  const handleFilterChange = (filterKey: string, value: any) => {
    setFilters(prev => ({ ...prev, [filterKey]: value }))
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilters({
      hasConstraints: false,
      inCurrentImage: false,
      isOrigin: false,
      hasXYZ: false,
      group: 'all'
    })
  }

  const activeFilterCount = Object.values(filters).filter(value =>
    typeof value === 'boolean' ? value : value !== 'all'
  ).length

  return (
    <div className="point-search-filter">
      <div className="search-section">
        <div className="search-input-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search points by name, ID, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="search-icon"><FontAwesomeIcon icon={faMagnifyingGlass} /></div>
        </div>
        <div className="search-stats">
          {filteredPoints.length} of {Object.keys(worldPoints).length} points
          {activeFilterCount > 0 && (
            <button className="clear-filters-btn" onClick={clearFilters}>
              Clear {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} ✕
            </button>
          )}
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-row">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.hasConstraints}
              onChange={(e) => handleFilterChange('hasConstraints', e.target.checked)}
            />
            <span>Has constraints</span>
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.inCurrentImage}
              onChange={(e) => handleFilterChange('inCurrentImage', e.target.checked)}
            />
            <span>In current image</span>
          </label>
        </div>
        <div className="filter-row">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.isOrigin}
              onChange={(e) => handleFilterChange('isOrigin', e.target.checked)}
            />
            <span>Origin point</span>
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.hasXYZ}
              onChange={(e) => handleFilterChange('hasXYZ', e.target.checked)}
            />
            <span>Has 3D coordinates</span>
          </label>
        </div>
        {availableGroups.length > 0 && (
          <div className="filter-row">
            <label className="filter-select">
              <span>Group:</span>
              <select
                value={filters.group}
                onChange={(e) => handleFilterChange('group', e.target.value)}
              >
                <option value="all">All groups</option>
                {availableGroups.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="sort-section">
        <label className="sort-control">
          <span>Sort by:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="name">Name</option>
            <option value="images">Image count</option>
            <option value="constraints">Constraint count</option>
          </select>
        </label>
        <button
          className={`sort-order-btn ${sortOrder}`}
          onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
          title={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      <div className="points-list">
        {filteredPoints.map(wp => {
          const constraintCount = getConstraintCount(wp.id)
          const inCurrentImage = currentImageId ?
            wp.imagePoints.some(ip => ip.imageId === currentImageId) : false

          return (
            <div
              key={wp.id}
              className="point-item"
              onMouseEnter={() => onPointHighlight(wp.id)}
              onMouseLeave={() => onPointHighlight(null)}
              onClick={() => onPointSelect(wp.id)}
            >
              <div className="point-main">
                <div className="point-color" style={{ backgroundColor: wp.color }} />
                <div className="point-info">
                  <div className="point-name">
                    {wp.name}
                    {wp.isOrigin && <span className="origin-badge">📌</span>}
                    {wp.isLocked && <span className="locked-badge">🔒</span>}
                  </div>
                  <div className="point-details">
                    <span className="detail-item">
                      {wp.imagePoints.length} img{wp.imagePoints.length !== 1 ? 's' : ''}
                    </span>
                    {constraintCount > 0 && (
                      <span className="detail-item">
                        {constraintCount} constraint{constraintCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {!inCurrentImage && currentImageId && (
                      <span className="detail-item missing">not in current</span>
                    )}
                  </div>
                </div>
              </div>
              {wp.xyz && (
                <div className="point-coords">
                  ({wp.xyz[0].toFixed(2)}, {wp.xyz[1].toFixed(2)}, {wp.xyz[2].toFixed(2)})
                </div>
              )}
              {wp.tags && wp.tags.length > 0 && (
                <div className="point-tags">
                  {wp.tags.map(tag => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filteredPoints.length === 0 && (
        <div className="no-results">
          <div className="no-results-icon"><FontAwesomeIcon icon={faMagnifyingGlass} /></div>
          <div className="no-results-text">
            {searchQuery || activeFilterCount > 0
              ? 'No points match your search or filters'
              : 'No world points yet'
            }
          </div>
          {(searchQuery || activeFilterCount > 0) && (
            <button className="clear-search-btn" onClick={clearFilters}>
              Clear search and filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}


export default PointSearchFilter