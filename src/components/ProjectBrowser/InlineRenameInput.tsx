import React from 'react'

interface InlineRenameInputProps {
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export const InlineRenameInput: React.FC<InlineRenameInputProps> = ({ value, onChange, onConfirm, onCancel }) => {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') onConfirm()
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={onConfirm}
      autoFocus
      onClick={e => e.stopPropagation()}
    />
  )
}
