// Validation panel for constraint checking and system analysis

import React, { useState, useCallback, useMemo } from 'react'
import { Project, WorldPoint, Constraint } from '../types/project'
import { ConstraintValidator, ValidationResult, ValidationError, ValidationWarning, ValidationSuggestion } from '../services/validation'

interface ValidationPanelProps {
  project: Project
  onConstraintSelect: (constraintId: string) => void
  onPointSelect: (pointId: string) => void
  onValidationRun: () => void
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  project,
  onConstraintSelect,
  onPointSelect,
  onValidationRun
}) => {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [tolerance, setTolerance] = useState(1e-6)
  const [autoValidate, setAutoValidate] = useState(true)
  const [showDetails, setShowDetails] = useState(true)
  const [filterLevel, setFilterLevel] = useState<'all' | 'critical' | 'high' | 'medium'>('all')

  // Run validation
  const runValidation = useCallback(async () => {
    if (isValidating) return

    setIsValidating(true)
    onValidationRun()

    try {
      // Simulate async validation for large datasets
      await new Promise(resolve => setTimeout(resolve, 100))

      const validator = new ConstraintValidator(
        project.worldPoints,
        project.constraints || [],
        tolerance
      )

      const result = validator.validate()
      setValidationResult(result)

    } catch (error) {
      console.error('Validation failed:', error)
      setValidationResult({
        isValid: false,
        errors: [{
          id: crypto.randomUUID(),
          type: 'error',
          severity: 'critical',
          message: 'Validation failed',
          description: error.message || 'Unknown validation error'
        }],
        warnings: [],
        suggestions: []
      })
    } finally {
      setIsValidating(false)
    }
  }, [project.worldPoints, project.constraints, tolerance, isValidating, onValidationRun])

  // Auto-validation when project changes
  React.useEffect(() => {
    if (autoValidate && project.constraints && project.constraints.length > 0) {
      runValidation()
    }
  }, [autoValidate, project.constraints, project.worldPoints, runValidation])

  // Filter validation results by severity
  const filteredErrors = useMemo(() => {
    if (!validationResult) return []

    return validationResult.errors.filter(error => {
      if (filterLevel === 'all') return true
      if (filterLevel === 'critical') return error.severity === 'critical'
      if (filterLevel === 'high') return ['critical', 'high'].includes(error.severity)
      if (filterLevel === 'medium') return ['critical', 'high', 'medium'].includes(error.severity)
      return true
    })
  }, [validationResult, filterLevel])

  // Get validation summary
  const getValidationSummary = useCallback(() => {
    if (!validationResult) return null

    const criticalErrors = validationResult.errors.filter(e => e.severity === 'critical').length
    const highErrors = validationResult.errors.filter(e => e.severity === 'high').length
    const mediumErrors = validationResult.errors.filter(e => e.severity === 'medium').length
    const warnings = validationResult.warnings.length
    const suggestions = validationResult.suggestions.length

    return {
      isValid: validationResult.isValid,
      criticalErrors,
      highErrors,
      mediumErrors,
      warnings,
      suggestions,
      totalIssues: criticalErrors + highErrors + mediumErrors + warnings
    }
  }, [validationResult])

  const summary = getValidationSummary()

  const handleItemClick = useCallback((error: ValidationError | ValidationWarning) => {
    if (error.constraintId) {
      onConstraintSelect(error.constraintId)
    } else if (error.pointIds && error.pointIds.length > 0) {
      onPointSelect(error.pointIds[0])
    }
  }, [onConstraintSelect, onPointSelect])

  const getItemIcon = useCallback((item: ValidationError | ValidationWarning | ValidationSuggestion) => {
    if (item.type === 'error') {
      const error = item as ValidationError
      switch (error.severity) {
        case 'critical': return '🔴'
        case 'high': return '🟠'
        case 'medium': return '🟡'
        default: return '⚠️'
      }
    } else if (item.type === 'warning') {
      return '⚠️'
    } else {
      const suggestion = item as ValidationSuggestion
      switch (suggestion.category) {
        case 'performance': return '⚡'
        case 'accuracy': return '🎯'
        case 'completeness': return '📝'
        default: return '💡'
      }
    }
  }, [])

  const getSeverityColor = useCallback((severity: string) => {
    switch (severity) {
      case 'critical': return 'var(--error-color)'
      case 'high': return 'var(--warning-color)'
      case 'medium': return 'var(--accent-color)'
      default: return 'var(--text-secondary)'
    }
  }, [])

  return (
    <div className="validation-panel">
      <div className="panel-header">
        <h3>Constraint Validation</h3>
        <div className="validation-controls">
          <label className="auto-validate-toggle">
            <input
              type="checkbox"
              checked={autoValidate}
              onChange={(e) => setAutoValidate(e.target.checked)}
            />
            <span>Auto-validate</span>
          </label>
          <button
            className="validate-btn"
            onClick={runValidation}
            disabled={isValidating || (project.constraints?.length || 0) === 0}
          >
            {isValidating ? '🔄' : '✓'} Validate
          </button>
        </div>
      </div>

      <div className="validation-settings">
        <div className="setting-row">
          <label>
            <span>Tolerance:</span>
            <input
              type="number"
              step="1e-9"
              min="1e-12"
              max="1e-3"
              value={tolerance}
              onChange={(e) => setTolerance(parseFloat(e.target.value))}
            />
          </label>
          <label>
            <span>Filter:</span>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value as any)}
            >
              <option value="all">All issues</option>
              <option value="critical">Critical only</option>
              <option value="high">High + Critical</option>
              <option value="medium">Medium + High + Critical</option>
            </select>
          </label>
        </div>
      </div>

      {summary && (
        <div className={`validation-summary ${summary.isValid ? 'valid' : 'invalid'}`}>
          <div className="summary-header">
            <span className="summary-status">
              {summary.isValid ? '✅' : '❌'} {summary.isValid ? 'Valid' : 'Issues Found'}
            </span>
            <button
              className="details-toggle"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? '▼' : '▶'} Details
            </button>
          </div>

          {showDetails && (
            <div className="summary-stats">
              {summary.criticalErrors > 0 && (
                <div className="stat-item critical">
                  <span>🔴 Critical:</span>
                  <span>{summary.criticalErrors}</span>
                </div>
              )}
              {summary.highErrors > 0 && (
                <div className="stat-item high">
                  <span>🟠 High:</span>
                  <span>{summary.highErrors}</span>
                </div>
              )}
              {summary.mediumErrors > 0 && (
                <div className="stat-item medium">
                  <span>🟡 Medium:</span>
                  <span>{summary.mediumErrors}</span>
                </div>
              )}
              {summary.warnings > 0 && (
                <div className="stat-item warning">
                  <span>⚠️ Warnings:</span>
                  <span>{summary.warnings}</span>
                </div>
              )}
              {summary.suggestions > 0 && (
                <div className="stat-item suggestion">
                  <span>💡 Suggestions:</span>
                  <span>{summary.suggestions}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isValidating && (
        <div className="validation-progress">
          <div className="progress-spinner">🔄</div>
          <span>Validating constraints...</span>
        </div>
      )}

      {validationResult && !isValidating && (
        <div className="validation-results">
          {filteredErrors.length > 0 && (
            <div className="results-section">
              <h4>Errors ({filteredErrors.length})</h4>
              <div className="results-list">
                {filteredErrors.map(error => (
                  <div
                    key={error.id}
                    className="result-item error"
                    onClick={() => handleItemClick(error)}
                    style={{ borderLeftColor: getSeverityColor(error.severity) }}
                  >
                    <div className="item-header">
                      <span className="item-icon">{getItemIcon(error)}</span>
                      <span className="item-title">{error.message}</span>
                      <span className="item-severity">{error.severity}</span>
                    </div>
                    <div className="item-description">{error.description}</div>
                    {error.fixSuggestion && (
                      <div className="item-suggestion">
                        <strong>Fix:</strong> {error.fixSuggestion}
                      </div>
                    )}
                    {error.pointIds && error.pointIds.length > 0 && (
                      <div className="item-points">
                        Points: {error.pointIds.map(id => project.worldPoints[id]?.name || id).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {validationResult.warnings.length > 0 && (
            <div className="results-section">
              <h4>Warnings ({validationResult.warnings.length})</h4>
              <div className="results-list">
                {validationResult.warnings.map(warning => (
                  <div
                    key={warning.id}
                    className="result-item warning"
                    onClick={() => handleItemClick(warning)}
                  >
                    <div className="item-header">
                      <span className="item-icon">{getItemIcon(warning)}</span>
                      <span className="item-title">{warning.message}</span>
                    </div>
                    <div className="item-description">{warning.description}</div>
                    {warning.recommendation && (
                      <div className="item-recommendation">
                        <strong>Recommendation:</strong> {warning.recommendation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {validationResult.suggestions.length > 0 && (
            <div className="results-section">
              <h4>Suggestions ({validationResult.suggestions.length})</h4>
              <div className="results-list">
                {validationResult.suggestions.map(suggestion => (
                  <div key={suggestion.id} className="result-item suggestion">
                    <div className="item-header">
                      <span className="item-icon">{getItemIcon(suggestion)}</span>
                      <span className="item-title">{suggestion.message}</span>
                      <span className="item-category">{suggestion.category}</span>
                    </div>
                    <div className="item-description">{suggestion.description}</div>
                    {suggestion.action && (
                      <div className="item-action">
                        <strong>Action:</strong> {suggestion.action}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredErrors.length === 0 && validationResult.warnings.length === 0 && validationResult.suggestions.length === 0 && (
            <div className="no-issues">
              <div className="no-issues-icon">✅</div>
              <div className="no-issues-text">No validation issues found</div>
              <div className="no-issues-description">
                All constraints are satisfied within the specified tolerance
              </div>
            </div>
          )}
        </div>
      )}

      {!validationResult && !isValidating && (project.constraints?.length || 0) === 0 && (
        <div className="no-constraints">
          <div className="no-constraints-icon">📏</div>
          <div className="no-constraints-text">No constraints to validate</div>
          <div className="no-constraints-description">
            Add constraints to enable validation
          </div>
        </div>
      )}
    </div>
  )
}

export default ValidationPanel