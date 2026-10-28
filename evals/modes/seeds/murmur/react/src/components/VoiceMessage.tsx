import { useEffect, useMemo, useRef, useState } from 'react'
import { mediaUrl } from '../service/api'
import type { VoiceMessage as Voice } from '../service/types'
import { formatDuration } from '../lib/time'
import './VoiceMessage.css'

// Only one voice plays at a time, across the whole app.
let playing: HTMLAudioElement | null = null

const BARS = 44
const KEY_STEP_MS = 1000

/** Fewer, bolder bars than the service's samples: each keeps its loudest. */
function resample(peaks: number[], count: number): number[] {
  if (peaks.length <= count) return peaks
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * peaks.length) / count)
    const to = Math.floor(((i + 1) * peaks.length) / count)
    return Math.max(...peaks.slice(from, Math.max(to, from + 1)))
  })
}
const PAGE_STEP_MS = 5000

export function VoiceMessage({ message }: { message: Voice }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [scrubbing, setScrubbing] = useState(false)
  const duration = message.durationMs
  const progress = Math.min(1, position / duration)
  const started = isPlaying || position > 0
  const bars = useMemo(() => resample(message.peaks, BARS), [message.peaks])

  // Follow the audio closely enough that the waveform fills smoothly.
  useEffect(() => {
    if (!isPlaying) return
    let frame = requestAnimationFrame(function tick() {
      const audio = audioRef.current
      if (audio) setPosition(audio.currentTime * 1000)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [isPlaying])

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      audio?.pause()
      if (playing === audio) playing = null
    }
  }, [])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    if (playing && playing !== audio) playing.pause()
    playing = audio
    audio.currentTime = position >= duration ? 0 : position / 1000
    void audio.play()
  }

  function seek(ms: number) {
    const next = Math.max(0, Math.min(duration, ms))
    setPosition(next)
    const audio = audioRef.current
    if (audio && !audio.paused) audio.currentTime = next / 1000
  }

  function positionAt(clientX: number): number {
    const rect = trackRef.current!.getBoundingClientRect()
    return ((clientX - rect.left) / rect.width) * duration
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setScrubbing(true)
    seek(positionAt(event.clientX))
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (scrubbing) seek(positionAt(event.clientX))
  }

  function endScrub() {
    setScrubbing(false)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const steps: Record<string, number> = {
      ArrowRight: KEY_STEP_MS,
      ArrowUp: KEY_STEP_MS,
      ArrowLeft: -KEY_STEP_MS,
      ArrowDown: -KEY_STEP_MS,
      PageUp: PAGE_STEP_MS,
      PageDown: -PAGE_STEP_MS,
    }
    if (event.key in steps) seek(position + steps[event.key])
    else if (event.key === 'Home') seek(0)
    else if (event.key === 'End') seek(duration)
    else if (event.key === ' ' || event.key === 'Enter') toggle()
    else return
    event.preventDefault()
  }

  return (
    <div className="voice" data-playing={isPlaying} data-scrubbing={scrubbing}>
      <button
        type="button"
        className="voice__play"
        onClick={toggle}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div
        ref={trackRef}
        className="voice__track"
        role="slider"
        tabIndex={0}
        aria-label="Position in voice message"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration / 1000)}
        aria-valuenow={Math.round(position / 1000)}
        aria-valuetext={`${formatDuration(position)} of ${formatDuration(duration)}`}
        style={{ '--progress': progress } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onKeyDown={onKeyDown}
      >
        <div className="voice__bars" aria-hidden="true">
          {bars.map((peak, i) => (
            <span
              key={i}
              className="voice__bar"
              data-heard={(i + 0.5) / bars.length <= progress}
              style={{ '--peak': Math.max(0.08, peak) } as React.CSSProperties}
            />
          ))}
        </div>
        <span className="voice__head" aria-hidden="true" />
      </div>

      <span className="voice__time" aria-hidden="true">
        {started ? formatDuration(position) : formatDuration(duration)}
      </span>

      <audio
        ref={audioRef}
        src={mediaUrl(message.src)}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false)
          if (audioRef.current) setPosition(audioRef.current.currentTime * 1000)
        }}
        onEnded={() => {
          setIsPlaying(false)
          setPosition(0)
        }}
      />
    </div>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  )
}
