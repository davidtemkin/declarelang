// LayerTree — the far side of the seam: one settle's ops → one CATransaction.
//
// Every surface is a CALayer. Content (text, drawings, images, gradients) hangs
// off it as fixed-order sublayers, children after them — the same paint order
// the other two renderers produce. Nothing here decides anything: the runtime
// has already resolved geometry, order, visibility and clipping, so this file
// is a pure applier. That is the whole point of the architecture — the
// platform composites; it never negotiates.

import AppKit
import AVFoundation
import CoreImage
import CoreText
import QuartzCore
import ImageIO
import UniformTypeIdentifiers

/// The Blend enum's camelCase tokens → the CIFilter each layer composites
/// with (`compositingFilter` — public API on macOS; compositing.md §2). The
/// same operators are already proven inside drawings through CGBlendMode
/// (DrawReplay); this is the view tier of the same table. `normal` → nil.
private let BLEND_FILTERS: [String: String] = [
    "multiply": "CIMultiplyBlendMode", "screen": "CIScreenBlendMode",
    "overlay": "CIOverlayBlendMode", "darken": "CIDarkenBlendMode",
    "lighten": "CILightenBlendMode", "colorDodge": "CIColorDodgeBlendMode",
    "colorBurn": "CIColorBurnBlendMode", "hardLight": "CIHardLightBlendMode",
    "softLight": "CISoftLightBlendMode", "difference": "CIDifferenceBlendMode",
    "exclusion": "CIExclusionBlendMode", "hue": "CIHueBlendMode",
    "saturation": "CISaturationBlendMode", "color": "CIColorBlendMode",
    "luminosity": "CILuminosityBlendMode", "plusLighter": "CIAdditionCompositing",
]

final class Node {
    let id: Int
    let layer = CALayer()
    /// Children live here — the same layer, unless this surface scrolls, in
    /// which case a content layer carries them so scrolling is a translation.
    var content: CALayer
    var gradient: CAGradientLayer?
    var draw: CALayer?
    var image: CALayer?
    var text: TextLayer?
    var rich: RichOverlay?
    var editable: EditableOverlay?
    var children: [Node] = []
    weak var parent: Node?

    var box = CGRect.zero
    var radius: CGFloat = 0
    var scrolls = false
    var scrollOffset: CGFloat = 0
    var scrollsX = false
    var scrollXOffset: CGFloat = 0
    var scrollExtent: CGFloat = 0
    var scrollExtentX: CGFloat = 0
    var vbar: Scrollbar?
    var hbar: Scrollbar?
    /// Image tint (compositing.md §3.4): the bitmap re-derives as this color
    /// shaped by its own alpha — template-image rendering. nil = untouched.
    var tint: CGColor?
    /// The frost (compositing.md §5.3): what to sample beneath this node.
    var backdrop: (blur: CGFloat, saturate: CGFloat)?
    /// Carries the backdrop filters, masked by the node's cornerRadius. Lives
    /// in the node's PARENT, immediately below the node's own layer — see
    /// `paint(_:)` for why it cannot be a child of the node it frosts.
    var frostLayer: CALayer?
    var scaleK: CGFloat = 1
    /// Rotation in model degrees (clockwise on screen); folded with scale
    /// into one layer transform by applyScale.
    var rotation: CGFloat = 0
    /// This node is the mounted program's ROOT. The App keeps to its frame —
    /// definitional containment (the DOM realizes the same rule as
    /// `overflow: clip` on the root element) — and root-ness lives on the node
    /// so applyClip cannot be argued out of it by a later BOXCLIP 0.
    var isRoot = false
    var pivot = CGPoint.zero
    var boxClip = false
    var clipPath: CGPath?
    /// This surface opts out of its PARENT's box clip (`ignoreclip`).
    var ignoresClip = false
    /// This child does not ride its parent's scroll — fixed chrome. Realized by
    /// hosting the layer on the scroller's OWN layer rather than on the content
    /// layer the scroll translates, which is the same shape `ignoresClip` uses
    /// to escape the clip: stay beside the thing that moves, not inside it.
    var ignoresScroll = false
    /// This surface hosts an EMBEDDED app (an island). Its interior belongs to
    /// the tenant, so it clips to the box like the web's island element does.
    var isEmbedHost = false
    /// Present only when this surface both clips AND has an exempt child: a
    /// CALayer's masksToBounds is all-or-nothing, so the clipped children move
    /// into this sublayer and the exempt ones stay beside it.
    var clipHost: CALayer?
    var textStyle = TextStyleSpec()
    var textString = ""
    var imageHandle: Int?
    var stretch = "fit"
    var mediaId: Int?
    var player: AVPlayerLayer?

    init(id: Int) {
        self.id = id
        content = layer
        // NO isGeometryFlipped: CALayer converts `frame` to `position` using the
        // parent's flip AT SET TIME, and ops arrive CREATE → GEOM → INSERT, so a
        // flag-based flip silently mis-places every layer whose geometry landed
        // before its parent did. Placement is explicit instead (place()).
        layer.anchorPoint = .zero
        layer.masksToBounds = false
        layer.actions = ["position": NSNull(), "bounds": NSNull(), "contents": NSNull(),
                         "backgroundColor": NSNull(), "opacity": NSNull(), "hidden": NSNull(),
                         "cornerRadius": NSNull(), "transform": NSNull(), "shadowOpacity": NSNull(),
                         "shadowOffset": NSNull(), "shadowRadius": NSNull(), "mask": NSNull(),
                         "borderWidth": NSNull(), "borderColor": NSNull(), "sublayers": NSNull()]
    }
}

final class LayerTree {
    private unowned let bridge: Bridge
    private weak var view: DeclareView?
    private var nodes: [Int: Node] = [:]
    private(set) var root: Node?
    /// Surfaces whose drawing must be re-rasterized after a geometry change.
    private var pendingDraw = Set<Int>()
    private var dumped = false

    /// Model box vs where the layer actually lands (converted back into model
    /// coordinates) — the two must agree, and any node where they don't is a
    /// placement bug rather than a rendering one.
    func audit(_ n: Node, _ depth: Int, _ label: String) {
        guard let host = view?.layer else { return }
        let r = n.layer.convert(CGRect(origin: .zero, size: n.box.size), to: host)
        let viewH = view?.bounds.height ?? 0
        let modelY = viewH - r.maxY
        NSLog("[audit] %@ id=%d box=(%.1f,%.1f %.0fx%.0f) rendered=(%.1f,%.1f) delta=(%.1f,%.1f)",
              label, n.id, n.box.origin.x, n.box.origin.y, n.box.width, n.box.height,
              r.origin.x, modelY, r.origin.x - absX(n), modelY - absY(n))
        if depth > 0 { for c in n.children.prefix(6) { audit(c, depth - 1, label + ">") } }
    }
    /// The model's own absolute position (sum of boxes up the tree).
    private func absX(_ n: Node) -> CGFloat {
        var x = n.box.origin.x; var c = n.parent
        while let p = c { x += p.box.origin.x; c = p.parent }
        return x
    }
    private func absY(_ n: Node) -> CGFloat {
        var y = n.box.origin.y; var c = n.parent
        while let p = c { y += p.box.origin.y - (p.scrolls ? p.scrollOffset : 0); c = p.parent }
        return y
    }

    func dump(_ n: Node, _ depth: Int) {
        if depth > (Int(ProcessInfo.processInfo.environment["DECLARE_DEBUG_TREE"] ?? "2") ?? 2) { return }
        let pad = String(repeating: "  ", count: depth)
        NSLog("[tree] %@id=%d box=%@ kids=%d hid=%@ scr=%@ txt=%@ pos=%@", pad, n.id,
              NSStringFromRect(n.box), n.children.count, n.layer.isHidden ? "y" : "n", n.scrolls ? "y" : "n",
              n.textString.isEmpty ? "-" : String(n.textString.prefix(12)), NSStringFromPoint(n.layer.position))
        for c in n.children.prefix(12) { dump(c, depth + 1) }
    }

    init(bridge: Bridge, view: DeclareView) {
        self.bridge = bridge
        self.view = view
    }

    var scale: CGFloat { view?.window?.backingScaleFactor ?? 2 }

    // ── the applier ─────────────────────────────────────────────────────────

    func apply(_ json: String) {
        guard let data = json.data(using: .utf8),
              let ops = (try? JSONSerialization.jsonObject(with: data)) as? [[Any]] else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)          // the runtime owns motion
        sawGeom = false
        if statsOn {
            for op in ops {
                let t = CFAbsoluteTimeGetCurrent()
                applyOne(op)
                if let c = op.first as? NSNumber {
                    opMs[c.intValue, default: 0] += (CFAbsoluteTimeGetCurrent() - t) * 1000
                }
            }
        } else {
            for op in ops { applyOne(op) }
        }
        if statsOn {
            rasterCount += pendingDraw.count
            // WHICH view is re-rastering, and how big it is — "one DRAW per
            // frame" is only a defect once you know whose.
            for id in pendingDraw { drawNodes[id, default: 0] += 1 }
        }
        let rt0 = statsOn ? CFAbsoluteTimeGetCurrent() : 0
        for id in pendingDraw { nodes[id].map { rasterize($0) } }
        if statsOn { rasterMsTotal += (CFAbsoluteTimeGetCurrent() - rt0) * 1000 }
        pendingDraw.removeAll()
        // Geometry is final now — this is the first moment a flow's band is
        // worth rastering, and it is still inside the transaction below.
        flushBands()
        // Frosts need nothing here. They are background filters on their own
        // layers, so the compositor re-derives them from whatever it draws
        // beneath — on every frame it presents, not merely on the settles we
        // happen to notice (compositing.md §5.2: a frost invalidates on
        // under-content change, never on its own state — which is now the
        // window server's invariant to keep rather than ours to re-walk).
        let ct0 = statsOn ? CFAbsoluteTimeGetCurrent() : 0
        CATransaction.commit()
        if statsOn { caCommitMsTotal += (CFAbsoluteTimeGetCurrent() - ct0) * 1000 }
        let ro0 = statsOn ? CFAbsoluteTimeGetCurrent() : 0
        view?.repositionOverlays()
        if statsOn { overlayMsTotal += (CFAbsoluteTimeGetCurrent() - ro0) * 1000 }
        if ProcessInfo.processInfo.environment["DECLARE_DEBUG_TREE"] != nil, let r = root, !dumped {
            dumped = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                guard let self else { return }
                self.dump(r, 0)
                // audit the dock subtree specifically
                for c in r.children where c.box.height == 150 { self.audit(c, 2, "dock") }
            }
        }
    }

    private func num(_ v: Any?) -> CGFloat { CGFloat((v as? NSNumber)?.doubleValue ?? 0) }
    private func str(_ v: Any?) -> String? { v as? String }

    /// Op-code tally for the stats window. The failure mode worth naming is a
    /// DRAW arriving every frame: draw.ts's rule is "draw runs on invalidation,
    /// never per frame", and a dock icon whose draw body reads its own width
    /// breaks it — that was the Safari jank, and it would cost far more here.
    var opHist: [Int: Int] = [:]
    /// How many display lists were actually re-rastered in the window — the cost
    /// that a per-frame DRAW would multiply.
    var rasterCount = 0
    var drawNodes: [Int: Int] = [:]
    /// Wall time spent re-rastering display lists in the window.
    var rasterMsTotal = 0.0
    /// Time in repositionOverlays (visibleRect + occluders + bands) per window.
    var overlayMsTotal = 0.0
    /// Wall time per opcode — which op is actually costing the frame.
    var opMs: [Int: Double] = [:]
    /// Time inside CATransaction.commit — where Core Animation does the layout
    /// and calls back into every dirty layer's draw(in:).
    var caCommitMsTotal = 0.0
    /// Synchronous AppKit text layout — one per setRichContent, on the settle path.
    var richLayoutCount = 0
    var richLayoutMs = 0.0
    var richLayoutBytes = 0
    var richParseMs = 0.0
    var statsOn = false
    /// Did the commit just applied carry GEOMETRY? A gap only means a dropped
    /// frame of MOTION if motion was in flight either side of it.
    var sawGeom = false

    private func applyOne(_ op: [Any]) {
        if let code = op.first as? NSNumber {
            if statsOn { opHist[code.intValue, default: 0] += 1 }
            if code.intValue == 5 { sawGeom = true }
        }
        guard op.count >= 2, let code = (op[0] as? NSNumber)?.intValue,
              let id = (op[1] as? NSNumber)?.intValue else { return }
        let a: (Int) -> Any? = { i in op.count > i + 2 ? op[i + 2] : nil }

        switch code {
        case 1: // CREATE
            // A node may already exist: richLayout() is SYNCHRONOUS during the
            // settle, so it can reach a surface whose CREATE is still sitting in
            // this very buffer. Overwriting here would orphan its overlay.
            if nodes[id] == nil { nodes[id] = Node(id: id) }
        case 2: // DESTROY — the WHOLE subtree, not one node. The runtime destroys
            // a tree by destroying its root surface (clearEmbed evicting an
            // island tenant is the big case), and descendants own state that
            // does NOT live inside the root's layer: AppKit overlays
            // (NSTextView/NSTextField draw above the whole layer tree with no
            // model behind them), scrollbars, and any layer a seam reparented.
            // Tearing down only the root's layer left those painting — measured
            // as ownerless text-line layers over the viewer after a mode-switch
            // remount ("stray source text over the title bar").
            if let n = nodes[id] {
                if let p = n.parent, let i = p.children.firstIndex(where: { $0 === n }) { p.children.remove(at: i) }
                tearDown(n)
            }
        case 3: // INSERT parent=id, child, before
            guard let n = nodes[id], let cid = (a(0) as? NSNumber)?.intValue, let c = nodes[cid] else { return }
            let beforeId = (a(1) as? NSNumber)?.intValue ?? -1
            if let op = c.parent, let i = op.children.firstIndex(where: { $0 === c }) { op.children.remove(at: i) }
            c.layer.removeFromSuperlayer()
            // the frost lives in the PARENT, so re-homing the node has to take
            // it along — the old parent is not restacked and would keep it
            c.frostLayer?.removeFromSuperlayer()
            var at = n.children.count
            if beforeId >= 0, let b = nodes[beforeId], let i = n.children.firstIndex(where: { $0 === b }) { at = i }
            n.children.insert(c, at: at)
            c.parent = n
            restack(n)
            place(c)
        case 4: // ROOT
            guard let n = nodes[id] else { return }
            let old = root
            old?.isRoot = false
            root = n
            n.isRoot = true
            applyClip(n)               // containment at the frame, from this moment
            view?.setRoot(n.layer)
            place(n)
            // A NEW ROOT means the previous program is gone. The runtime tells us
            // nothing more than that — it discards its own tree without emitting
            // a DESTROY per surface — so the old nodes would sit in `nodes`
            // forever. Re-booting in process (`__declareBoot`, which the gate
            // uses to walk a corpus in one launch) leaked the WHOLE previous
            // layer tree each time: 427 layers → 857 → 1287 → 1717 cycling
            // between two programs. Sweep whatever the new root cannot reach.
            if old !== nil, old !== n { sweepUnreachable(from: n) }
        case 5: // GEOM
            guard let n = nodes[id] else { return }
            n.box = CGRect(x: num(a(0)), y: num(a(1)), width: max(0, num(a(2))), height: max(0, num(a(3))))
            place(n)
            for c in n.children { place(c) }      // their flip depends on this height
            layoutContent(n)
            if n.rich != nil { refreshBand(n) }
            if n.frostLayer != nil { syncFrost(n) }
            if n.scaleK != 1 || n.rotation != 0 { applyScale(n) }    // the pivot mirrors against the new height
            // NOT re-rasterized here. A recording is in the view's own
            // coordinates and does not depend on the box, so moving or
            // resizing a view can never invalidate it — the rendering model's
            // rule 3, which both web backends also honor. Re-rastering on
            // geometry made every magnifying dock icon redraw its art each
            // frame (measured: 151ms average commit, 457ms worst).
            if n.clipPath != nil || n.boxClip { applyClip(n) }
            if n.layer.shadowOpacity > 0 { applyShadowPath(n) }
        case 32: // PAGEFILL — the page behind a TOP-LEVEL app wears the app's
            // own background (the DOM paints documentElement/body; the canvas
            // backend mirrors it). Natively "the page" is the hosting view and
            // its window: everything the root's own layer does not cover.
            let c = str(a(0)).flatMap { CSSColor.parse($0)?.cgColor }
            view?.layer?.backgroundColor = c
            if let cg = c { view?.window?.backgroundColor = NSColor(cgColor: cg) ?? .windowBackgroundColor }
        case 6: // FILL
            guard let n = nodes[id] else { return }
            n.gradient?.removeFromSuperlayer(); n.gradient = nil
            let fill = str(a(0)).flatMap { CSSColor.parse($0)?.cgColor }
            // The fill rides the node's OWN layer even when frosted: the frost
            // is a sibling BELOW the node now, so this paints over the blur and
            // under the children, which is exactly the material contract.
            n.layer.backgroundColor = fill
        case 7: // GRADIENT
            guard let n = nodes[id], let spec = a(0) as? [String: Any] else { return }
            applyGradient(n, spec)
        case 8: // RADIUS
            guard let n = nodes[id] else { return }
            n.radius = num(a(0))
            n.layer.cornerRadius = n.radius
            n.clipHost?.cornerRadius = n.radius
            if n.frostLayer != nil { syncFrost(n) }
            if n.boxClip { applyClip(n) }
            if n.layer.shadowOpacity > 0 { applyShadowPath(n) }
        case 9: // STROKE (inside the box, like the other renderers)
            guard let n = nodes[id] else { return }
            if a(0) == nil || a(0) is NSNull {
                n.layer.borderWidth = 0
            } else {
                n.layer.borderWidth = num(a(0))
                n.layer.borderColor = str(a(1)).flatMap { CSSColor.parse($0)?.cgColor }
            }
        case 10: // SHADOW
            guard let n = nodes[id] else { return }
            if a(0) == nil || a(0) is NSNull {
                n.layer.shadowOpacity = 0
            } else {
                let color = str(a(3)).flatMap { CSSColor.parse($0) } ?? .black
                // ⚠ NEGATE Y. The comment this replaces claimed "flipped space:
                // +y is down", but nothing here is flipped — `isGeometryFlipped`
                // is deliberately never set (see Node.init) and placement is
                // explicit bottom-up arithmetic, so the layer space is y-UP.
                // A CSS shadow's +dy means DOWN, which is −y here. Cast upward,
                // every window was ~15 luminance too dark above and ~20 too
                // light below, measured against the DOM.
                n.layer.shadowOffset = CGSize(width: num(a(0)), height: -num(a(1)))
                n.layer.shadowRadius = num(a(2)) / 2                                 // CSS blur ≈ 2× CA radius
                n.layer.shadowColor = color.withAlphaComponent(1).cgColor
                n.layer.shadowOpacity = Float(color.alphaComponent)
                applyShadowPath(n)
            }
        case 11: // VISIBLE
            nodes[id]?.layer.isHidden = num(a(0)) == 0
            nodes[id].map { syncFrost($0) }
        case 12: // OPACITY
            nodes[id]?.layer.opacity = Float(num(a(0)))
            nodes[id].map { syncFrost($0) }
        case 13: // SCALE
            guard let n = nodes[id] else { return }
            n.scaleK = num(a(0)); n.pivot = CGPoint(x: num(a(1)), y: num(a(2)))
            applyScale(n)
        case 38: // ROTATE — degrees, clockwise on screen; pivot rides SCALE
            // (the runtime pushes both together)
            guard let n = nodes[id] else { return }
            n.rotation = num(a(0))
            applyScale(n)
        case 39: // MEDIA — bind this node to a native player (Media.swift).
            // The frames never cross the bridge: AVPlayerLayer draws them.
            guard let n = nodes[id] else { return }
            n.mediaId = (a(0) as? NSNumber)?.intValue
            applyMedia(n)
        case 14: // CLIP (shape)
            guard let n = nodes[id] else { return }
            n.clipPath = str(a(0)).flatMap { bridge.path(for: $0) }
            restack(n)                       // may add or drop the clip host
            applyClip(n)
        case 15: // BOXCLIP
            guard let n = nodes[id] else { return }
            n.boxClip = num(a(0)) != 0
            restack(n)
            applyClip(n)
        case 16: // TEXT
            guard let n = nodes[id] else { return }
            n.textString = str(a(0)) ?? ""
            applyText(n)
        case 17: // TEXTSTYLE
            guard let n = nodes[id], let s = a(0) as? [String: Any] else { return }
            let st = parseTextStyle(s)
            n.textStyle = st
            applyText(n)
            // An editable already configured must pick up the new face: the two
            // ops are independent and TEXTSTYLE can land after EDIT.
            n.editable?.restyle(st)
            // An editable already configured must pick up the new face: the two
            // ops are independent and TEXTSTYLE often lands after EDIT.
            n.editable?.restyle(st)
        case 18: // DRAW
            guard let n = nodes[id] else { return }
            if a(0) == nil || a(0) is NSNull {
                n.draw?.removeFromSuperlayer(); n.draw = nil; n.drawList = nil
            } else {
                n.drawList = a(0) as? [String: Any]
                pendingDraw.insert(id)
            }
        case 19: // IMAGE
            guard let n = nodes[id] else { return }
            n.imageHandle = (a(0) as? NSNumber)?.intValue
            // A cleared source clears whichever content kind held the box —
            // the runtime's setImage(null) can follow a MEDIA bind too.
            if n.imageHandle == nil, n.player != nil { n.mediaId = nil; applyMedia(n) }
            applyImage(n)
        case 20: // STRETCH
            guard let n = nodes[id] else { return }
            n.stretch = str(a(0)) ?? "fit"
            applyImage(n)
            if n.player != nil { applyMedia(n) }
        case 21: // SCROLL
            guard let n = nodes[id] else { return }
            let on = num(a(0)) != 0
            if on != n.scrolls { n.scrolls = on; ensureContentLayer(n); applyClip(n) }
        case 22: // SCROLLPOS
            guard let n = nodes[id] else { return }
            n.scrollOffset = num(a(0))
            if let e = a(1) as? NSNumber { n.scrollExtent = CGFloat(e.doubleValue) }
            place(n)
            for c in n.children { place(c) }
            updateBars(n, flash: true)
            view?.repositionOverlays()
        case 30: // SCROLLX — a horizontally scrolling surface
            guard let n = nodes[id] else { return }
            let onX = num(a(0)) != 0
            if onX != n.scrollsX {
                n.scrollsX = onX
                ensureContentLayer(n)
                applyClip(n)
                place(n)
                for c in n.children { place(c) }
            }
        case 31: // SCROLLXPOS
            guard let n = nodes[id] else { return }
            n.scrollXOffset = num(a(0))
            if let e = a(1) as? NSNumber { n.scrollExtentX = CGFloat(e.doubleValue) }
            place(n)
            for c in n.children { place(c) }
            updateBars(n, flash: true)
            view?.repositionOverlays()
        case 23: // CURSOR
            if id == 0 { view?.setCursor(str(a(0)) ?? "") }
        case 24: // EDIT
            guard let n = nodes[id], let v = view else { return }
            if let spec = a(0) as? [String: Any] {
                if n.editable == nil { n.editable = EditableOverlay(id: id, view: v, bridge: bridge) }
                // An editable carries its OWN style — the DOM styles its element
                // from `spec.style` rather than from the surface's text style, and
                // a `TextInput` never emits a TEXTSTYLE of its own. Falling back
                // to the surface's left the Viewer's code editor proportional.
                let style = (spec["style"] as? [String: Any]).map(parseTextStyle) ?? n.textStyle
                n.editable?.configure(spec, style: style)
            } else { n.editable?.remove(); n.editable = nil }
        case 25: // EDITFOCUS
            nodes[id]?.editable?.setFocus(num(a(0)) != 0)
        case 26: // RICH — handled synchronously by richLayout(); nothing here
            break
        case 28: // EMBED — the host reads markers from JS; nothing to draw here,
            // but the island must CLIP: its interior is the tenant's, and a
            // tenant taller than its box was painting over the window that
            // contains it (and past the window's own edge).
            guard let n = nodes[id] else { return }
            n.isEmbedHost = !(str(a(0)) ?? "").isEmpty
            applyClip(n)
        case 29: // IGNORECLIP — this surface escapes its PARENT's box clip
            guard let n = nodes[id] else { return }
            n.ignoresClip = num(a(0)) != 0
            if let p = n.parent { restack(p); applyClip(p) }
        case 34: // RICHWIDTH — a rich flow adopts a new width WITHOUT re-flowing
            guard let n = nodes[id], let r = n.rich else { return }
            r.adoptWidth(num(a(0)))
        case 33: // IGNORESCROLL — this surface is pinned to its scroller's frame
            guard let n = nodes[id] else { return }
            let on = num(a(0)) != 0
            guard on != n.ignoresScroll else { return }
            n.ignoresScroll = on
            // Re-host: restack decides content-layer vs own-layer per child, and
            // the layer must be re-placed because its parent-relative y is now
            // measured against a box that no longer scrolls under it.
            if let p = n.parent { restack(p); place(n) }
        case 37: // TINT — the color multiplied over the bitmap's alpha
            // (compositing.md §3.4, template-image rendering); the contents
            // re-derive from the original on every change, so un-tinting
            // restores the untouched bitmap.
            guard let n = nodes[id] else { return }
            n.tint = str(a(0)).flatMap { CSSColor.parse($0)?.cgColor }
            applyImage(n)
        case 36: // BACKDROP — the frost (compositing.md §5.3), on the
            // compositor: `backgroundFilters` filters what the window server
            // draws behind a layer, which is the exact analogue of the web's
            // backdrop-filter and costs us no rendering at all. It replaced a
            // CPU sampler that rendered the whole layer tree once per frosted
            // node per commit; weather ran at 0.45 fps on it and runs at the
            // display's 120 Hz on this.
            //
            // The plan rejected NSVisualEffectView for a reason that does not
            // reach here — that is an AppKit SUBVIEW, and a subview always
            // draws above the whole CALayer tree (the RichOverlay lesson,
            // stated in Overlays.swift), so its material would paint over the
            // frosted panel's own children. A background filter is an ordinary
            // layer property, so it takes an ordinary place in the z-order.
            //
            // The frost is a SIBLING of the node, not a child of it: see
            // `paint(_:)`, which is also what puts it into the tree.
            guard let n = nodes[id] else { return }
            if a(0) == nil || a(0) is NSNull {
                guard n.backdrop != nil else { return }
                n.backdrop = nil
                n.frostLayer?.removeFromSuperlayer()
                n.frostLayer = nil
                if let p = n.parent { restack(p) }
            } else {
                n.backdrop = (blur: num(a(0)), saturate: num(a(1)))
                if n.frostLayer == nil {
                    let f = CALayer()
                    f.anchorPoint = .zero
                    // The filter is confined by the layer's OWN clip — measured:
                    // an unclipped filtered layer floods its whole group with
                    // the blur instead of keeping it inside its box.
                    f.masksToBounds = true
                    f.actions = ["position": NSNull(), "bounds": NSNull(), "cornerRadius": NSNull(),
                                 "transform": NSNull(), "hidden": NSNull(), "opacity": NSNull(),
                                 "backgroundFilters": NSNull()]
                    n.frostLayer = f
                    // it enters the tree as a SIBLING, which only restack can do
                    if let p = n.parent { restack(p) }
                }
                syncFrost(n)
                applyFrostFilters(n)
            }
        case 35: // BLEND — the view-tier compositing operator (compositing.md
            // §4.1). A compositing filter rides the LAYER, not the order:
            // Core Animation renders the layer's subtree as a group and lands
            // it with the filter against what is already composited beneath —
            // the same blends-as-a-unit semantics the web backends realize.
            // restack/clipHost are untouched.
            guard let n = nodes[id] else { return }
            n.layer.compositingFilter = (str(a(0)).flatMap { BLEND_FILTERS[$0] }).flatMap { CIFilter(name: $0) }
        default:
            break
        }
    }

    // ── the frost (compositing.md §5.3) ─────────────────────────────────────

    /// Keep the frost glued to the node it belongs to. It is a SIBLING, not a
    /// child, so nothing about the node propagates to it automatically: box,
    /// pose, rounding and visibility all have to be mirrored by hand, and any
    /// op that moves one of those has to come through here.
    private func syncFrost(_ n: Node) {
        guard let f = n.frostLayer else { return }
        f.bounds = n.layer.bounds
        f.position = n.layer.position
        f.transform = n.layer.transform
        f.cornerRadius = n.radius
        f.isHidden = n.layer.isHidden
        f.opacity = n.layer.opacity
    }

    /// The sample-under, natively: hand the window server the filters and let
    /// it filter this layer's BACKDROP as it composites. Nothing is rendered
    /// here, nothing is re-rendered on change, and the frost stays live under
    /// motion for free — the compositor already knows what is behind a layer,
    /// which is the whole reason backdrop-filter is cheap on the web too.
    ///
    /// Note this reads "beneath" as Z-ORDER — content stacked ABOVE a frosted
    /// panel does not join the sample. That is the web's reading, and the
    /// reading compositing.md §5.3 states; the CPU sampler this replaces could
    /// only render the whole tree minus one node, and recorded the difference
    /// as a scope note.
    private func applyFrostFilters(_ n: Node) {
        guard let spec = n.backdrop, let fl = n.frostLayer else { return }
        var fs: [CIFilter] = []
        if spec.blur > 0, let f = CIFilter(name: "CIGaussianBlur") {
            // inputRadius IS the standard deviation, which is what CSS
            // blur(<length>) means (measured — see DrawReplay.composite).
            // Stated in view px and used as-is: a background filter runs in the
            // LAYER's coordinate space, not the backdrop's device pixels.
            // Measured — scaling by `scale` here overshoots and moves the probe
            // further from the web (4.27% vs 3.79% differing), it does not
            // sharpen it.
            f.setValue(spec.blur, forKey: kCIInputRadiusKey)
            fs.append(f)
        }
        if spec.saturate != 1, let f = CIFilter(name: "CIColorMatrix") {
            // The CSS `saturate(s)` matrix verbatim (Filter Effects, Rec.709
            // luma weights), so this matches the web by construction rather
            // than by trusting a knob whose weights are undocumented.
            // CIColorControls' saturation measured the same here (1.26% vs
            // 1.27% on the probe) — this is chosen for being pinned to the
            // spec, not for a difference it makes today.
            let s = spec.saturate
            f.setValue(CIVector(x: 0.213 + 0.787 * s, y: 0.715 - 0.715 * s, z: 0.072 - 0.072 * s, w: 0),
                       forKey: "inputRVector")
            f.setValue(CIVector(x: 0.213 - 0.213 * s, y: 0.715 + 0.285 * s, z: 0.072 - 0.072 * s, w: 0),
                       forKey: "inputGVector")
            f.setValue(CIVector(x: 0.213 - 0.213 * s, y: 0.715 - 0.715 * s, z: 0.072 + 0.928 * s, w: 0),
                       forKey: "inputBVector")
            f.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
            fs.append(f)
        }
        // Filter in ENCODED sRGB, not linear light — the DrawReplay precedent,
        // and the reason the CPU sampler this replaces built its own
        // CIContext with a null working space. Core Animation gives a
        // background filter chain no such control, so the conversion is done
        // IN the chain: decode in, re-encode out. Without it `saturate` bites
        // far harder than the web's (measured on the frost probe: teal reads
        // R=11 against the web's R=100).
        if !fs.isEmpty,
           let toSRGB = CIFilter(name: "CILinearToSRGBToneCurve"),
           let toLinear = CIFilter(name: "CISRGBToneCurveToLinear") {
            fs = [toSRGB] + fs + [toLinear]
        }
        fl.backgroundFilters = fs
        // No inputImage on either filter: Core Animation supplies the backdrop.
    }

    // ── content plumbing ────────────────────────────────────────────────────

    /// What a child contributes to its parent's paint order: its own layer,
    /// preceded by its frost if it has one.
    ///
    /// The frost CANNOT be a child of the node it frosts. A background filter
    /// samples only what is painted beneath its layer INSIDE that layer's own
    /// parent — and inside a frosted node there is nothing beneath, so a frost
    /// parented there comes out completely unblurred (measured). As a sibling
    /// laid directly under the node it sees exactly the siblings it covers,
    /// which is the reading the web gives it. Everything the node itself
    /// paints — its fill, then its children — lands above, so the material
    /// contract (wash OVER blur) falls out of the ordering for free.
    private func paint(_ c: Node) -> [CALayer] {
        c.frostLayer.map { [$0, c.layer] } ?? [c.layer]
    }

    /// Re-establish paint order: gradient, drawing, image, text, then children.
    private func restack(_ n: Node) {
        var order: [CALayer] = []
        if let g = n.gradient { order.append(g) }
        if let d = n.draw { order.append(d) }
        if let i = n.image { order.append(i) }
        if let p = n.player { order.append(p) }
        if let t = n.text { order.append(t) }
        if let rf = n.rich { order.append(rf.contentLayer) }
        if n.content !== n.layer { order.append(n.content) }

        // An exempt child has to sit OUTSIDE whatever does the clipping, so the
        // clipped children get their own host layer and the exempt ones stay
        // beside it. The host takes the slot of the first clipped child, which
        // keeps paint order right for the shapes this arises in (a pill or a
        // halo drawn past the edge of the thing it belongs to).
        let clips = n.boxClip || n.clipPath != nil
        let exempt = n.children.contains { $0.ignoresClip }
        if clips && exempt {
            if n.clipHost == nil {
                let h = CALayer()
                h.anchorPoint = .zero
                h.actions = ["position": NSNull(), "bounds": NSNull(), "mask": NSNull(), "sublayers": NSNull()]
                n.clipHost = h
            }
        } else if n.clipHost != nil {
            n.clipHost?.removeFromSuperlayer()
            n.clipHost = nil
        }

        // The bars ride above everything this surface paints, and have to be
        // part of `order` — restack assigns `sublayers` wholesale, so anything
        // merely added with addSublayer is dropped on the next restack.
        var top: [CALayer] = []
        if let b = n.vbar { top.append(b.layer) }
        if let b = n.hbar { top.append(b.layer) }

        let host = n.content
        for l in order where l !== n.content { if l.superlayer !== n.layer { n.layer.addSublayer(l) } }
        for l in top { if l.superlayer !== n.layer { n.layer.addSublayer(l) } }

        if let ch = n.clipHost {
            let clipped = n.children.filter { !$0.ignoresClip }.flatMap { paint($0) }
            var outer: [CALayer] = []
            var placedHost = false
            for c in n.children {
                if c.ignoresClip { outer.append(contentsOf: paint(c)) }
                else if !placedHost { outer.append(ch); placedHost = true }
            }
            if !placedHost { outer.append(ch) }
            for l in outer { if l.superlayer !== host { host.addSublayer(l) } }
            for l in clipped { if l.superlayer !== ch { ch.addSublayer(l) } }
            ch.sublayers = clipped
            n.layer.sublayers = order + (n.content === n.layer ? outer : []) + top
            if n.content !== n.layer { n.content.sublayers = outer }
            applyClip(n)
            placeClipHost(n)
            return
        }

        // PINNED children (ignoreScroll) host on the scroller's own layer, which
        // does not translate, while the rest ride the content layer that does.
        // Only meaningful when this surface actually scrolls — on a non-scrolling
        // parent `content === layer`, so the split is a no-op and the flag simply
        // waits for an ancestor that scrolls. (v1 scope: the pin is against the
        // DIRECT parent's scroll, which is every use in the corpus — chrome is
        // declared inside the scroller it pins to. A pinned node nested deeper
        // still rides the intervening boxes; the DOM backend resolves that by
        // walking to the nearest scrolling ancestor, and matching it needs
        // re-homing across nodes, not just a different host layer here.)
        let scrolling = n.content !== n.layer
        let pinned = scrolling ? n.children.filter { $0.ignoresScroll }.flatMap { paint($0) } : []
        let flowing = scrolling ? n.children.filter { !$0.ignoresScroll }.flatMap { paint($0) }
                                : n.children.flatMap { paint($0) }
        for c in flowing { if c.superlayer !== host { host.addSublayer(c) } }
        for c in pinned { if c.superlayer !== n.layer { n.layer.addSublayer(c) } }
        // Enforce order explicitly (CALayer keeps insertion order). Pinned chrome
        // sits after the content layer, so it paints over what scrolls beneath it.
        n.layer.sublayers = order + (scrolling ? [] : flowing) + pinned + top
        if scrolling { n.content.sublayers = flowing }
    }

    /// A surface that scrolls on EITHER axis carries its children on a content
    /// layer, so scrolling is one translation rather than a walk.
    private func ensureContentLayer(_ n: Node) {
        let needed = n.scrolls || n.scrollsX
        if needed, n.content === n.layer {
            let c = CALayer()
            c.anchorPoint = .zero
            c.bounds = CGRect(origin: .zero, size: n.box.size)
            c.actions = n.layer.actions
            n.layer.addSublayer(c)
            n.content = c
            restack(n)
        } else if !needed, n.content !== n.layer {
            let c = n.content
            n.content = n.layer
            c.removeFromSuperlayer()
            restack(n)
        }
    }

    /// Keep a scrolling surface's overlay bars sized and placed. `flash` shows
    /// them (a scroll just happened); otherwise they only re-place, so a resize
    /// does not make them appear.
    private func updateBars(_ n: Node, flash: Bool) {
        if ProcessInfo.processInfo.environment["DECLARE_DEBUG_BAR"] != nil {
            NSLog("[bar] id=%d box=%@ vExtent=%.0f off=%.0f scrolls=%d flash=%d",
                  n.id, NSStringFromSize(n.box.size), n.scrollExtent, n.scrollOffset, n.scrolls ? 1 : 0, flash ? 1 : 0)
        }
        if n.scrolls {
            if n.vbar == nil {
                let b = Scrollbar(vertical: true)
                n.vbar = b
                restack(n)
            }
            if let b = n.vbar {
                let live = b.update(box: n.box.size, extent: n.scrollExtent, offset: n.scrollOffset)
                if live, flash { b.flash() }
                if !live { b.hide() }
            }
        } else { n.vbar?.hide() }

        if n.scrollsX {
            if n.hbar == nil {
                let b = Scrollbar(vertical: false)
                n.hbar = b
                restack(n)
            }
            if let b = n.hbar {
                let live = b.update(box: n.box.size, extent: n.scrollExtentX, offset: n.scrollXOffset)
                if live, flash { b.flash() }
                if !live { b.hide() }
            }
        } else { n.hbar?.hide() }
    }

    private func placeClipHost(_ n: Node) {
        guard let ch = n.clipHost else { return }
        ch.bounds = CGRect(origin: .zero, size: n.box.size)
        ch.position = .zero
        // The host does the clipping now, so it also has to carry the CORNER —
        // leaving the radius behind on n.layer (whose masksToBounds is off)
        // squared off every rounded window.
        ch.cornerRadius = n.radius
    }

    /// THE placement rule. The model is top-left; Core Animation is bottom-left.
    /// Every layer is positioned explicitly against its parent's CURRENT height,
    /// so insertion order cannot matter — the failure a geometry flag caused.
    private func place(_ n: Node) {
        let parentH: CGFloat = n.parent.map { $0.box.height } ?? (view?.bounds.height ?? n.box.height)
        n.layer.bounds = CGRect(origin: .zero, size: n.box.size)
        n.layer.position = CGPoint(x: n.box.origin.x, y: parentH - n.box.origin.y - n.box.height)
        if n.content !== n.layer {
            // The scroll content layer spans the box; scrolling DOWN moves the
            // content UP, which is +y in this space, and scrolling RIGHT moves
            // it LEFT, which is -x.
            n.content.bounds = CGRect(origin: .zero, size: n.box.size)
            n.content.position = CGPoint(x: -n.scrollXOffset, y: n.scrollOffset)
        }
        placeClipHost(n)
        syncFrost(n)
        n.rich?.place(inBox: n.box.size, scale: scale)
        if n.scrolls || n.scrollsX { updateBars(n, flash: false) }
    }

    private func layoutContent(_ n: Node) {
        let h = n.box.height
        if let g = n.gradient { g.bounds = CGRect(origin: .zero, size: n.box.size); g.position = .zero }
        if let i = n.image { i.bounds = CGRect(origin: .zero, size: n.box.size); i.position = .zero }
        if let p = n.player { p.bounds = CGRect(origin: .zero, size: n.box.size); p.position = .zero }
        if let t = n.text {
            t.bounds = CGRect(origin: .zero, size: CGSize(width: max(n.box.width, 1), height: max(h, 1)))
            t.position = .zero
        }
    }

    /// A TextStyle payload → the spec. Shared by TEXTSTYLE and by EDIT, which
    /// carries a style of its own (as the DOM's EditableSpec does).
    private func parseTextStyle(_ s: [String: Any]) -> TextStyleSpec {
        var st = TextStyleSpec()
        let family = s["family"] as? String ?? "system-ui"
        let size = (s["size"] as? NSNumber)?.doubleValue ?? 13
        let weight = s["weight"]
        let weightStr: String = {
            if let n = weight as? NSNumber { return String(n.intValue) }
            if let t = weight as? String { return t == "bold" ? "700" : t == "semibold" ? "600" : t == "medium" ? "500" : t == "light" ? "300" : "400" }
            return "400"
        }()
        let italic = (s["italic"] as? NSNumber)?.boolValue ?? false
        st.fontCSS = "\(italic ? "italic " : "")\(weightStr) \(size)px \(family)"
        st.color = (s["color"] as? String).flatMap { CSSColor.parse($0) }
        switch s["align"] as? String {
        case "center": st.align = .center
        case "right": st.align = .right
        default: st.align = .left
        }
        st.wrap = (s["wrap"] as? NSNumber)?.boolValue ?? false
        st.letterSpacing = (s["letterSpacing"] as? NSNumber)?.doubleValue ?? 0
        st.selectable = (s["selectable"] as? NSNumber)?.boolValue ?? false
        if let sh = s["shadow"] as? [Any], sh.count == 4 {
            st.shadow = ((sh[0] as? NSNumber)?.doubleValue ?? 0, (sh[1] as? NSNumber)?.doubleValue ?? 0,
                         (sh[2] as? NSNumber)?.doubleValue ?? 0,
                         (sh[3] as? String).flatMap { CSSColor.parse($0) } ?? .labelColor)
        }
        if let g = s["fillGradient"] as? [String: Any] {
            let stops = g["stops"] as? [[Any]] ?? []
            let colors = stops.compactMap { ($0.count > 1 ? $0[1] as? String : nil).flatMap { CSSColor.parse($0)?.cgColor } }
            let locs = stops.enumerated().map { (i, e) -> CGFloat in
                if let n = e.first as? NSNumber { return CGFloat(n.doubleValue) }
                return stops.count <= 1 ? 0 : CGFloat(i) / CGFloat(stops.count - 1)
            }
            // The same resampling the box gradients get, so a ramp reads
            // identically whether it fills a box or a word.
            let (rc, rl) = GradientStops.resampled(colors: colors, locations: locs)
            if !rc.isEmpty {
                st.fillGradient = TextGradient(angle: (g["angle"] as? NSNumber)?.doubleValue ?? 180,
                                              colors: rc, locations: rl)
            }
        }
        return st
    }

    private func applyText(_ n: Node) {
        if n.textString.isEmpty {
            n.text?.removeFromSuperlayer(); n.text = nil; restack(n); return
        }
        let t: TextLayer
        if let existing = n.text { t = existing } else {
            t = TextLayer()
            t.anchorPoint = .zero
            n.text = t
            restack(n)
        }
        t.contentsScale = scale
        // The baseline contract: ascent+descent line box, first baseline AT the
        // ascent — the same numbers the measurer answered the layout with.
        // The SAME rounded metrics the measurer answered with — drawing at the
        // true Core Text ascent while the layout was computed from the rounded
        // one would reintroduce the very offset the rounding removes.
        let m = TextEngine.measure(text: "", font: n.textStyle.fontCSS, letterSpacing: 0, scale: scale)
        t.ascent = CGFloat(m[1])
        t.descent = CGFloat(m[2])
        t.wrap = n.textStyle.wrap
        t.align = n.textStyle.align
        t.fillGradient = n.textStyle.fillGradient
        t.attributed = TextEngine.attributed(n.textString, style: n.textStyle)
        t.bounds = CGRect(origin: .zero, size: CGSize(width: max(n.box.width, 1), height: max(n.box.height, 1)))
        t.position = .zero
    }

    private func applyImage(_ n: Node) {
        guard let h = n.imageHandle, let img = bridge.image(h) else {
            n.image?.removeFromSuperlayer(); n.image = nil; restack(n); return
        }
        let l: CALayer
        if let e = n.image { l = e } else {
            l = CALayer(); l.anchorPoint = .zero
            l.actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull()]
            n.image = l; restack(n)
        }
        l.contents = n.tint.flatMap { LayerTree.tinted(img, $0) } ?? img
        l.contentsGravity = n.stretch == "fill" ? .resize : (n.stretch == "cover" ? .resizeAspectFill : .resizeAspect)
        l.masksToBounds = true
        l.bounds = CGRect(origin: .zero, size: n.box.size)
        l.position = .zero
    }

    func imageLoaded(handle: Int, image: CGImage) {
        for (_, n) in nodes where n.imageHandle == handle { applyImage(n) }
    }

    /// The player layer for a media-bound node. Binding is idempotent and safe
    /// before the item is ready — Core Animation starts showing frames the
    /// moment the player has them (mediaReady re-applies for the node whose
    /// MEDIA op raced the load).
    private func applyMedia(_ n: Node) {
        guard let mid = n.mediaId, let p = bridge.media.player(mid) else {
            n.player?.removeFromSuperlayer(); n.player = nil; restack(n); return
        }
        let l: AVPlayerLayer
        if let e = n.player, e.player === p { l = e } else {
            n.player?.removeFromSuperlayer()
            l = AVPlayerLayer(player: p)
            l.anchorPoint = .zero
            l.actions = ["bounds": NSNull(), "position": NSNull()]
            n.player = l
            restack(n)
        }
        l.videoGravity = (n.stretch == "cover") ? .resizeAspectFill
                       : (n.stretch == "none" || n.stretch == "contain") ? .resizeAspect
                       : .resize   // fill/both/width/height: obey the box
        l.masksToBounds = true
        l.bounds = CGRect(origin: .zero, size: n.box.size)
        l.position = .zero
    }

    func mediaReady(handle: Int) {
        for (_, n) in nodes where n.mediaId == handle { applyMedia(n) }
    }

    /// The tint composite (compositing.md §3.4): fill the color through the
    /// bitmap's own alpha — `clip(to:mask:)` is exactly `source-in`.
    private static func tinted(_ img: CGImage, _ color: CGColor) -> CGImage? {
        let w = img.width, h = img.height
        guard w > 0, h > 0,
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let rect = CGRect(x: 0, y: 0, width: w, height: h)
        ctx.clip(to: rect, mask: img)
        ctx.setFillColor(color)
        ctx.fill(rect)
        return ctx.makeImage()
    }

    private func applyGradient(_ n: Node, _ spec: [String: Any]) {
        let g: CAGradientLayer
        if let e = n.gradient { g = e } else {
            g = CAGradientLayer(); g.anchorPoint = .zero
            g.actions = ["colors": NSNull(), "bounds": NSNull(), "position": NSNull()]
            n.gradient = g; restack(n)
        }
        n.layer.backgroundColor = nil
        let stops = spec["stops"] as? [[Any]] ?? []
        g.colors = stops.compactMap { ($0.count > 1 ? $0[1] as? String : nil).flatMap { CSSColor.parse($0)?.cgColor } }
        let locs = stops.enumerated().map { (i, s) -> NSNumber in
            if let n = s.first as? NSNumber { return n }
            return NSNumber(value: stops.count <= 1 ? 0 : Double(i) / Double(stops.count - 1))
        }
        let (rc, rl) = GradientStops.resampled(colors: g.colors as? [CGColor] ?? [],
                                              locations: locs.map { CGFloat($0.doubleValue) })
        g.colors = rc
        g.locations = rl.map { NSNumber(value: Double($0)) }
        // CSS compass angle (0 = up, clockwise) → unit start/end points. A
        // CALayer's unit space is y-UP: (0,0) is the bottom-left corner. The
        // tree places layers with explicit bottom-up arithmetic rather than a
        // flip flag, so there is no flip here to cancel the compass out — the
        // y terms carry straight through. (Cancelling them once, as if the
        // layer were flipped, ran every `gradient()` fill upside down: the dock
        // tiles graded bottom-to-top against the web's top-to-bottom.)
        let deg = (spec["angle"] as? NSNumber)?.doubleValue ?? 180
        let rad = deg * .pi / 180
        let dx = sin(rad) / 2, dy = cos(rad) / 2
        g.startPoint = CGPoint(x: 0.5 - dx, y: 0.5 - dy)
        g.endPoint = CGPoint(x: 0.5 + dx, y: 0.5 + dy)
        g.bounds = CGRect(origin: .zero, size: n.box.size)
        g.position = .zero
        g.cornerRadius = n.radius
        g.masksToBounds = true
    }

    private func applyClip(_ n: Node) {
        // When an exempt child forced a clip host, the clip belongs to the HOST
        // — putting it on n.layer would clip the exempt child right back.
        let target: CALayer = n.clipHost ?? n.layer
        if n.clipHost != nil { n.layer.mask = nil; n.layer.masksToBounds = false }
        if let p = n.clipPath {
            let m = CAShapeLayer()
            m.anchorPoint = .zero
            m.bounds = CGRect(origin: .zero, size: n.box.size)
            m.position = .zero
            // The clip path is authored top-left; mirror it into the layer's
            // bottom-left space once, here.
            var flip = CGAffineTransform(translationX: 0, y: n.box.height).scaledBy(x: 1, y: -1)
            m.path = p.copy(using: &flip) ?? p
            m.fillRule = .nonZero
            target.mask = m
            target.masksToBounds = false
        } else if n.isRoot || n.boxClip || n.scrolls || n.scrollsX || n.isEmbedHost || n.rich != nil {
            // A rich flow is clipped by its OWN box, as the element is on the
            // web. The flow layer is placed against the box's top and keeps its
            // full flowed height, so a pane the app collapses to nothing would
            // otherwise still paint its whole document — which is how the
            // Viewer ended up drawing its source over its reader.
            // A SCROLLING surface clips, always — that is what overflow means,
            // and the DOM gets it for free from `overflow: auto`. Without it a
            // scrolled flow drew straight out of its window, over the title bar.
            target.mask = nil
            target.masksToBounds = true
        } else {
            target.mask = nil
            target.masksToBounds = false
        }
    }

    /// Uniform scale about a pivot. The pivot arrives in MODEL coordinates
    /// (top-left); this layer's space is bottom-up, so its y must be mirrored
    /// against the CURRENT box height — a scaled-down icon whose art is drawn
    /// at a larger reference size lands far from its box otherwise.
    private func applyScale(_ n: Node) {
        if n.scaleK == 1 && n.rotation == 0 { n.layer.transform = CATransform3DIdentity; syncFrost(n); return }
        let px = n.pivot.x
        let py = n.box.height - n.pivot.y
        var t = CATransform3DMakeTranslation(px, py, 0)
        if n.scaleK != 1 { t = CATransform3DScale(t, n.scaleK, n.scaleK, 1) }
        // Model degrees are CLOCKWISE on screen — the y-down convention the
        // other renderers share. This layer space is y-UP (see the SHADOW
        // negation note), so the sign flips.
        if n.rotation != 0 { t = CATransform3DRotate(t, -n.rotation * .pi / 180, 0, 0, 1) }
        n.layer.transform = CATransform3DTranslate(t, -px, -py, 0)
        syncFrost(n)
    }

    private func applyShadowPath(_ n: Node) {
        let r = min(n.radius, min(n.box.width, n.box.height) / 2)
        n.layer.shadowPath = CGPath(roundedRect: CGRect(origin: .zero, size: n.box.size),
                                    cornerWidth: r, cornerHeight: r, transform: nil)
    }

    // ── drawings ────────────────────────────────────────────────────────────

    private func rasterize(_ n: Node) {
        guard let list = n.drawList else { return }
        if ProcessInfo.processInfo.environment["DECLARE_DEBUG_DRAW"] != nil {
            let opsList = (list["ops"] as? [[String: Any]]) ?? []
            let names = opsList.map { o -> String in
                let k = (o["op"] as? String) ?? "?"
                if k == "set" { return "set:" + ((o["k"] as? String) ?? "") }
                return k
            }.joined(separator: ",")
            NSLog("[draw] id=%d ops=%d box=%@ | %@", n.id, opsList.count, NSStringFromRect(n.box), names)
        }
        let b = list["bounds"] as? [String: Any]
        let bx = CGFloat((b?["x"] as? NSNumber)?.doubleValue ?? 0)
        let by = CGFloat((b?["y"] as? NSNumber)?.doubleValue ?? 0)
        let bw = CGFloat((b?["w"] as? NSNumber)?.doubleValue ?? Double(n.box.width))
        let bh = CGFloat((b?["h"] as? NSNumber)?.doubleValue ?? Double(n.box.height))
        let w = max(1, bw), h = max(1, bh)
        let s = scale
        guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let cg = CGContext(data: nil, width: Int(w * s), height: Int(h * s), bitsPerComponent: 8,
                                 bytesPerRow: 0, space: cs,
                                 bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return }
        cg.scaleBy(x: s, y: s)
        // Flip into the model's y-down space, then shift so the recording's
        // own origin lands at the raster's corner.
        cg.translateBy(x: 0, y: h)
        cg.scaleBy(x: 1, y: -1)
        cg.translateBy(x: -bx, y: -by)
        DrawReplay.run(list["ops"] as? [[String: Any]] ?? [], in: cg, bridge: bridge,
                       geom: (x: bx, y: by, w: w, h: h, scale: s))
        guard let img = cg.makeImage() else { NSLog("[draw] id=%d makeImage FAILED", n.id); return }
        if let dumpId = ProcessInfo.processInfo.environment["DECLARE_DUMP_DRAW"], Int(dumpId) == n.id {
            let url = URL(fileURLWithPath: "/tmp/draw-\(n.id).png")
            if let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) {
                CGImageDestinationAddImage(dest, img, nil); CGImageDestinationFinalize(dest)
                NSLog("[draw] dumped id=%d to %@", n.id, url.path)
            }
        }
        let l: CALayer
        if let e = n.draw { l = e } else {
            l = CALayer(); l.anchorPoint = .zero
            l.actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull()]
            n.draw = l; restack(n)
        }
        l.contentsScale = s
        // Drawings are often rastered larger than they are shown (the desktop
        // wallpaper is drawn in a 1920x1200 reference box and cover-scaled), and
        // CALayer's default minification is plain bilinear — it loses detail a
        // browser's downscale keeps. Trilinear mipmaps that path.
        l.minificationFilter = .trilinear
        l.contents = img
        l.bounds = CGRect(x: 0, y: 0, width: w, height: h)
        l.position = CGPoint(x: bx, y: n.box.height - by - h)   // the model's y, mirrored
    }

    // ── overlay geometry (selection + editables live in AppKit) ─────────────

    /// A node's rect in the hosting view's layer space. Core Animation answers
    /// this itself — walking parents by hand misses scroll translations, scale
    /// transforms, and the flipped spaces, all of which an overlay must honor.
    func windowRect(_ n: Node) -> CGRect {
        guard let host = view?.layer else { return CGRect(origin: .zero, size: n.box.size) }
        let r = n.layer.convert(CGRect(origin: .zero, size: n.box.size), to: host)
        return r
    }

    /// Is this node hidden by its OWN visible flag or by any ancestor's?
    ///
    /// The layer tree gets this for free — hiding a layer hides its sublayers —
    /// but an AppKit overlay is not a sublayer of anything, so it has to be
    /// asked explicitly. The DOM backend's `visible=false` is `display:none`,
    /// which takes the whole subtree out of rendering, so an editable inside a
    /// hidden ancestor must go too. Without this the viewer's Edit-mode source
    /// editor — an NSScrollView, and so drawn ABOVE the entire layer tree —
    /// kept painting the raw source over the Reader.
    func hiddenAnywhere(_ n: Node) -> Bool {
        if n.layer.isHidden { return true }
        var cur: Node? = n.parent
        while let p = cur {
            if p.layer.isHidden { return true }
            cur = p.parent
        }
        return false
    }

    /// Rects, in host space, that paint AFTER `n` and cover part of it.
    ///
    /// An AppKit overlay is not in the layer tree, so nothing occludes it: the
    /// Viewer's edit pane drew its source straight over a Files window that the
    /// user had just raised in front of it. Core Animation gets this right for
    /// free for real layers; for an overlay the tree has to be asked directly.
    ///
    /// Paint order is depth-first, children in order, so anything that covers
    /// `n` is a LATER SIBLING at some ancestor level. Only a node that actually
    /// paints an opaque box counts — a transparent container spanning the screen
    /// occludes nothing.
    /// Narrate the occluder walk — why an overlay is (or is not) covered.
    func explainOccluders(_ id: Int) -> String {
        guard let n = nodes[id], let host = view?.layer else { return "no node \(id)" }
        var out: [String] = ["node \(id) box=\(NSStringFromRect(n.box)) vis=\(NSStringFromRect(visibleRect(n)))"]
        var child: Node = n
        var cur: Node? = n.parent
        while let p = cur {
            let idx = p.children.firstIndex(where: { $0 === child })
            out.append("  level id=\(p.id) kids=\(p.children.count) childIdx=\(idx.map(String.init) ?? "?")")
            if let i = idx, i + 1 < p.children.count {
                for later in p.children[(i + 1)...] {
                    let bg = later.layer.backgroundColor
                    let r = later.layer.convert(CGRect(origin: .zero, size: later.box.size), to: host)
                    out.append("     later id=\(later.id) box=\(NSStringFromRect(later.box)) hidden=\(later.layer.isHidden)"
                             + " op=\(later.layer.opacity) bgAlpha=\(bg.map { String(format: "%.2f", $0.alpha) } ?? "nil")"
                             + " hostRect=\(NSStringFromRect(r))")
                }
            }
            child = p
            cur = p.parent
        }
        return out.joined(separator: "\n")
    }

    private func occluders(_ n: Node) -> [CGRect] {
        guard let host = view?.layer else { return [] }
        var out: [CGRect] = []
        var child: Node = n
        var cur: Node? = n.parent
        while let p = cur {
            if let idx = p.children.firstIndex(where: { $0 === child }), idx + 1 < p.children.count {
                for later in p.children[(idx + 1)...] {
                    guard !later.layer.isHidden, later.layer.opacity > 0.95 else { continue }
                    guard let bg = later.layer.backgroundColor, (bg.alpha) > 0.9 else { continue }
                    guard later.box.width > 1, later.box.height > 1 else { continue }
                    out.append(later.layer.convert(CGRect(origin: .zero, size: later.box.size), to: host))
                }
            }
            child = p
            cur = p.parent
        }
        return out
    }

    /// The largest part of `r` left once `o` is taken out. An overlay half
    /// covered should keep showing its visible half rather than vanish, and a
    /// rect minus a rect is not a rect — so take the biggest piece.
    private func largestRemainder(_ r: CGRect, minus o: CGRect) -> CGRect {
        let cut = r.intersection(o)
        if cut.isNull || cut.isEmpty { return r }
        if cut.contains(r) { return .zero }
        let pieces = [
            CGRect(x: r.minX, y: r.minY, width: cut.minX - r.minX, height: r.height),   // left
            CGRect(x: cut.maxX, y: r.minY, width: r.maxX - cut.maxX, height: r.height), // right
            CGRect(x: r.minX, y: r.minY, width: r.width, height: cut.minY - r.minY),    // below
            CGRect(x: r.minX, y: cut.maxY, width: r.width, height: r.maxY - cut.maxY),  // above
        ].filter { $0.width > 0 && $0.height > 0 }
        return pieces.max(by: { $0.width * $0.height < $1.width * $1.height }) ?? .zero
    }

    /// The part of a node that is actually VISIBLE after every ancestor clip.
    /// Layer clipping cannot help an overlay: NSTextView is an AppKit subview,
    /// not part of the layer tree, so it ignores masksToBounds entirely — which
    /// is why a shaded window kept showing its text. The overlay is therefore
    /// sized to this intersection and its document scrolled to compensate.
    func visibleRect(_ n: Node) -> CGRect {
        guard let host = view?.layer else { return windowRect(n) }
        if hiddenAnywhere(n) { return .zero }
        var vis = windowRect(n)
        var child: Node = n
        var cur: Node? = n.parent
        while let p = cur {
            if (p.boxClip || p.clipPath != nil) && !child.ignoresClip {
                let box = p.layer.convert(CGRect(origin: .zero, size: p.box.size), to: host)
                vis = vis.intersection(box)
                if vis.isNull || vis.isEmpty { return .zero }
            }
            child = p
            cur = p.parent
        }
        // …and after anything painting OVER it (see occluders).
        for o in occluders(n) {
            vis = largestRemainder(vis, minus: o)
            if vis.isEmpty { return .zero }
        }
        return vis
    }

    func overlays() -> [(Node, CGRect)] {
        var out: [(Node, CGRect)] = []
        for (_, n) in nodes where n.rich != nil || n.editable != nil {
            out.append((n, windowRect(n)))
        }
        return out
    }

    /// The topmost SELECTABLE flow under a model point, with the point mapped
    /// into that flow's own top-left space — what the layout manager wants in
    /// order to answer "which character is this?".
    func richFlow(atModel p: CGPoint) -> (RichOverlay, CGPoint)? {
        guard let v = view else { return nil }
        let py = v.bounds.height - p.y                   // model (y-down) → layer space
        var best: (RichOverlay, CGPoint, CGFloat)? = nil
        for (_, n) in nodes {
            guard let flow = n.rich, flow.acceptsHits, !hiddenAnywhere(n) else { continue }
            let r = windowRect(n)
            guard r.contains(CGPoint(x: p.x, y: py)) else { continue }
            // Respect the clips: a flow scrolled out of its window is not hit.
            let vis = visibleRect(n)
            guard vis.contains(CGPoint(x: p.x, y: py)) else { continue }
            let local = CGPoint(x: p.x - r.minX, y: r.maxY - py)
            // Prefer the frontmost: deeper in the layer order wins, and z is
            // hard to read here, so take the smallest visible rect as a proxy.
            let area = vis.width * vis.height
            if best == nil || area < best!.2 { best = (flow, local, area) }
        }
        guard let b = best else { return nil }
        return (b.0, b.1)
    }

    /// Every flow, so a fresh press can clear the others' selections.
    func allFlows() -> [RichOverlay] { nodes.values.compactMap { $0.rich } }

    /// Diagnostic: every VISIBLE text node carrying a given substring, with its
    /// ancestor chain — enough to tell "rendered twice" from "one render".
    func dumpText(_ needle: String) {
        var hits = 0
        for (_, n) in nodes where n.textString.contains(needle) {
            var hidden = n.layer.isHidden
            var chain = "\(n.id)"
            var cur: Node? = n.parent
            while let p = cur {
                if p.layer.isHidden { hidden = true }
                chain += "<\(p.id)"
                cur = p.parent
            }
            hits += 1
            NSLog("[text] id=%d hidden=%d box=%@ chain=%@ text=%@",
                  n.id, hidden ? 1 : 0, NSStringFromRect(n.box), chain,
                  String(n.textString.prefix(28)))
        }
        NSLog("[text] total nodes=%d matching=%d", nodes.count, hits)

        // Drawn content: TextFlow paints prose through draw() ops, so a
        // duplicated document shows up as several big drawing layers.
        var drawn = 0
        for (_, n) in nodes where n.draw != nil {
            guard n.box.width > 200, n.box.height > 200 else { continue }
            var hidden = n.layer.isHidden
            var chain = "\(n.id)"
            var cur: Node? = n.parent
            while let p = cur { if p.layer.isHidden { hidden = true }; chain += "<\(p.id)"; cur = p.parent }
            drawn += 1
            NSLog("[draw] id=%d hidden=%d box=%@ chain=%@", n.id, hidden ? 1 : 0,
                  NSStringFromRect(n.box), chain)
        }
        NSLog("[draw] big drawing layers=%d", drawn)
    }

    /// Diagnostic: walk a node's real LAYER chain — the model tree and the
    /// layer tree can disagree, and only the layer tree decides what is drawn.
    func dumpLayerChain(_ id: Int) {
        // Any node walks: a rich flow starts from its content layer (the case
        // this was built for), everything else from the node's own layer.
        guard let n = nodes[id] else { NSLog("[chain] no node %d", id); return }
        let start: CALayer = n.rich?.contentLayer ?? n.layer
        var l: CALayer? = start
        var step = 0
        while let cur = l {
            // name the layer by the NODE it belongs to, so the chain is readable
            var owner = "?"
            for (nid, cand) in nodes where cand.layer === cur || cand.content === cur || cand.clipHost === cur {
                owner = "#\(nid)" + (cand.content === cur ? "(content)" : cand.clipHost === cur ? "(cliphost)" : "")
                break
            }
            NSLog("[chain] %d: %@ hidden=%d opacity=%.2f masks=%d bounds=%@ pos=%@",
                  step, cur === start && n.rich != nil ? "flow" : owner,
                  cur.isHidden ? 1 : 0, Double(cur.opacity), cur.masksToBounds ? 1 : 0,
                  NSStringFromRect(cur.bounds), NSStringFromPoint(cur.position))
            l = cur.superlayer
            step += 1
            if step > 24 { break }
        }
        NSLog("[chain] reaches host=%@", l == nil ? "detached-or-root" : "?")
    }

    /// Diagnostic: which flows are actually on screen, and where.
    func dumpFlows() {
        for (_, n) in nodes where n.rich != nil {
            let attached = n.layer.superlayer != nil
            var hiddenAnywhere = n.layer.isHidden
            var cur: Node? = n.parent
            while let p = cur { if p.layer.isHidden { hiddenAnywhere = true }; cur = p.parent }
            var chain = ""
            var c2: Node? = n.parent
            while let p = c2 { chain += "<\(p.id)"; c2 = p.parent }
            NSLog("[flow] id=%d box=%@ win=%@ vis=%@ hidden=%d opacity=%.2f attached=%d chain=%@",
                  n.id, NSStringFromSize(n.box.size), NSStringFromRect(windowRect(n)),
                  NSStringFromRect(visibleRect(n)),
                  hiddenAnywhere ? 1 : 0, Double(n.layer.opacity), attached ? 1 : 0, chain)
        }
    }

    /// The bar currently widened under the pointer (node + axis).
    private var hotBar: (Node, Bool)?

    /// The scrollbar thumb under a MODEL point, if any — and which axis.
    ///
    /// A bar is not part of the model tree, so the JS hit walk knows nothing
    /// about it; grabbing one has to be answered here. The point is converted
    /// into each candidate surface's own space through Core Animation, so scroll
    /// translations and scales on the way down are already accounted for.
    /// Frontmost wins, which for equal depth means the smallest box — the same
    /// proxy `richFlow(atModel:)` uses.
    func scrollbarHit(atModel p: CGPoint) -> (node: Node, vertical: Bool, grab: CGFloat)? {
        guard let v = view, let host = v.layer else { return nil }
        let py = v.bounds.height - p.y                       // model → layer space
        var best: (Node, Bool, CGFloat, CGFloat)? = nil      // + area, for frontmost
        for (_, n) in nodes {
            // Only a surface with a LIVE bar can be hit, and there are a handful
            // of those against thousands of nodes — this runs on every mouse move,
            // and the geometry below costs a CALayer conversion apiece.
            guard (n.vbar?.live ?? false) || (n.hbar?.live ?? false) else { continue }
            guard !hiddenAnywhere(n) else { continue }
            let box = n.box.size
            guard box.width > 0, box.height > 0 else { continue }
            // the point in this node's own space, then flipped to model (top-down)
            let inNode = n.layer.convert(CGPoint(x: p.x, y: py), from: host)
            let local = CGPoint(x: inNode.x, y: box.height - inNode.y)
            guard local.x >= 0, local.y >= 0, local.x <= box.width, local.y <= box.height else { continue }
            // and it must actually be on screen, not scrolled out of an ancestor
            let vis = visibleRect(n)
            guard !vis.isEmpty, vis.contains(CGPoint(x: p.x, y: py)) else { continue }
            let area = box.width * box.height
            if let b = n.vbar, b.live, b.thumbRect.contains(local) {
                if best == nil || area < best!.3 { best = (n, true, local.y - b.thumbRect.minY, area) }
            }
            if let b = n.hbar, b.live, b.thumbRect.contains(local) {
                if best == nil || area < best!.3 { best = (n, false, local.x - b.thumbRect.minX, area) }
            }
        }
        guard let b = best else { return nil }
        return (b.0, b.1, b.2)
    }

    /// Turn a thumb position into a content offset and push it to the model.
    func dragScrollbar(_ n: Node, vertical: Bool, to thumbStart: CGFloat) {
        guard let bar = vertical ? n.vbar : n.hbar, bar.live, bar.travel > 0.5 else { return }
        let t = min(1, max(0, (thumbStart - Scrollbar.trackInset) / bar.travel))
        let offset = t * bar.maxOffset
        bar.hold()
        bridge.call("__declareScrollTo", vertical ? [n.id, offset, NSNull()] : [n.id, NSNull(), offset])
        bridge.needsFrame()
    }

    /// Rollover widening: at most one bar is hot at a time. Tracked rather than
    /// rescanned, because this runs on every mouse move.
    func setHotBar(_ hit: (node: Node, vertical: Bool, grab: CGFloat)?) {
        let next: (Node, Bool)? = hit.map { ($0.node, $0.vertical) }
        if let cur = hotBar, next == nil || !(cur.0 === next!.0 && cur.1 == next!.1) {
            (cur.1 ? cur.0.vbar : cur.0.hbar)?.hot = false
            updateBars(cur.0, flash: false)
        }
        hotBar = next
        guard let n = next else { return }
        guard let b = n.1 ? n.0.vbar : n.0.hbar, !b.hot else { return }
        b.hot = true
        updateBars(n.0, flash: false)
        b.hold()                       // fading out from under the pointer reads as a bug
    }

    /// Drop every node the new root cannot reach, tearing down what each owned.
    ///
    /// The overlays matter as much as the layers: an orphaned NSTextField or
    /// NSScrollView is a real AppKit subview that would keep drawing above the
    /// whole layer tree with no model behind it.
    /// Release EVERYTHING a node owns on the Swift side: its layers (own,
    /// clip host, scroll content), its AppKit overlays, its scrollbars — and,
    /// by default, its whole subtree's. One teardown, used by DESTROY and the
    /// root sweep alike, so nothing survives by being parented through a seam
    /// the caller forgot.
    private func tearDown(_ n: Node, recurse: Bool = true) {
        if recurse { for c in n.children { tearDown(c) } }
        n.rich?.remove()
        n.editable?.remove()
        n.vbar?.layer.removeFromSuperlayer()
        n.hbar?.layer.removeFromSuperlayer()
        n.clipHost?.removeFromSuperlayer()
        if n.content !== n.layer { n.content.removeFromSuperlayer() }
        n.frostLayer?.removeFromSuperlayer()
        n.frostLayer = nil
        n.layer.removeFromSuperlayer()
        pendingBand.remove(n.id)
        pendingDraw.remove(n.id)
        nodes.removeValue(forKey: n.id)
    }

    private func sweepUnreachable(from newRoot: Node) {
        var live = Set<Int>()
        var stack = [newRoot]
        while let n = stack.popLast() {
            guard live.insert(n.id).inserted else { continue }
            stack.append(contentsOf: n.children)
        }
        for (id, n) in nodes where !live.contains(id) {
            tearDown(n, recurse: false)   // the loop already visits every dead id
        }
        pendingDraw.formIntersection(live)
    }

    /// Bring a flow's rastered band up to date for where it is RIGHT NOW.
    ///
    /// ⚠ This must be callable at LAYOUT time, not only from repositionOverlays.
    /// `set()` deliberately does not raster (a resize re-sets every flow in the
    /// document and only a few are on screen), so a flow depends on something
    /// else to paint it — and if that only ever happened on a later commit, a
    /// flow that was re-set on the LAST commit of a gesture never got one,
    /// because the app then goes idle. That is exactly what left the Markdown
    /// and Viewer windows BLANK after a horizontal resize.
    /// Flows whose bitmap may be stale. A raster is DEFERRED to the end of the
    /// frame for the same reason `pendingDraw` is: geometry has not converged
    /// yet. `richLayout` runs synchronously from the settle and a document's
    /// flows re-lay each other as the column reflows — measured at ~2.5 layouts
    /// per flow per frame — and every one of them used to raster on the spot,
    /// at roughly a viewport each. That was 27 rasters and 21 Mpx per frame,
    /// all of it uploaded inside one CATransaction, for a final image that
    /// needed one. Coalescing by node id collapses them to the last one, which
    /// is the only one whose geometry was ever going to be shown.
    private var pendingBand: Set<Int> = []

    func refreshBand(_ n: Node) {
        guard n.rich != nil else { return }
        pendingBand.insert(n.id)
    }

    /// Raster every flow marked stale, once, against final geometry.
    func flushBands() {
        guard !pendingBand.isEmpty else { return }
        let ids = pendingBand
        pendingBand.removeAll()
        for id in ids { nodes[id].map { bandNow($0) } }
    }

    private func bandNow(_ n: Node) {
        guard let flow = n.rich, let host = view?.layer, let v = view else { return }
        let onScreen = visibleRect(n).intersection(v.bounds)
        if onScreen.isNull || onScreen.isEmpty { flow.ensureBand(covering: .zero); return }
        // host space → the node's own (bottom-up) space → the flow's top-down
        // coords, whose y=0 is the top of the node's box.
        let inNode = n.layer.convert(onScreen, from: host)
        flow.ensureBand(covering: CGRect(x: inNode.minX, y: n.box.height - inNode.maxY,
                                         width: inNode.width, height: inNode.height))
    }

    func node(_ id: Int) -> Node? { nodes[id] }
    func forEachNode(_ f: (Node) -> Void) { for (_, n) in nodes { f(n) } }
    /// A node's absolute model origin (top-left space), scroll included.
    func absOrigin(_ n: Node) -> CGPoint { CGPoint(x: absX(n), y: absY(n)) }
    /// How many layers the scene holds — the "constant-weight page" claim,
    /// measured (the DOM renderer's equivalent is element count).
    func layerCount() -> Int {
        var n = 0
        for (_, node) in nodes {
            n += 1
            if node.content !== node.layer { n += 1 }
            if node.text != nil { n += 1 }
            if node.draw != nil { n += 1 }
            if node.image != nil { n += 1 }
            if node.gradient != nil { n += 1 }
        }
        return n
    }

    /// Lay a rich flow out and answer its height, synchronously — the DOM
    /// backend's contract, so a flow is never zero-height for a frame (which
    /// would stack it on its siblings).
    func richLayout(id: Int, blocksJson: String, selectable: Bool, width: CGFloat) -> Double {
        let __t0 = statsOn ? CFAbsoluteTimeGetCurrent() : 0
        defer { if statsOn { richLayoutCount += 1; richLayoutMs += (CFAbsoluteTimeGetCurrent() - __t0) * 1000
                            richLayoutBytes += blocksJson.utf8.count } }
        guard let v = view else { return 0 }
        // BEFORE the cache check, or the cached path — which is the common one —
        // runs with the timer disarmed and reports zero.
        RichOverlay.RichStats.on = statsOn
        let n = nodes[id] ?? { let fresh = Node(id: id); nodes[id] = fresh; return fresh }()
        if n.rich == nil { n.rich = RichOverlay(id: id, view: v, bridge: bridge); restack(n); applyClip(n) }
        // Cache first: the JSON parse below is the expensive part.
        if let cached = n.rich?.cachedHeight(json: blocksJson, width: width, selectable: selectable) {
            n.rich?.place(inBox: n.box.size, scale: scale)
            refreshBand(n)
            return Double(cached)
        }
        RichOverlay.RichStats.on = statsOn
        let __p0 = statsOn ? CFAbsoluteTimeGetCurrent() : 0
        let blocks = (try? JSONSerialization.jsonObject(with: Data(blocksJson.utf8))) as? [[String: Any]] ?? []
        if statsOn { richParseMs += (CFAbsoluteTimeGetCurrent() - __p0) * 1000 }
        let h = n.rich?.set(blocks: blocks, selectable: selectable, width: width, style: n.textStyle, json: blocksJson) ?? 0
        n.rich?.place(inBox: n.box.size, scale: scale)
        refreshBand(n)                       // paint it NOW if it is on screen
        if ProcessInfo.processInfo.environment["DECLARE_DEBUG_RICH"] != nil {
            NSLog("[rich] id=%d blocks=%d width=%.0f -> h=%.0f box=%@", id, blocks.count, width, h, NSStringFromRect(n.box))
        }
        return Double(h)
    }
}

extension Node {
    private static var drawKey: UInt8 = 0
    var drawList: [String: Any]? {
        get { objc_getAssociatedObject(self, &Node.drawKey) as? [String: Any] }
        set { objc_setAssociatedObject(self, &Node.drawKey, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }
}
