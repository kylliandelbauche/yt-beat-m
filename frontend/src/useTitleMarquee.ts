import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Scroll the same native title field in consultation; editing keeps its viewport. */
export function useTitleMarquee(input: RefObject<HTMLInputElement | null>, enabled: boolean, position: RefObject<number>) {
  useEffect(() => {
    const frame = input.current
    if (!enabled || !frame) return
    const trigger = frame.closest('h2')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let request = 0
    let previous = 0
    let delay = 800
    let direction = 1
    let hovered = false
    let focused = false
    function stop() { cancelAnimationFrame(request); request = 0; previous = 0 }
    function tick(now: number) {
      const elapsed = previous ? Math.min(64, now - previous) : 0
      previous = now
      if (delay > 0) delay -= elapsed
      else {
        const end = frame!.scrollWidth - frame!.clientWidth
        frame!.scrollLeft = Math.max(0, Math.min(end, frame!.scrollLeft + direction * elapsed * .04))
        position.current = frame!.scrollLeft
        if (frame!.scrollLeft >= end || frame!.scrollLeft <= 0) { direction *= -1; delay = 800 }
      }
      request = requestAnimationFrame(tick)
    }
    function sync() {
      if (reduced.matches || frame!.scrollWidth <= frame!.clientWidth || (!hovered && !focused)) stop()
      else if (!request) { delay = 800; request = requestAnimationFrame(tick) }
    }
    const enter = () => { hovered = true; sync() }
    const leave = () => { hovered = false; sync() }
    const focus = () => { focused = true; sync() }
    const blur = () => { focused = false; sync() }
    trigger.addEventListener('pointerenter', enter); trigger.addEventListener('pointerleave', leave)
    trigger.addEventListener('focusin', focus); trigger.addEventListener('focusout', blur)
    reduced.addEventListener('change', sync)
    return () => {
      stop()
      trigger.removeEventListener('pointerenter', enter); trigger.removeEventListener('pointerleave', leave)
      trigger.removeEventListener('focusin', focus); trigger.removeEventListener('focusout', blur)
      reduced.removeEventListener('change', sync)
    }
  }, [enabled, input, position])
}
