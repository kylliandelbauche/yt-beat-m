import { useState } from 'react'
import type { Beat } from './beat'

export function Artwork({ beat, className = '' }: { beat: Beat; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return <div className={`beat-artwork ${className}`}>
    {beat.artwork_url && failedUrl !== beat.artwork_url
      ? <img src={beat.artwork_url} alt={`Pochette de ${beat.title}`} loading="lazy" onError={() => setFailedUrl(beat.artwork_url)} />
      : <><span className="cover-note" aria-hidden="true">♫</span><span className="cover-label">AUDIO LOCAL</span></>}
  </div>
}
