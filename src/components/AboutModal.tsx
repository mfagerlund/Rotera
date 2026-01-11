import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import aboutContent from '../docs/about.md?raw'

interface AboutModalProps {
  isVisible: boolean
  onClose: () => void
}

export const AboutModal: React.FC<AboutModalProps> = ({ isVisible, onClose }) => {
  if (!isVisible) return null

  return (
    <div className="about-modal__overlay" onClick={onClose}>
      <div className="about-modal" onClick={e => e.stopPropagation()}>
        <button className="about-modal__close" onClick={onClose}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <div className="about-modal__content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ src, alt }) => {
                // Handle relative paths for screenshots
                // In production these would be served from public/ or bundled
                return (
                  <div className="about-modal__image-placeholder">
                    <span>{alt || 'Screenshot'}</span>
                    <small>{src}</small>
                  </div>
                )
              },
              table: ({ children }) => (
                <table className="about-modal__table">{children}</table>
              ),
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              )
            }}
          >
            {aboutContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
