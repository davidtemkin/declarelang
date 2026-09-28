import { useCallback, useState } from 'react'

export interface Size {
  width: number
  height: number
}

// The service does not know its photographs' dimensions. Once a photo has
// loaded anywhere, remember its size so it never lays out twice.
const known = new Map<string, Size>()

export function usePhotoSize(src: string) {
  const [size, setSize] = useState<Size | undefined>(() => known.get(src))
  const onLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: width, naturalHeight: height } = event.currentTarget
      if (!width || !height) return
      const next = { width, height }
      known.set(src, next)
      setSize(next)
    },
    [src],
  )
  return { size, onLoad }
}

/** Fit a size inside a box without changing its proportions. */
export function fit(size: Size, maxWidth: number, maxHeight: number): Size {
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1)
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
}
