import { useEffect, useRef } from 'react'
import type { MouseEvent, PointerEvent, ReactNode } from 'react'

export function Modal({ label, title, closeLabel, onClose, actions, className = '', children }: {
  label: string; title: ReactNode; closeLabel: string; onClose: () => void
  actions?: ReactNode; className?: string; children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const pressedOutside = useRef(false)
  useEffect(() => {
    const panel = dialog.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel?.showModal()
    return () => {
      panel?.close()
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
      else document.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    }
  }, [])
  function outside(event: MouseEvent<HTMLDialogElement> | PointerEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return false
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom
  }
  return <dialog ref={dialog} aria-label={label} className={`app-modal ${className}`} onCancel={(event) => { event.preventDefault(); onClose() }}
    onPointerDown={(event) => { pressedOutside.current = event.isPrimary && event.button === 0 && outside(event) }}
    onPointerCancel={() => { pressedOutside.current = false }}
    onClick={(event) => { const dismiss = pressedOutside.current && outside(event); pressedOutside.current = false; if (dismiss) onClose() }}>
    <header className="modal-header"><div className="modal-title">{title}</div><div className="modal-actions">{actions}<button className="icon-button" autoFocus aria-label={closeLabel} onClick={onClose}><Icon name="close" /></button></div></header>
    {children}
  </dialog>
}

export function Icon({ name, filled = false }: { name: 'heart' | 'edit' | 'save' | 'close' | 'grid' | 'rows' | 'refresh' | 'check' | 'play' | 'pause'; filled?: boolean }) {
  const paths = {
    play: 'M7 4L21 12L7 20Z',
    pause: 'M6 4H10V20H6ZM14 4H18V20H14Z',
    heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    edit: 'M15 4L20 9M4 15L15 4a3.5 3.5 0 0 1 5 5L9 20L3 21Z',
    save: 'M5 3H17L21 7V21H3V3ZM7 3V9H16V3M7 21V14H17V21',
    close: 'M6 6L18 18M6 18L18 6',
    grid: 'M3 3H9V9H3ZM15 3H21V9H15ZM3 15H9V21H3ZM15 15H21V21H15Z',
    rows: 'M3 4H9V10H3ZM12 5H21M12 9H21M3 14H9V20H3ZM12 15H21M12 19H21',
    check: 'M5 12L10 17L20 6',
    refresh: 'M20 8a8 8 0 1 0 0 8M20 2V8H14',
  }
  return <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" data-icon={name}><path d={paths[name]} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
}
