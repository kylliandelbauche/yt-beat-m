import { useCallback, useEffect, useState } from 'react'

export function useEngineConnection() {
  const [state, setState] = useState<'connecting' | 'online' | 'offline'>('connecting')
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController
    async function check() {
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2500)
      try {
        const response = await fetch('/api/health', { signal: controller.signal })
        if (!response.ok || (await response.json()).status !== 'ok') throw new Error('Engine unavailable')
        if (!disposed) setState('online')
      } catch { if (!disposed) setState('offline') }
      finally {
        clearTimeout(timeout)
        if (!disposed) timer = setTimeout(() => { void check() }, 4000)
      }
    }
    void check()
    return () => { disposed = true; controller?.abort(); clearTimeout(timer) }
  }, [attempt])
  return { state, retry }
}
