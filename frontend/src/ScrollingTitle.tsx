import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

export function ScrollingTitle({ title }: { title: string }) {
  const viewport = useRef<HTMLSpanElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(0)

  useEffect(() => {
    const frame = viewport.current
    const content = text.current
    if (!frame || !content) return
    const measure = () => setOverflow(Math.max(0, Math.ceil(content.getBoundingClientRect().width - frame.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(content)
    return () => observer.disconnect()
  }, [title])

  const style = {
    '--title-overflow': `${overflow}px`,
    '--title-duration': `${Math.max(4, overflow / 40 + 1)}s`,
  } as CSSProperties
  return <span ref={viewport} className={`beat-title scroll-title${overflow ? ' overflows' : ''}`} title={title} style={style}>
    <span ref={text} className="scroll-title-text">{title}</span>
  </span>
}
