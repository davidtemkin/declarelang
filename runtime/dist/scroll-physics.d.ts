/**
 * iOS-matching scroll physics engine (2D).
 *
 * This module is shared between:
 *   1. The simulator (tools/gesture-physics/simulate.ts)
 *   2. Mesa client
 *
 * It receives ONLY finger events (down, move, up + position + time) and
 * produces content offset for both X and Y axes. No Mesa-specific state.
 *
 * Physics derived from iOS UIScrollView recordings:
 *   - Momentum: v(t) = v₀ × exp(-k × t), k ≈ 2.0/sec
 *   - Rubber band: visual = pull / (1 + pull / dimension)
 *   - Spring: critically damped, ω = 15, ζ = 1.0 (settles in ~500ms)
 *   - Velocity: uses full gesture duration, with duration-dependent scaling
 *     - Short gestures (<30ms) are dampened (0.65x)
 *     - Long gestures (>=35ms) are boosted (1.20x)
 *   - Stop-tap: halt momentum with brief touch (<20px, <150ms) or ultra-short (<50ms)
 *   - Velocity floor: low-velocity gestures during momentum treated as stop
 *
 * Validated against iOS recordings in tools/ios-physics-recorder/recordings/
 * See tools/gesture-physics/calibrate.ts for velocity scaling derivation.
 */
export declare const SCROLL_PHYSICS: {
    DECEL_COEFF_SHORT: number;
    DECEL_COEFF_LONG: number;
    VELOCITY_WINDOW_MS: number;
    MIN_VELOCITY: number;
    MAX_VELOCITY: number;
    MIN_GESTURE_DURATION_INTERRUPT: number;
    INTENTIONAL_VELOCITY: number;
    VELOCITY_SCALE_SHORT: number;
    VELOCITY_SCALE_LONG: number;
    RUBBER_BAND_DIMENSION: number;
    MAX_OVERSCROLL: number;
    SPRING_OMEGA: number;
    SPRING_ZETA: number;
    SETTLE_POSITION: number;
    SETTLE_VELOCITY: number;
};
/**
 * A finger event - the ONLY input to the physics engine.
 */
export interface FingerEvent {
    type: 'down' | 'move' | 'up' | 'cancel';
    x: number;
    y: number;
    time: number;
}
/**
 * Physics engine configuration.
 */
export interface ScrollPhysicsConfig {
    contentWidth: number;
    contentHeight: number;
    viewportWidth: number;
    viewportHeight: number;
}
/**
 * Current state of the scroll physics.
 */
export interface ScrollState {
    /** Content offset X (0 = left of content visible at left of viewport) */
    contentOffsetX: number;
    /** Content offset Y (0 = top of content visible at top of viewport) */
    contentOffsetY: number;
    /** Visual overscroll offset X (positive = pulled past left, negative = past right) */
    overscrollX: number;
    /** Visual overscroll offset Y (positive = pulled past top, negative = past bottom) */
    overscrollY: number;
    /** Current phase */
    phase: ScrollPhase;
    /** Current velocity X in px/s (only valid during momentum/spring) */
    velocityX: number;
    /** Current velocity Y in px/s (only valid during momentum/spring) */
    velocityY: number;
}
export type ScrollPhase = 'idle' | 'dragging' | 'momentum' | 'spring';
/**
 * iOS rubber band formula.
 * Maps pull distance to visual offset (diminishing returns).
 */
export declare function rubberBand(pullDistance: number, dimension?: number): number;
/**
 * Inverse rubber band - given visual offset, find original pull distance.
 */
export declare function inverseRubberBand(visualOffset: number, dimension?: number): number;
/**
 * iOS-matching scroll physics engine for 2D pan with bounce.
 *
 * Usage:
 * ```
 * const physics = new ScrollPhysics({
 *   contentWidth: 2000, contentHeight: 2000,
 *   viewportWidth: 400, viewportHeight: 800
 * });
 *
 * // On finger down
 * physics.handleFingerEvent({ type: 'down', x: 200, y: 400, time: 0 });
 *
 * // On finger move
 * physics.handleFingerEvent({ type: 'move', x: 180, y: 350, time: 16 });
 *
 * // On finger up
 * physics.handleFingerEvent({ type: 'up', x: 150, y: 300, time: 100 });
 *
 * // Animation loop
 * function animate() {
 *   if (physics.isAnimating()) {
 *     const state = physics.step(16);  // 16ms frame
 *     render(state.contentOffsetX, state.contentOffsetY);
 *     requestAnimationFrame(animate);
 *   }
 * }
 * ```
 */
export declare class ScrollPhysics {
    private contentWidth;
    private contentHeight;
    private viewportWidth;
    private viewportHeight;
    private phase;
    private contentOffsetX;
    private contentOffsetY;
    private overscrollX;
    private overscrollY;
    private velocityX;
    private velocityY;
    private decelCoeff;
    private springVelocityX;
    private springVelocityY;
    private dragStartX;
    private dragStartY;
    private dragStartOffsetX;
    private dragStartOffsetY;
    private fingerSamples;
    private momentumVelocityAtInterruptX;
    private momentumVelocityAtInterruptY;
    private minOffsetX;
    private maxOffsetX;
    private minOffsetY;
    private maxOffsetY;
    constructor(config: ScrollPhysicsConfig);
    /**
     * Update configuration (e.g., when content loads or viewport resizes).
     */
    updateConfig(config: Partial<ScrollPhysicsConfig>): void;
    /**
     * Get the current scroll state.
     */
    getState(): ScrollState;
    /**
     * Check if physics animation is active (momentum or spring).
     */
    isAnimating(): boolean;
    /**
     * Handle a finger event.
     * Returns the new scroll state.
     */
    handleFingerEvent(event: FingerEvent): ScrollState;
    /**
     * Step physics forward by dt milliseconds.
     * Call this each frame during momentum/spring phases.
     */
    step(dt: number): ScrollState;
    private handleFingerDown;
    private handleFingerMove;
    private handleFingerUp;
    /**
     * Shared drag-end logic: compute velocity, handle stop-tap/acceleration,
     * transition to momentum/spring/idle. Used by both handleFingerUp and
     * endFingerTracking.
     */
    private finishDrag;
    private handleFingerCancel;
    private stepMomentum;
    private stepMomentumAxis;
    private stepSpring;
    private stepSpringAxis;
    /**
     * Start velocity tracking for a new gesture.
     * The caller manages position; physics only records samples for velocity.
     */
    beginFingerTracking(x: number, y: number, time: number): void;
    /**
     * Record finger position for velocity calculation only (no position computation).
     */
    recordFingerSample(x: number, y: number, time: number): void;
    /**
     * End drag, set position from caller's raw coordinates, compute velocity,
     * start momentum/spring.
     *
     * @param fingerX/Y - Last finger screen position (for velocity calculation)
     * @param time - Event timestamp
     * @param rawScreenOffsetX/Y - Unclamped desired position in screen pixels.
     *   Physics decomposes into contentOffset + overscroll via applyOffsetWithRubberBand().
     */
    endFingerTracking(fingerX: number, fingerY: number, time: number, rawScreenOffsetX: number, rawScreenOffsetY: number): ScrollState;
    /**
     * In-place compaction of finger samples — removes stale entries without
     * allocating a new array (avoids GC pressure in hot touch-move path).
     */
    private compactSamples;
    /**
     * Apply a target offset with rubber-band physics at boundaries.
     */
    private applyOffsetWithRubberBand;
    /**
     * Calculate finger velocity from raw finger position samples.
     * Returns velocity in screen coordinates (positive = finger moving right/down).
     */
    private calculateFingerVelocity;
    /**
     * Check if currently in overscroll region (either axis).
     */
    private isOverscrolled;
    /**
     * Check if overscrolled on X axis only.
     */
    isOverscrolledX(): boolean;
    /**
     * Check if overscrolled on Y axis only.
     */
    isOverscrolledY(): boolean;
    /**
     * Get debug info about the current state.
     */
    getDebugInfo(): {
        fingerSamplesCount: number;
        dragStartX: number;
        dragStartY: number;
        dragStartOffsetX: number;
        dragStartOffsetY: number;
        decelCoeff: number;
    };
    /**
     * Programmatically set content offset (e.g., for scroll-to).
     */
    setContentOffset(offsetX: number, offsetY: number): void;
    /**
     * Programmatically set Y offset only (for backward compatibility).
     */
    setContentOffsetY(offsetY: number): void;
    /**
     * Reset to initial state.
     */
    reset(): void;
}
