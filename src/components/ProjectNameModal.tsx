import React, { useState, useEffect, useRef } from 'react'

interface ProjectNameModalProps {
  isOpen: boolean
  onSubmit: (name: string) => void
  onCancel: () => void
  title?: string
  initialValue?: string
  submitLabel?: string
}

export const ProjectNameModal: React.FC<ProjectNameModalProps> = ({
  isOpen,
  onSubmit,
  onCancel,
  title = 'New Project',
  initialValue = '',
  submitLabel = 'Create'
}) => {
  const [name, setName] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setName(initialValue)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen, initialValue])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter project name..."
            className="modal-input"
          />
          <div className="modal-actions">
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim()} className="btn-primary">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
