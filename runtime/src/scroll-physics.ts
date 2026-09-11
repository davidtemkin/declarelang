// scroll-physics — the RUNTIME SCROLL PROVIDER's engine: Mesa's measured iOS
// scroll physics (~/Code/Mesa client/src/scroll-physics.ts), lifted VERBATIM,
// parameters AS-IS (ruled 2026-09-10; a real conformance pass against device
// recordings is arc step 7 and will refit them). A LEAF: it imports nothing, so
// a build whose backend never touches it (the DOM's) tree-shakes it away.
// Used by canvas-backend's ScrollLoop for TOUCH only — on desktop the wheel
// stream already carries the platform's momentum, so deltas apply as delivered.

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

// =============================================================================
// PHYSICS CONSTANTS (derived from iOS recordings)
// =============================================================================

export const SCROLL_PHYSICS = {
  // Momentum deceleration
  // v(t) = v₀ × exp(-k × t) where k = DECEL_COEFF
  // iOS uses different k values based on gesture duration:
  // - Short gestures: higher k (faster decay, punchier feel)
  // - Long gestures: lower k (smoother, longer glide)
  DECEL_COEFF_SHORT: 3.2,  // For gestures < 30ms
  DECEL_COEFF_LONG: 2.0,   // For gestures >= 35ms

  // Velocity calculation window
  VELOCITY_WINDOW_MS: 100,  // Look at samples in this window

  // Minimum velocity to start/continue momentum
  MIN_VELOCITY: 50,  // px/s

  // Maximum velocity for momentum
  MAX_VELOCITY: 6000,  // px/s

  // Minimum gesture duration when interrupting momentum (prevents accidental stop→reverse)
  // Only applied when a gesture interrupts existing momentum
  MIN_GESTURE_DURATION_INTERRUPT: 50,  // ms - below this, treat as stop

  // Velocity floor for intentional gestures (when interrupting momentum)
  INTENTIONAL_VELOCITY: 300,  // px/s - below this, treat as stop-tap

  // Velocity scaling is duration-dependent
  // Short gestures (<30ms) get dampened, longer gestures get boosted
  // See calibrate.ts for derivation from iOS recordings
  VELOCITY_SCALE_SHORT: 0.65,   // For gestures < 30ms
  VELOCITY_SCALE_LONG: 1.20,    // For gestures >= 35ms

  // Rubber band dimension (approximately half screen height)
  RUBBER_BAND_DIMENSION: 400,

  // Maximum overscroll distance (hard cap)
  // Prevents extreme overscroll from high-velocity momentum
  MAX_OVERSCROLL: 300,  // px

  // Spring constants (critically damped)
  // iOS spring settles in ~500ms; omega≈15 achieves this
  SPRING_OMEGA: 15,    // natural frequency
  SPRING_ZETA: 1.0,    // damping ratio (1.0 = critically damped)

  // Threshold for considering scroll "settled"
  SETTLE_POSITION: 0.5,   // px
  SETTLE_VELOCITY: 10,    // px/s
};

// =============================================================================
// TYPES
// =============================================================================

/**
 * A finger event - the ONLY input to the physics engine.
 */
export interface FingerEvent {
  type: 'down' | 'move' | 'up' | 'cancel';
  x: number;      // Screen X position (finger position)
  y: number;      // Screen Y position (finger position)
  time: number;   // Timestamp in milliseconds
}

/**
 * Physics engine configuration.
 */
export interface ScrollPhysicsConfig {
  contentWidth: number;    // Total scrollable content width (px)
  contentHeight: number;   // Total scrollable content height (px)
  viewportWidth: number;   // Visible viewport width (px)
  viewportHeight: number;  // Visible viewport height (px)
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
 * Internal sample for velocity calculation.
 */
interface FingerSample {
  x: number;     // Finger X position
  y: number;     // Finger Y position
  time: number;  // Timestamp
}

// =============================================================================
// RUBBER BAND FUNCTIONS
// =============================================================================

/**
 * iOS rubber band formula.
 * Maps pull distance to visual offset (diminishing returns).
 */
export function rubberBand(pullDistance: number, dimension: number = SCROLL_PHYSICS.RUBBER_BAND_DIMENSION): number {
  if (pullDistance <= 0) return 0;
  return pullDistance / (1 + pullDistance / dimension);
}

/**
 * Inverse rubber band - given visual offset, find original pull distance.
 */
export function inverseRubberBand(visualOffset: number, dimension: number = SCROLL_PHYSICS.RUBBER_BAND_DIMENSION): number {
  if (visualOffset <= 0) return 0;
  if (visualOffset >= dimension) return Infinity;
  return visualOffset / (1 - visualOffset / dimension);
}

// =============================================================================
// SCROLL PHYSICS ENGINE (2D)
// =============================================================================

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
export class ScrollPhysics {
  // Configuration
  private contentWidth: number;
  private contentHeight: number;
  private viewportWidth: number;
  private viewportHeight: number;

  // State machine: 'idle' | 'dragging' | 'momentum' | 'spring'
  private phase: ScrollPhase = 'idle';

  // Position state
  private contentOffsetX: number = 0;
  private contentOffsetY: number = 0;
  private overscrollX: number = 0;
  private overscrollY: number = 0;

  // Velocity - only meaningful in 'momentum' phase
  private velocityX: number = 0;
  private velocityY: number = 0;
  private decelCoeff: number = SCROLL_PHYSICS.DECEL_COEFF_LONG;  // Active deceleration

  // Spring velocity - persists across frames during 'spring' phase
  private springVelocityX: number = 0;
  private springVelocityY: number = 0;

  // Dragging state - only meaningful in 'dragging' phase
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private dragStartOffsetX: number = 0;
  private dragStartOffsetY: number = 0;
  private fingerSamples: FingerSample[] = [];

  // Acceleration gesture detection
  private momentumVelocityAtInterruptX: number = 0;
  private momentumVelocityAtInterruptY: number = 0;

  // Bounds
  private minOffsetX: number = 0;
  private maxOffsetX: number = 0;
  private minOffsetY: number = 0;
  private maxOffsetY: number = 0;

  constructor(config: ScrollPhysicsConfig) {
    this.contentWidth = config.contentWidth;
    this.contentHeight = config.contentHeight;
    this.viewportWidth = config.viewportWidth;
    this.viewportHeight = config.viewportHeight;
    this.minOffsetX = 0;
    this.maxOffsetX = Math.max(0, config.contentWidth - config.viewportWidth);
    this.minOffsetY = 0;
    this.maxOffsetY = Math.max(0, config.contentHeight - config.viewportHeight);
  }

  /**
   * Update configuration (e.g., when content loads or viewport resizes).
   */
  updateConfig(config: Partial<ScrollPhysicsConfig>): void {
    const oldMaxOffsetX = this.maxOffsetX;
    const oldMaxOffsetY = this.maxOffsetY;

    if (config.contentWidth !== undefined) {
      this.contentWidth = config.contentWidth;
    }
    if (config.contentHeight !== undefined) {
      this.contentHeight = config.contentHeight;
    }
    if (config.viewportWidth !== undefined) {
      this.viewportWidth = config.viewportWidth;
    }
    if (config.viewportHeight !== undefined) {
      this.viewportHeight = config.viewportHeight;
    }

    this.maxOffsetX = Math.max(0, this.contentWidth - this.viewportWidth);
    this.maxOffsetY = Math.max(0, this.contentHeight - this.viewportHeight);

    // Handle X overscroll becoming valid
    if (this.maxOffsetX > oldMaxOffsetX && this.overscrollX < 0) {
      const effectiveOffset = oldMaxOffsetX + Math.abs(this.overscrollX);
      if (effectiveOffset <= this.maxOffsetX) {
        this.contentOffsetX = effectiveOffset;
        this.overscrollX = 0;
      }
    }

    // Handle Y overscroll becoming valid
    if (this.maxOffsetY > oldMaxOffsetY && this.overscrollY < 0) {
      const effectiveOffset = oldMaxOffsetY + Math.abs(this.overscrollY);
      if (effectiveOffset <= this.maxOffsetY) {
        this.contentOffsetY = effectiveOffset;
        this.overscrollY = 0;
      }
    }

    if (!this.isOverscrolled() && this.phase === 'spring') {
      this.phase = 'idle';
    }
  }

  /**
   * Get the current scroll state.
   */
  getState(): ScrollState {
    return {
      contentOffsetX: this.contentOffsetX,
      contentOffsetY: this.contentOffsetY,
      overscrollX: this.overscrollX,
      overscrollY: this.overscrollY,
      phase: this.phase,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
    };
  }

  /**
   * Check if physics animation is active (momentum or spring).
   */
  isAnimating(): boolean {
    return this.phase === 'momentum' || this.phase === 'spring';
  }

  /**
   * Handle a finger event.
   * Returns the new scroll state.
   */
  handleFingerEvent(event: FingerEvent): ScrollState {
    switch (event.type) {
      case 'down':
        return this.handleFingerDown(event);
      case 'move':
        return this.handleFingerMove(event);
      case 'up':
        return this.handleFingerUp(event);
      case 'cancel':
        return this.handleFingerCancel();
      default:
        return this.getState();
    }
  }

  /**
   * Step physics forward by dt milliseconds.
   * Call this each frame during momentum/spring phases.
   */
  step(dt: number): ScrollState {
    if (this.phase === 'momentum') {
      return this.stepMomentum(dt);
    } else if (this.phase === 'spring') {
      return this.stepSpring(dt);
    }
    return this.getState();
  }

  // ===========================================================================
  // FINGER EVENT HANDLERS
  // ===========================================================================

  private handleFingerDown(event: FingerEvent): ScrollState {
    // Detect if we're interrupting momentum
    if (this.phase === 'momentum') {
      this.momentumVelocityAtInterruptX = this.velocityX;
      this.momentumVelocityAtInterruptY = this.velocityY;
    } else {
      this.momentumVelocityAtInterruptX = 0;
      this.momentumVelocityAtInterruptY = 0;
    }

    // Enter dragging state
    this.velocityX = 0;
    this.velocityY = 0;
    this.dragStartX = event.x;
    this.dragStartY = event.y;
    this.dragStartOffsetX = this.contentOffsetX;
    this.dragStartOffsetY = this.contentOffsetY;

    // Track raw finger positions
    this.fingerSamples = [{ x: event.x, y: event.y, time: event.time }];

    this.phase = 'dragging';
    return this.getState();
  }

  private handleFingerMove(event: FingerEvent): ScrollState {
    if (this.phase !== 'dragging') {
      return this.getState();
    }

    // Content follows finger directly (with rubber band at edges)
    const fingerDeltaX = event.x - this.dragStartX;
    const fingerDeltaY = event.y - this.dragStartY;
    const rawTargetOffsetX = this.dragStartOffsetX - fingerDeltaX;
    const rawTargetOffsetY = this.dragStartOffsetY - fingerDeltaY;
    this.applyOffsetWithRubberBand(rawTargetOffsetX, rawTargetOffsetY);

    // Track raw finger position
    this.fingerSamples.push({ x: event.x, y: event.y, time: event.time });
    this.compactSamples(event.time);

    return this.getState();
  }

  private handleFingerUp(event: FingerEvent): ScrollState {
    if (this.phase !== 'dragging') {
      return this.getState();
    }

    return this.finishDrag(event.x, event.y, event.time);
  }

  /**
   * Shared drag-end logic: compute velocity, handle stop-tap/acceleration,
   * transition to momentum/spring/idle. Used by both handleFingerUp and
   * endFingerTracking.
   */
  private finishDrag(fingerX: number, fingerY: number, time: number): ScrollState {
    // Gather drag metrics
    const dragDistanceX = Math.abs(fingerX - this.dragStartX);
    const dragDistanceY = Math.abs(fingerY - this.dragStartY);
    const dragDistance = Math.sqrt(dragDistanceX * dragDistanceX + dragDistanceY * dragDistanceY);
    const dragDuration = this.fingerSamples.length > 0
      ? time - this.fingerSamples[0].time
      : 0;
    const numSamples = this.fingerSamples.length;

    // Case 1: Stop-tap (interrupted momentum with brief touch)
    const wasInterruptingMomentum = this.momentumVelocityAtInterruptX !== 0 || this.momentumVelocityAtInterruptY !== 0;
    const isUltraShort = dragDuration < SCROLL_PHYSICS.MIN_GESTURE_DURATION_INTERRUPT;
    const isClassicStopTap = dragDistance < 20 && dragDuration < 150;

    if (wasInterruptingMomentum && (isClassicStopTap || isUltraShort)) {
      this.velocityX = 0;
      this.velocityY = 0;
      this.phase = 'idle';
      this.momentumVelocityAtInterruptX = 0;
      this.momentumVelocityAtInterruptY = 0;
      return this.getState();
    }

    // Calculate finger velocity
    let fingerVelocityX = 0;
    let fingerVelocityY = 0;
    if (numSamples >= 2) {
      const velocity = this.calculateFingerVelocity(time);
      fingerVelocityX = velocity.x;
      fingerVelocityY = velocity.y;
    } else if (dragDuration > 0 && dragDistance > 10) {
      // Quick flick with 1 sample - use distance/time heuristic
      const estimatedSpeed = (dragDistance / dragDuration) * 1000;
      const dirX = fingerX < this.dragStartX ? 1 : -1;
      const dirY = fingerY < this.dragStartY ? 1 : -1;
      const ratio = dragDistance > 0 ? dragDistanceX / dragDistance : 0;
      fingerVelocityX = -dirX * estimatedSpeed * ratio;
      fingerVelocityY = -dirY * estimatedSpeed * (1 - ratio);
    }

    // Convert finger velocity to content velocity (negative because content moves opposite to finger)
    this.velocityX = -fingerVelocityX;
    this.velocityY = -fingerVelocityY;

    // Handle acceleration gestures (interrupting same-direction momentum)
    let isAcceleration = false;
    if (wasInterruptingMomentum && numSamples >= 2) {
      const gestureSpeed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);

      // Check if gesture is in same general direction as momentum
      const dot = this.velocityX * this.momentumVelocityAtInterruptX +
                  this.velocityY * this.momentumVelocityAtInterruptY;
      const sameDirection = dot > 0;

      if (sameDirection && dragDuration < 300 && gestureSpeed >= SCROLL_PHYSICS.INTENTIONAL_VELOCITY) {
        isAcceleration = true;
        // Add gesture velocity to existing momentum
        this.velocityX += this.momentumVelocityAtInterruptX;
        this.velocityY += this.momentumVelocityAtInterruptY;
      } else if (!sameDirection && gestureSpeed < SCROLL_PHYSICS.INTENTIONAL_VELOCITY) {
        // Weak opposite gesture - treat as stop
        this.velocityX = 0;
        this.velocityY = 0;
        this.phase = 'idle';
        this.momentumVelocityAtInterruptX = 0;
        this.momentumVelocityAtInterruptY = 0;
        return this.getState();
      }
    }

    this.momentumVelocityAtInterruptX = 0;
    this.momentumVelocityAtInterruptY = 0;

    // Apply duration-dependent velocity scaling
    let velocityScale: number;
    if (dragDuration < 30) {
      velocityScale = SCROLL_PHYSICS.VELOCITY_SCALE_SHORT;
      this.decelCoeff = SCROLL_PHYSICS.DECEL_COEFF_SHORT;
      velocityScale *= SCROLL_PHYSICS.DECEL_COEFF_SHORT / SCROLL_PHYSICS.DECEL_COEFF_LONG;
    } else if (dragDuration >= 35) {
      velocityScale = SCROLL_PHYSICS.VELOCITY_SCALE_LONG;
      this.decelCoeff = SCROLL_PHYSICS.DECEL_COEFF_LONG;
    } else {
      const t = (dragDuration - 30) / 5;
      velocityScale = SCROLL_PHYSICS.VELOCITY_SCALE_SHORT + t * (SCROLL_PHYSICS.VELOCITY_SCALE_LONG - SCROLL_PHYSICS.VELOCITY_SCALE_SHORT);
      this.decelCoeff = SCROLL_PHYSICS.DECEL_COEFF_SHORT + t * (SCROLL_PHYSICS.DECEL_COEFF_LONG - SCROLL_PHYSICS.DECEL_COEFF_SHORT);
      velocityScale *= this.decelCoeff / SCROLL_PHYSICS.DECEL_COEFF_LONG;
    }

    // Don't scale if this was an acceleration (already combined velocities)
    if (!isAcceleration) {
      this.velocityX *= velocityScale;
      this.velocityY *= velocityScale;
    }

    // Apply velocity cap
    const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
    if (speed > SCROLL_PHYSICS.MAX_VELOCITY) {
      const scale = SCROLL_PHYSICS.MAX_VELOCITY / speed;
      this.velocityX *= scale;
      this.velocityY *= scale;
    }

    // Velocity floor check
    if (wasInterruptingMomentum && speed < SCROLL_PHYSICS.INTENTIONAL_VELOCITY) {
      this.velocityX = 0;
      this.velocityY = 0;
      this.phase = this.isOverscrolled() ? 'spring' : 'idle';
      this.springVelocityX = 0;
      this.springVelocityY = 0;
      return this.getState();
    }

    // Handle per-axis overscroll:
    // If overscrolled on X, zero X velocity (spring will handle it)
    // If overscrolled on Y, zero Y velocity (spring will handle it)
    // But allow momentum on the non-overscrolled axis
    const isOverscrolledX = Math.abs(this.overscrollX) > 0.5;
    const isOverscrolledY = Math.abs(this.overscrollY) > 0.5;

    if (isOverscrolledX) {
      this.velocityX = 0;
    }
    if (isOverscrolledY) {
      this.velocityY = 0;
    }

    // Recalculate speed after potentially zeroing overscrolled axes
    const adjustedSpeed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);

    // Determine phase based on velocity and overscroll
    // - momentum: has velocity above threshold (may also have overscroll to spring back)
    // - spring: no significant velocity but has overscroll
    // - idle: neither
    if (adjustedSpeed > SCROLL_PHYSICS.MIN_VELOCITY) {
      this.phase = 'momentum';
      this.springVelocityX = 0;
      this.springVelocityY = 0;
    } else if (this.isOverscrolled()) {
      this.velocityX = 0;
      this.velocityY = 0;
      this.springVelocityX = 0;
      this.springVelocityY = 0;
      this.phase = 'spring';
    } else {
      this.velocityX = 0;
      this.velocityY = 0;
      this.phase = 'idle';
    }

    return this.getState();
  }

  private handleFingerCancel(): ScrollState {
    this.velocityX = 0;
    this.velocityY = 0;
    if (this.isOverscrolled()) {
      this.springVelocityX = 0;
      this.springVelocityY = 0;
      this.phase = 'spring';
    } else {
      this.phase = 'idle';
    }
    return this.getState();
  }

  // ===========================================================================
  // PHYSICS STEPPING
  // ===========================================================================

  private stepMomentum(dt: number): ScrollState {
    const dtSec = dt / 1000;
    const k = this.decelCoeff;
    const omega = SCROLL_PHYSICS.SPRING_OMEGA;
    const zeta = SCROLL_PHYSICS.SPRING_ZETA;

    // Process X and Y independently
    // For axes with velocity, use momentum physics
    // For overscrolled axes with ~0 velocity, use spring physics
    const isOverscrolledX = Math.abs(this.overscrollX) > 0.5;
    const isOverscrolledY = Math.abs(this.overscrollY) > 0.5;
    const hasVelocityX = Math.abs(this.velocityX) > SCROLL_PHYSICS.MIN_VELOCITY;
    const hasVelocityY = Math.abs(this.velocityY) > SCROLL_PHYSICS.MIN_VELOCITY;

    // X axis: spring if overscrolled with no velocity, momentum otherwise
    if (isOverscrolledX && !hasVelocityX) {
      this.stepSpringAxis('x', dtSec, omega, zeta);
    } else {
      this.stepMomentumAxis('x', dtSec, k);
    }

    // Y axis: spring if overscrolled with no velocity, momentum otherwise
    if (isOverscrolledY && !hasVelocityY) {
      this.stepSpringAxis('y', dtSec, omega, zeta);
    } else {
      this.stepMomentumAxis('y', dtSec, k);
    }

    // Check if momentum is done
    const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
    const isOverscrolled = this.isOverscrolled();

    if (isOverscrolled && speed < SCROLL_PHYSICS.MIN_VELOCITY) {
      // Still overscrolled with no velocity - transition to pure spring
      this.velocityX = 0;
      this.velocityY = 0;
      this.phase = 'spring';
    } else if (!isOverscrolled && speed < SCROLL_PHYSICS.MIN_VELOCITY) {
      // Done - no overscroll, no velocity
      this.velocityX = 0;
      this.velocityY = 0;
      this.phase = 'idle';
    }
    // Otherwise, stay in momentum (still has velocity on at least one axis)

    return this.getState();
  }

  private stepMomentumAxis(axis: 'x' | 'y', dtSec: number, k: number): void {
    const minOffset = axis === 'x' ? this.minOffsetX : this.minOffsetY;
    const maxOffset = axis === 'x' ? this.maxOffsetX : this.maxOffsetY;

    // No range on this axis — lock position, kill velocity
    if (maxOffset <= minOffset) {
      if (axis === 'x') {
        this.contentOffsetX = minOffset;
        this.overscrollX = 0;
        this.velocityX = 0;
      } else {
        this.contentOffsetY = minOffset;
        this.overscrollY = 0;
        this.velocityY = 0;
      }
      return;
    }

    const velocity = axis === 'x' ? this.velocityX : this.velocityY;
    const overscroll = axis === 'x' ? this.overscrollX : this.overscrollY;
    const contentOffset = axis === 'x' ? this.contentOffsetX : this.contentOffsetY;

    if (Math.abs(overscroll) > 0.5) {
      // In overscroll - use fast decay
      const kFast = k * 10;
      const fastDecay = Math.exp(-kFast * dtSec);
      const travel = velocity / kFast * (1 - fastDecay);

      const currentPull = inverseRubberBand(Math.abs(overscroll));
      const newPull = currentPull + Math.abs(travel);
      const sign = overscroll > 0 ? 1 : -1;
      const newOverscroll = Math.min(rubberBand(newPull), SCROLL_PHYSICS.MAX_OVERSCROLL);

      if (axis === 'x') {
        this.overscrollX = sign * newOverscroll;
        this.velocityX *= fastDecay;
      } else {
        this.overscrollY = sign * newOverscroll;
        this.velocityY *= fastDecay;
      }
    } else {
      // Normal momentum
      const decay = Math.exp(-k * dtSec);
      const travel = velocity / k * (1 - decay);
      const targetOffset = contentOffset + travel;

      if (axis === 'x') {
        this.velocityX *= decay;
      } else {
        this.velocityY *= decay;
      }

      if (targetOffset < minOffset) {
        const overshoot = minOffset - targetOffset;
        if (axis === 'x') {
          this.contentOffsetX = minOffset;
          this.overscrollX = Math.min(rubberBand(overshoot), SCROLL_PHYSICS.MAX_OVERSCROLL);
        } else {
          this.contentOffsetY = minOffset;
          this.overscrollY = Math.min(rubberBand(overshoot), SCROLL_PHYSICS.MAX_OVERSCROLL);
        }
      } else if (targetOffset > maxOffset) {
        const overshoot = targetOffset - maxOffset;
        if (axis === 'x') {
          this.contentOffsetX = maxOffset;
          this.overscrollX = -Math.min(rubberBand(overshoot), SCROLL_PHYSICS.MAX_OVERSCROLL);
        } else {
          this.contentOffsetY = maxOffset;
          this.overscrollY = -Math.min(rubberBand(overshoot), SCROLL_PHYSICS.MAX_OVERSCROLL);
        }
      } else {
        if (axis === 'x') {
          this.contentOffsetX = targetOffset;
        } else {
          this.contentOffsetY = targetOffset;
        }
      }
    }
  }

  private stepSpring(dt: number): ScrollState {
    const dtSec = dt / 1000;
    const omega = SCROLL_PHYSICS.SPRING_OMEGA;
    const zeta = SCROLL_PHYSICS.SPRING_ZETA;

    // Step each axis independently
    const settledX = this.stepSpringAxis('x', dtSec, omega, zeta);
    const settledY = this.stepSpringAxis('y', dtSec, omega, zeta);

    if (settledX && settledY) {
      this.phase = 'idle';
    }

    return this.getState();
  }

  private stepSpringAxis(axis: 'x' | 'y', dtSec: number, omega: number, zeta: number): boolean {
    const overscroll = axis === 'x' ? this.overscrollX : this.overscrollY;
    let springVelocity = axis === 'x' ? this.springVelocityX : this.springVelocityY;

    if (Math.abs(overscroll) < SCROLL_PHYSICS.SETTLE_POSITION &&
        Math.abs(springVelocity) < SCROLL_PHYSICS.SETTLE_VELOCITY) {
      // Already settled
      if (axis === 'x') {
        this.overscrollX = 0;
        this.springVelocityX = 0;
      } else {
        this.overscrollY = 0;
        this.springVelocityY = 0;
      }
      return true;
    }

    const sign = overscroll >= 0 ? 1 : -1;
    let x = Math.abs(overscroll);
    let v = springVelocity;

    const steps = Math.max(1, Math.ceil(dtSec * 1000));
    const stepDt = dtSec / steps;

    for (let i = 0; i < steps; i++) {
      const accel = -omega * omega * x - 2 * zeta * omega * v;
      v += accel * stepDt;
      x += v * stepDt;
    }

    if (x < SCROLL_PHYSICS.SETTLE_POSITION && Math.abs(v) < SCROLL_PHYSICS.SETTLE_VELOCITY) {
      if (axis === 'x') {
        this.overscrollX = 0;
        this.springVelocityX = 0;
      } else {
        this.overscrollY = 0;
        this.springVelocityY = 0;
      }
      return true;
    } else {
      if (axis === 'x') {
        this.overscrollX = sign * Math.max(0, x);
        this.springVelocityX = v;
      } else {
        this.overscrollY = sign * Math.max(0, x);
        this.springVelocityY = v;
      }
      return false;
    }
  }

  // ===========================================================================
  // VELOCITY-ONLY TRACKING API
  // These methods let the caller manage position during drag while
  // ScrollPhysics only tracks finger samples for velocity calculation.
  // ===========================================================================

  /**
   * Start velocity tracking for a new gesture.
   * The caller manages position; physics only records samples for velocity.
   */
  beginFingerTracking(x: number, y: number, time: number): void {
    // Capture momentum state for acceleration detection (same as handleFingerDown)
    if (this.phase === 'momentum') {
      this.momentumVelocityAtInterruptX = this.velocityX;
      this.momentumVelocityAtInterruptY = this.velocityY;
    } else {
      this.momentumVelocityAtInterruptX = 0;
      this.momentumVelocityAtInterruptY = 0;
    }
    this.velocityX = 0;
    this.velocityY = 0;
    this.dragStartX = x;
    this.dragStartY = y;
    this.fingerSamples = [{ x, y, time }];
    this.phase = 'dragging';
  }

  /**
   * Record finger position for velocity calculation only (no position computation).
   */
  recordFingerSample(x: number, y: number, time: number): void {
    this.fingerSamples.push({ x, y, time });
    this.compactSamples(time);
  }

  /**
   * End drag, set position from caller's raw coordinates, compute velocity,
   * start momentum/spring.
   *
   * @param fingerX/Y - Last finger screen position (for velocity calculation)
   * @param time - Event timestamp
   * @param rawScreenOffsetX/Y - Unclamped desired position in screen pixels.
   *   Physics decomposes into contentOffset + overscroll via applyOffsetWithRubberBand().
   */
  endFingerTracking(
    fingerX: number, fingerY: number, time: number,
    rawScreenOffsetX: number, rawScreenOffsetY: number
  ): ScrollState {
    // Set position from caller's raw coordinates
    this.applyOffsetWithRubberBand(rawScreenOffsetX, rawScreenOffsetY);
    this.dragStartOffsetX = this.contentOffsetX;
    this.dragStartOffsetY = this.contentOffsetY;

    // Reuse velocity calculation and phase-transition logic
    return this.finishDrag(fingerX, fingerY, time);
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * In-place compaction of finger samples — removes stale entries without
   * allocating a new array (avoids GC pressure in hot touch-move path).
   */
  private compactSamples(currentTime: number): void {
    const cutoff = currentTime - SCROLL_PHYSICS.VELOCITY_WINDOW_MS * 2;
    const samples = this.fingerSamples;
    let writeIdx = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].time > cutoff) {
        if (writeIdx !== i) samples[writeIdx] = samples[i];
        writeIdx++;
      }
    }
    samples.length = writeIdx;
  }

  /**
   * Apply a target offset with rubber-band physics at boundaries.
   */
  private applyOffsetWithRubberBand(targetOffsetX: number, targetOffsetY: number): void {
    const dimension = SCROLL_PHYSICS.RUBBER_BAND_DIMENSION;

    // X axis — lock completely when there's no horizontal scroll range
    if (this.maxOffsetX <= this.minOffsetX) {
      this.contentOffsetX = this.minOffsetX;
      this.overscrollX = 0;
    } else if (targetOffsetX < this.minOffsetX) {
      const pullDistance = this.minOffsetX - targetOffsetX;
      this.contentOffsetX = this.minOffsetX;
      this.overscrollX = rubberBand(pullDistance, dimension);
    } else if (targetOffsetX > this.maxOffsetX) {
      const pullDistance = targetOffsetX - this.maxOffsetX;
      this.contentOffsetX = this.maxOffsetX;
      this.overscrollX = -rubberBand(pullDistance, dimension);
    } else {
      this.contentOffsetX = targetOffsetX;
      this.overscrollX = 0;
    }

    // Y axis
    if (targetOffsetY < this.minOffsetY) {
      const pullDistance = this.minOffsetY - targetOffsetY;
      this.contentOffsetY = this.minOffsetY;
      this.overscrollY = rubberBand(pullDistance, dimension);
    } else if (targetOffsetY > this.maxOffsetY) {
      const pullDistance = targetOffsetY - this.maxOffsetY;
      this.contentOffsetY = this.maxOffsetY;
      this.overscrollY = -rubberBand(pullDistance, dimension);
    } else {
      this.contentOffsetY = targetOffsetY;
      this.overscrollY = 0;
    }
  }

  /**
   * Calculate finger velocity from raw finger position samples.
   * Returns velocity in screen coordinates (positive = finger moving right/down).
   */
  private calculateFingerVelocity(atTime: number): { x: number; y: number } {
    const n = this.fingerSamples.length;
    if (n < 2) {
      return { x: 0, y: 0 };
    }

    const first = this.fingerSamples[0];
    const last = this.fingerSamples[n - 1];

    const totalDt = (atTime - first.time) / 1000;
    const totalDx = last.x - first.x;
    const totalDy = last.y - first.y;

    if (totalDt > 0.001) {
      return { x: totalDx / totalDt, y: totalDy / totalDt };
    }

    return { x: 0, y: 0 };
  }

  /**
   * Check if currently in overscroll region (either axis).
   */
  private isOverscrolled(): boolean {
    return Math.abs(this.overscrollX) > 0.5 || Math.abs(this.overscrollY) > 0.5;
  }

  /**
   * Check if overscrolled on X axis only.
   */
  isOverscrolledX(): boolean {
    return Math.abs(this.overscrollX) > 0.5;
  }

  /**
   * Check if overscrolled on Y axis only.
   */
  isOverscrolledY(): boolean {
    return Math.abs(this.overscrollY) > 0.5;
  }

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
  } {
    return {
      fingerSamplesCount: this.fingerSamples.length,
      dragStartX: this.dragStartX,
      dragStartY: this.dragStartY,
      dragStartOffsetX: this.dragStartOffsetX,
      dragStartOffsetY: this.dragStartOffsetY,
      decelCoeff: this.decelCoeff,
    };
  }

  // ===========================================================================
  // EXTERNAL CONTROL
  // ===========================================================================

  /**
   * Programmatically set content offset (e.g., for scroll-to).
   */
  setContentOffset(offsetX: number, offsetY: number): void {
    this.contentOffsetX = Math.max(this.minOffsetX, Math.min(this.maxOffsetX, offsetX));
    this.contentOffsetY = Math.max(this.minOffsetY, Math.min(this.maxOffsetY, offsetY));
    this.overscrollX = 0;
    this.overscrollY = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.phase = 'idle';
  }

  /**
   * Programmatically set Y offset only (for backward compatibility).
   */
  setContentOffsetY(offsetY: number): void {
    this.contentOffsetY = Math.max(this.minOffsetY, Math.min(this.maxOffsetY, offsetY));
    this.overscrollY = 0;
    this.velocityY = 0;
    // Don't change phase or X state
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this.contentOffsetX = 0;
    this.contentOffsetY = 0;
    this.overscrollX = 0;
    this.overscrollY = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.springVelocityX = 0;
    this.springVelocityY = 0;
    this.phase = 'idle';
    this.fingerSamples = [];
  }
}
