// Scrollbars — the overlay kind, drawn in the layer tree.
//
// The DOM backend gets these from the platform: `overflow: auto` means the
// browser draws a scroller, fades it out when the gesture stops, and thickens
// it on hover. Nothing here is native, so the same affordance has to be built —
// a capsule sized to the visible fraction, faded in while the offset moves and
// out again a beat later.
//
// The bar is a sublayer of the scrolling surface's own layer (NOT its content
// layer), so it stays put while the content translates underneath it.

import AppKit
import QuartzCore

final class Scrollbar {
    /// macOS's overlay metrics, measured: a 7pt capsule inset 2pt from the
    /// edge, with a 3.5pt corner, and a 25pt minimum thumb so a very long
    /// document still leaves something to see.
    private static let thickness: CGFloat = 7
    /// Widened under the pointer, the way the platform's overlay scroller
    /// thickens on rollover so there is something to grab.
    private static let hotThickness: CGFloat = 11
    private static let inset: CGFloat = 2
    private static let minThumb: CGFloat = 25
    private static let fadeDelay: TimeInterval = 0.9
    /// The track's own inset, for mapping a dragged thumb position back to an
    /// offset (the drag is the inverse of `update`).
    static let trackInset: CGFloat = inset

    let layer = CALayer()
    private var fadeWork: DispatchWorkItem?
    private let vertical: Bool

    init(vertical: Bool) {
        self.vertical = vertical
        layer.anchorPoint = .zero
        layer.backgroundColor = NSColor(white: 0, alpha: 0.36).cgColor
        layer.cornerRadius = Scrollbar.thickness / 2
        layer.opacity = 0
        layer.actions = ["position": NSNull(), "bounds": NSNull(), "cornerRadius": NSNull()]
    }

    /// Live geometry from the last `update`, in the surface's MODEL space
    /// (top-left origin) — what a press has to be tested against. Kept here
    /// rather than read back off the layer because the layer is placed bottom-up
    /// and a hit arrives top-down.
    private(set) var live = false
    /// Thumb rect, model space.
    private(set) var thumbRect: CGRect = .zero
    /// How far the thumb can travel, and the content offset that travel spans —
    /// together they convert a pointer delta into a scroll delta.
    private(set) var travel: CGFloat = 0
    private(set) var maxOffset: CGFloat = 0
    /// Widened while the pointer is on the bar or dragging it, as the platform's
    /// overlay scroller does.
    var hot = false { didSet { if hot != oldValue { layer.cornerRadius = width / 2 } } }
    private var width: CGFloat { hot ? Scrollbar.hotThickness : Scrollbar.thickness }

    /// Size and place the thumb for a box of `box`, content of `extent`, at
    /// `offset`. Returns false when there is nothing to scroll, in which case
    /// the caller should keep the bar hidden.
    @discardableResult
    func update(box: CGSize, extent: CGFloat, offset: CGFloat) -> Bool {
        let span = vertical ? box.height : box.width
        guard extent > span + 0.5, span > 0 else { layer.opacity = 0; live = false; return false }
        let frac = min(1, span / extent)
        let thumb = max(Scrollbar.minThumb, (span - 2 * Scrollbar.inset) * frac)
        let tr = (span - 2 * Scrollbar.inset) - thumb
        let maxOff = max(1, extent - span)
        let t = min(1, max(0, offset / maxOff))
        let w = width

        if vertical {
            // The layer space is bottom-up: offset 0 is the TOP of the track.
            layer.bounds = CGRect(x: 0, y: 0, width: w, height: thumb)
            layer.position = CGPoint(x: box.width - w - Scrollbar.inset,
                                     y: box.height - Scrollbar.inset - thumb - tr * t)
            thumbRect = CGRect(x: box.width - w - Scrollbar.inset,
                               y: Scrollbar.inset + tr * t, width: w, height: thumb)
        } else {
            layer.bounds = CGRect(x: 0, y: 0, width: thumb, height: w)
            layer.position = CGPoint(x: Scrollbar.inset + tr * t, y: Scrollbar.inset)
            thumbRect = CGRect(x: Scrollbar.inset + tr * t,
                               y: box.height - w - Scrollbar.inset, width: thumb, height: w)
        }
        layer.cornerRadius = w / 2
        travel = tr
        maxOffset = maxOff
        live = true
        return true
    }

    /// Hold it visible — a bar being dragged must not fade out from under the
    /// pointer, which is what the timed `flash` would do.
    func hold() {
        fadeWork?.cancel()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.opacity = 1
        CATransaction.commit()
    }

    /// Show it now, and schedule the fade — the overlay-scroller behaviour.
    func flash() {
        fadeWork?.cancel()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.opacity = 1
        CATransaction.commit()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            CATransaction.begin()
            CATransaction.setAnimationDuration(0.35)
            self.layer.opacity = 0
            CATransaction.commit()
        }
        fadeWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Scrollbar.fadeDelay, execute: work)
    }

    func hide() {
        fadeWork?.cancel()
        layer.opacity = 0
    }
}
