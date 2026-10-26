import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'

export type ModalClose = (force?: boolean) => void

/** Keep the native modal and focus lock alive until the exit animation commits. */
export function useModalLifecycle(onClose: () => void, canClose?: () => boolean, closeRef?: Ref<ModalClose>) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [phase, setPhase] = useState('opening')
  const phaseRef = useRef('opening')
  const animation = useRef<Animation | null>(null)
  const callbacks = useRef({ onClose, canClose })
  useLayoutEffect(() => { callbacks.current = { onClose, canClose } }, [onClose, canClose])

  const animate = useCallback((closing: boolean) => {
    const panel = dialog.current
    if (!panel) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const current = getComputedStyle(panel)
    const from = closing ? { opacity: current.opacity, transform: reduced ? 'none' : current.transform } : { opacity: '0', transform: reduced ? 'none' : 'translateY(8px)' }
    animation.current?.cancel()
    phaseRef.current = closing ? 'closing' : 'opening'
    setPhase(phaseRef.current)
    const next = panel.animate([from, { opacity: closing ? '0' : '1', transform: closing && !reduced ? 'translateY(8px)' : 'none' }], {
      duration: reduced ? closing ? 60 : 80 : closing ? 140 : 180,
      easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both',
    })
    animation.current = next
    next.onfinish = () => {
      if (animation.current !== next) return
      if (closing) callbacks.current.onClose()
      else {
        phaseRef.current = 'open'; setPhase('open')
        animation.current = null; next.cancel()
      }
    }
  }, [])

  const requestClose = useCallback((force = false) => {
    if (phaseRef.current === 'closing') return
    if (!force && callbacks.current.canClose && !callbacks.current.canClose()) return
    const panel = dialog.current
    if (!panel) return
    // Freeze interaction during exit, preserving the native fields' scroll on blur.
    const scrollers = Array.from(panel.querySelectorAll<HTMLElement>('input, textarea, .details-content, .detail-left')).map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft }))
    panel.querySelector<HTMLButtonElement>('.modal-close')?.focus({ preventScroll: true })
    panel.querySelectorAll<HTMLElement>('button:not(.modal-close), input, textarea, select, a, summary').forEach((el) => { el.inert = true })
    scrollers.forEach(({ el, top, left }) => { el.scrollTop = top; el.scrollLeft = left })
    animate(true)
  }, [animate])
  useImperativeHandle(closeRef, () => requestClose, [requestClose])

  useLayoutEffect(() => {
    const panel = dialog.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel?.showModal()
    animate(false)
    return () => {
      if (animation.current) { animation.current.onfinish = null; animation.current.cancel(); animation.current = null }
      panel?.close()
      document.body.style.overflow = overflow
      // Wait for the commit: selecting a library can replace the original trigger.
      queueMicrotask(() => {
        if (document.querySelector('dialog[open]')) return
        if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
        else document.querySelector<HTMLInputElement>('input[type="search"], .library-form input:not(:disabled)')?.focus({ preventScroll: true })
      })
    }
  }, [animate])
  return { dialog, phase, requestClose }
}
