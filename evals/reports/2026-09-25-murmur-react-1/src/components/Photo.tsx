import { useState } from 'react'
import { mediaUrl } from '../service/api'
import { usePhotoSize } from '../lib/photoSize'
import './Photo.css'

interface PhotoProps {
  src: string
  alt: string
  className?: string
}

/**
 * A photograph at its own proportions. Until it loads (and the service cannot
 * say how big it is), a quiet placeholder holds a likely shape.
 */
export function Photo({ src, alt, className = '' }: PhotoProps) {
  const { size, onLoad } = usePhotoSize(src)
  const [shown, setShown] = useState(false)
  const ratio = size ? size.width / size.height : 4 / 3
  return (
    <span
      className={`photo ${className}`}
      data-loaded={shown}
      style={{ '--ratio': ratio } as React.CSSProperties}
    >
      <img
        src={mediaUrl(src)}
        alt={alt}
        draggable={false}
        onLoad={(event) => {
          onLoad(event)
          setShown(true)
        }}
      />
    </span>
  )
}
