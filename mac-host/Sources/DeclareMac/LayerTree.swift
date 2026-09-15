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

/// A glide in flight on one axis — a request's `{ duration, motion }`, run by
/// the host on its display link (the scroll process's own motion).
struct ScrollGlide {
    let from: CGFloat
    let to: CGFloat
    let start: CFTimeInterval
    let duration: CFTimeInterval
    let bezier: (CGFloat, CGFloat, CGFloat, CGFloat)
}

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
    /// Per-corner rounding `[tl, tr, br, bl]` (top-left clockwise, the model's
    /// order) when the four differ; nil = one `radius` on every corner. A set of
    /// corners sharing one radius is a CALayer `maskedCorners`; four DISTINCT
    /// radii are past what a layer can round and paint through `shapeBg`.
    var radii: [CGFloat]?
    var shapeBg: CAShapeLayer?
    var fillColor: CGColor?
    var strokeW: CGFloat = 0
    var strokeColor: CGColor?
    var scrolls = false
    var scrollOffset: CGFloat = 0
    var scrollsX = false
    var scrollXOffset: CGFloat = 0
    var scrollExtent: CGFloat = 0
    var scrollExtentX: CGFloat = 0
    var vbar: Scrollbar?
    var hbar: Scrollbar?
    // ── the scroll process's state (scrolling.md "The scroll process") ──
    /// This view claims the wheel (`onWheel`): the walk hands it the stream.
    var wantsWheel = false
    /// The `scrolling` fact: a stream, its momentum, a bar drag or a glide is
    /// moving this scroller. Reported to the runtime once per frame.
    var scrollingLive = false
    /// A GESTURE owns the offset (trackpad stream through its momentum, a bar
    /// drag): a request arriving meanwhile is dropped — arbitration rule 1.
    /// A legacy mouse wheel is not a gesture, exactly as a wheel on canvas.
    var gestureLive = false
    /// The stream's end, when the platform names none: a lifted finger that
    /// no momentum follows, or a mouse wheel that goes quiet.
    var quietWork: DispatchWorkItem?
    var glideY: ScrollGlide?
    var glideX: ScrollGlide?
    /// Facts to report at the next frame.
    var factDirty = false
    /// Image tint (compositing.md §3.4): the bitmap re-derives as this color
    /// shaped by its own alpha — template-image rendering. nil = untouched.
    var tint: CGColor?
    /// The frost (compositing.md §5.3): what to sample beneath this node.
    /// The frost's filter list (graphics-pass.md §1) — `blur`/`saturate` are
    /// the pair Frost.swift's caches key on; the rest ride the CI chain.
    var backdrop: FilterList?
    /// The view's own painted subtree, filtered as a group (case 44).
    var filterList: FilterList?
    /// The soft mask (case 45): a gradient spec, or a stencil node's id + box.
    var maskGradient: [String: Any]?
    var maskStencil: (id: Int, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat)?
    var maskEpoch = -1
    /// A `shadow(…)` inside the filter list owns the layer's shadow while set
    /// (the box `shadow` op yields to it, and restores on removal).
    var filterShadow = false
    /// Carries the backdrop filters, masked by the node's cornerRadius. Lives
    /// in the node's PARENT, immediately below the node's own layer — see
    /// `paint(_:)` for why it cannot be a child of the node it frosts.
    var frostLayer: CALayer?
    /// The paint epoch this node's frost was captured at. Behind the tree's
    /// current epoch = something beneath may have moved, so re-sample.
    var frostEpoch: Int = -1
    var scaleK: CGFloat = 1
    /// The whole paint transform as one affine (case 46; graphics-pass.md §5),
    /// in the model's y-DOWN local space — nil until a TRANSFORM op arrives,
    /// then it supersedes scaleK/rotation/pivot on this node.
    var affine: (a: CGFloat, b: CGFloat, c: CGFloat, d: CGFloat, e: CGFloat, f: CGFloat)?
    /// The third dimension (case 48): degrees about X and Y, a Z push, and
    /// whether the back face hides; and this node's own eye for its
    /// children (case 49, CA's sublayerTransform perspective).
    var rot3D: (rx: CGFloat, ry: CGFloat, tz: CGFloat, backfaceHidden: Bool)?
    var perspective: CGFloat = 0
    /// Device px per view unit a RASTERIZED drawing should be made at — the
    /// composed scale from the runtime's at-rest feed (RASTERSCALE). 0 = the
    /// backing scale, which is what a drawing under no view scale wants.
    var rasterK: CGFloat = 0
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
    /// Where a contain/cover fit sits in the box (case 47): 0 / 0.5 / 1 per axis.
    var alignX: CGFloat = 0.5
    var alignY: CGFloat = 0.5
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
    private(set) weak var view: DeclareView?
    private var nodes: [Int: Node] = [:]
    private(set) var root: Node?
    /// Surfaces whose drawing must be re-rasterized after a geometry change.
    private var pendingDraw = Set<Int>()
    /// Surfaces whose recording arrived while nothing could see them. Their
    /// bitmap is missing or stale ON PURPOSE; `flushDeferred` owes them a raster
    /// the moment they are shown. See the raster loop in `apply` for why.
    private var deferredDraw = Set<Int>()
    /// Outstanding debt, for the stats window.
    var deferredCount: Int { deferredDraw.count }
    private var dumped = false

    /// Pay what the hidden-skip owes: raster any deferred surface that can now
    /// be seen, in the same commit that reveals it, so nothing is ever shown
    /// blank or stale for a frame.
    ///
    /// Checked once per commit rather than hooked onto the VISIBLE op, because
    /// a surface re-enters rendering by several routes — its own flag, an
    /// ancestor's, a reparent into a shown tree, a new root — and one uniform
    /// check at the end cannot miss one. It costs a parent walk per owed node,
    /// against a raster that is milliseconds.
    private func flushDeferred() {
        guard !deferredDraw.isEmpty else { return }
        var paid: [Int] = []
        for id in deferredDraw {
            // Gone, or its recording was cleared while it was away: nothing owed.
            guard let n = nodes[id], n.drawList != nil else { paid.append(id); continue }
            if hiddenAnywhere(n) { continue }
            let t0 = statsOn ? CFAbsoluteTimeGetCurrent() : 0
            rasterize(n)
            if statsOn {
                let dt = (CFAbsoluteTimeGetCurrent() - t0) * 1000
                rasterCount += 1
                rasterMsTotal += dt
                rasterMsNodes[id, default: 0] += dt
                revealedRasterN += 1
                revealedRasterMs += dt
            }
            paid.append(id)
        }
        for id in paid { deferredDraw.remove(id) }
    }

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

    /// Bumped by any op that could change what a backdrop sample would see.
    /// A commit that changed nothing beneath costs the frost nothing.
    var frostEpoch = 0
    var frostAppliedEpoch = -1
    /// How many frosts re-sampled on the last commit, and what it cost —
    /// `ctl froststats`.
    var frostLastN = 0
    var frostLastMs = 0.0
    var frostTotalMs = 0.0
    var frostPaintMs = 0.0
    var frostImageMs = 0.0
    var frostBlurMs = 0.0
    /// Which nodes the frost pass actually paints, and what each costs.
    var frostNodeMs: [Int: Double] = [:]
    var frostPainted = 0
    /// Cached per-leaf renditions at canvas scale — see renderMaybeCached.
    var frostRendition: [ObjectIdentifier: (contents: AnyObject, w: Int, h: Int, img: CGImage)] = [:]
    /// Text renditions, keyed by layer identity + TextLayer.version.
    var frostTextRendition: [ObjectIdentifier: (version: Int, w: Int, h: Int, img: CGImage)] = [:]
    /// The scale the frost canvas is currently built at.
    var frostCanvasScale: CGFloat = 0.5
    var frostRenditionBytes = 0
    /// The last composite, for `ctl frostdump` — the only way to SEE what a
    /// frost actually sampled.
    var frostLastCanvas: CGImage?
    /// Set by `ctl frostdump`; nothing is captured until it is.
    static var frostDumpWanted = false
    /// `ctl frostafter <id>` — snapshot the canvas right after this node's own
    /// paint lands, instead of at the end of the pass. The discriminator for
    /// "painted then covered" vs "never painted where we look".
    static var frostDumpAfterNode: Int?
    var frostTotalN = 0

    /// The op buffer's JSON → ops, callable from any thread (the runtime
    /// thread decodes; main applies).
    static func decode(_ json: String) -> [[Any]] {
        guard let data = json.data(using: .utf8),
              let ops = (try? JSONSerialization.jsonObject(with: data)) as? [[Any]] else { return [] }
        return ops
    }
    func apply(_ json: String) { apply(ops: LayerTree.decode(json)) }
    func apply(ops: [[Any]]) {
        guard !ops.isEmpty else { return }
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
        // The frost re-samples ONCE per commit, after the ops — never per op,
        // and never per frosted node per op, which is what made the old CPU
        // sampler quadratic. See Frost.swift.
        let fr = refreshFrosts()
        refreshMasks()
        frostLastN = fr.n; frostLastMs = fr.ms
        frostTotalN += fr.n; frostTotalMs += fr.ms

        let rt0 = statsOn ? CFAbsoluteTimeGetCurrent() : 0
        for id in pendingDraw {
            guard let n = nodes[id] else { continue }
            // A hidden subtree is OUT of rendering — `visible=false` is the DOM
            // backend's display:none — so a bitmap made for it now is a bitmap
            // nobody can see. Owe it instead, and pay on the way back in.
            //
            // This is where resize was going: a parked CityView holds a DRAWN
            // sky, and a resize re-records it (the art bakes in d.w/d.h) at full
            // window size every step. Measured on weather's 40-step sweep: 580
            // of 888 rasters and 1872 of 1916ms — 98% of all raster time — for
            // a sky that is `visible=false` and sitting at x=-1100. WSky's own
            // doc names the hazard; making photographic skies record nothing
            // only ever fixed it for the photographs.
            if hiddenAnywhere(n) {
                deferredDraw.insert(id)
                if statsOn { skippedRasterN += 1 }
                continue
            }
            let t0 = statsOn ? CFAbsoluteTimeGetCurrent() : 0
            rasterize(n)
            if statsOn { rasterMsNodes[id, default: 0] += (CFAbsoluteTimeGetCurrent() - t0) * 1000 }
        }
        if statsOn { rasterMsTotal += (CFAbsoluteTimeGetCurrent() - rt0) * 1000 }
        pendingDraw.removeAll()
        flushDeferred()
        // Geometry is final now — this is the first moment a flow's band is
        // worth rastering, and it is still inside the transaction below.
        flushBands()
        // Frosts need nothing here. They are background filters on their own
        // layers, so the compositor re-derives them from whatever it draws
        // beneath — on every frame it presents, not merely on the settles we
        // happen to notice (compositing.md §5.2: a frost invalidates on
        // under-content change, never on its own state — which is now the
        // window server's invariant to keep rather than ours to re-walk).
        // WALL and CPU, because they answer different questions. Core Animation's
        // commit both does work (layout, calling back into dirty layers) and
        // WAITS (handing the transaction to the render server). Only the first
        // is ours to fix, and `commit ms` cannot tell them apart — a commit that
        // is 34ms wall and 2ms CPU is the window server pacing us, not the host
        // being slow.
        let ct0 = statsOn ? CFAbsoluteTimeGetCurrent() : 0
        let cc0 = statsOn ? clock_gettime_nsec_np(CLOCK_THREAD_CPUTIME_ID) : 0
        CATransaction.commit()
        if statsOn {
            caCommitMsTotal += (CFAbsoluteTimeGetCurrent() - ct0) * 1000
            caCommitCpuMsTotal += Double(clock_gettime_nsec_np(CLOCK_THREAD_CPUTIME_ID) - cc0) / 1_000_000
        }
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
    /// Wall time spent rasterizing each node, and the pixels it cost.
    var rasterMsNodes: [Int: Double] = [:]
    var rasterPxNodes: [Int: Double] = [:]
    /// Rasters NOT spent, because the node was hidden — and the ones paid later
    /// when it was revealed. The second number is the honest price of the first:
    /// deferring is only a win if far fewer are ever actually shown.
    var skippedRasterN = 0
    var revealedRasterN = 0
    var revealedRasterMs = 0.0
    /// Time in repositionOverlays (visibleRect + occluders + bands) per window.
    var overlayMsTotal = 0.0
    /// Wall time per opcode — which op is actually costing the frame.
    var opMs: [Int: Double] = [:]
    /// Time inside CATransaction.commit — where Core Animation does the layout
    /// and calls back into every dirty layer's draw(in:).
    var caCommitMsTotal = 0.0
    /// CPU time inside that commit. Wall minus this is time spent WAITING.
    var caCommitCpuMsTotal = 0.0
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
        frostEpoch &+= 1
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
            if n.scaleK != 1 || n.rotation != 0 || n.affine != nil || n.rot3D != nil { applyScale(n) }    // the pivot mirrors against the new height
            // NOT re-rasterized here. A recording is in the view's own
            // coordinates and does not depend on the box, so moving or
            // resizing a view can never invalidate it — the rendering model's
            // rule 3, which both web backends also honor. Re-rastering on
            // geometry made every magnifying dock icon redraw its art each
            // frame (measured: 151ms average commit, 457ms worst).
            if n.clipPath != nil || n.boxClip { applyClip(n) }
            if n.layer.shadowOpacity > 0 { applyShadowPath(n) }
            if n.shapeBg != nil { syncShape(n) }
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
            n.fillColor = fill
            n.layer.backgroundColor = fill
            if n.shapeBg != nil { syncShape(n) }
        case 7: // GRADIENT
            guard let n = nodes[id], let spec = a(0) as? [String: Any] else { return }
            applyGradient(n, spec)
            if n.shapeBg != nil { syncShape(n) }
        case 8: // RADIUS — one number, or four: [tl, tr, br, bl], top-left clockwise
            guard let n = nodes[id] else { return }
            if a(3) != nil {
                let r = (0..<4).map { CGFloat(num(a($0))) }
                n.radii = r; n.radius = r.max() ?? 0
            } else { n.radii = nil; n.radius = num(a(0)) }
            applyRadius(n)
            if n.frostLayer != nil { syncFrost(n) }
            if n.boxClip { applyClip(n) }
            if n.layer.shadowOpacity > 0 { applyShadowPath(n) }
        case 9: // STROKE (inside the box, like the other renderers)
            guard let n = nodes[id] else { return }
            if a(0) == nil || a(0) is NSNull {
                n.strokeW = 0; n.strokeColor = nil
                n.layer.borderWidth = 0
            } else {
                n.strokeW = num(a(0)); n.strokeColor = str(a(1)).flatMap { CSSColor.parse($0)?.cgColor }
                n.layer.borderWidth = n.strokeW
                n.layer.borderColor = n.strokeColor
            }
            if n.shapeBg != nil { syncShape(n) }
        case 10: // SHADOW
            guard let n = nodes[id], !n.filterShadow else { return }   // a filter's shadow(…) owns the layer's shadow while set
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
            // a shadow on a clipping node moves the clip to a host layer (and
            // its removal moves it back) — see restack
            if n.boxClip || n.clipPath != nil { restack(n); applyClip(n); placeClipHost(n) }
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
        case 40: // RASTERSCALE — the at-rest composed density for a rasterized drawing
            guard let n = nodes[id] else { return }
            let k = num(a(0))
            if abs(k - n.rasterK) > 0.001 {
                n.rasterK = k
                // a described drawing re-rasterizes in the render server under any
                // transform and needs nothing; a RASTERIZED one is a bitmap made at
                // one density, and a new density means a new bitmap
                if n.drawList != nil, n.draw?.name != "described" { pendingDraw.insert(id) }
            }
        case 18: // DRAW
            guard let n = nodes[id] else { return }
            if a(0) == nil || a(0) is NSNull {
                n.draw?.removeFromSuperlayer(); n.draw = nil; n.drawList = nil
            } else {
                // NOT worth a content check. The obvious cheap fix for a resize
                // storm is to notice the recording did not change and skip the
                // raster — measured on weather's 40-step sweep, it does not:
                // of 888 arrivals, 82 were identical, 0 differed only in
                // `bounds`, and 806 differed in their ops. Draw bodies bake
                // d.w/d.h into what they record, so a resize genuinely produces
                // new art and a hash buys 9%.
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
        case 22: // SCROLLPOS — a REQUEST (offset + range), or the range alone
            // (offset null: the host keeps its own — a frame-old number from the
            // runtime must never drag a live scroll back). A request while a
            // gesture owns the offset is dropped (arbitration rule 1); a plain
            // request cancels a glide in flight.
            guard let n = nodes[id] else { return }
            if let e = a(1) as? NSNumber { n.scrollExtent = CGFloat(e.doubleValue) }
            let request = a(0) as? NSNumber
            if let y = request, !n.gestureLive {
                if LayerTree.scrollDebug { NSLog("[scroll] request #%d y=%.0f (glide live: %d)", n.id, y.doubleValue, n.glideY != nil ? 1 : 0) }
                n.scrollOffset = CGFloat(y.doubleValue)
                cancelGlide(n, vertical: true)
            }
            // the range may have shrunk under the offset: re-clamp, and say so
            let clampedY = min(Swift.max(0, pageExtentY(n) - viewport(n).height), Swift.max(0, n.scrollOffset))
            if clampedY != n.scrollOffset { n.scrollOffset = clampedY; markFact(n) }
            place(n)
            for c in n.children { place(c) }
            updateBars(n, flash: request != nil)
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
        case 31: // SCROLLXPOS — SCROLLPOS's twin on x
            guard let n = nodes[id] else { return }
            if let e = a(1) as? NSNumber { n.scrollExtentX = CGFloat(e.doubleValue) }
            let requestX = a(0) as? NSNumber
            if let x = requestX, !n.gestureLive {
                n.scrollXOffset = CGFloat(x.doubleValue)
                cancelGlide(n, vertical: false)
            }
            let clampedX = min(Swift.max(0, pageExtentX(n) - viewport(n).width), Swift.max(0, n.scrollXOffset))
            if clampedX != n.scrollXOffset { n.scrollXOffset = clampedX; markFact(n) }
            place(n)
            for c in n.children { place(c) }
            updateBars(n, flash: requestX != nil)
            view?.repositionOverlays()
        case 42: // WHEELCLAIM — an `onWheel` view: the walk hands it the stream
            guard let n = nodes[id] else { return }
            n.wantsWheel = num(a(0)) != 0
        case 43: // SCROLLGLIDE axis, to, duration(ms), bezier x1 y1 x2 y2 — a
            // request with a glide: the host's own tween on the program's curve
            guard let n = nodes[id], !n.gestureLive else { return }
            let vertical = num(a(0)) != 0
            let lim = vertical ? Swift.max(0, pageExtentY(n) - viewport(n).height) : Swift.max(0, pageExtentX(n) - viewport(n).width)
            let to = min(lim, Swift.max(0, num(a(1))))
            let g = ScrollGlide(from: vertical ? n.scrollOffset : n.scrollXOffset, to: to,
                                start: CACurrentMediaTime(), duration: Swift.max(0.001, Double(num(a(2))) / 1000),
                                bezier: (num(a(3)), num(a(4)), num(a(5)), num(a(6))))
            if vertical { n.glideY = g } else { n.glideX = g }
            gliding.insert(n.id)
            if LayerTree.scrollDebug { NSLog("[scroll] glide #%d %@ %.0f -> %.0f over %.0fms", n.id, vertical ? "y" : "x", g.from, g.to, g.duration * 1000) }
            if !n.scrollingLive { n.scrollingLive = true; markFact(n) }
            bridge.needsFrame()
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
        case 41: // EDITSEL — the caret/selection write half (TextInput.select)
            nodes[id]?.editable?.setSelection(Int(num(a(0))), Int(num(a(1))))
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
                n.backdrop = FilterList(wire: a(0))
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
                n.frostEpoch = -1                       // force a first capture
                // (`applyFrostFilters` — the compositor's own backdrop chain —
                // is deliberately NOT attached: on macOS 26 it renders nothing
                // and doubles WindowServer CPU, see Frost.swift's header. The
                // sampler below is the frost.)
            }
        case 35: // BLEND — the view-tier compositing operator (compositing.md
            // §4.1). A compositing filter rides the LAYER, not the order:
            // Core Animation renders the layer's subtree as a group and lands
            // it with the filter against what is already composited beneath —
            // the same blends-as-a-unit semantics the web backends realize.
            // restack/clipHost are untouched.
            guard let n = nodes[id] else { return }
            n.layer.compositingFilter = (str(a(0)).flatMap { BLEND_FILTERS[$0] }).flatMap { CIFilter(name: $0) }
        case 44: // FILTER — the view's own painted subtree, as a group
            // (graphics-pass.md §1). `layer.filters` is Core Image over the
            // layer's contents AND its sublayers — the group semantics the web
            // backends realize — and macOS 26 still honours it (frostprobe2,
            // candidate A), unlike `backgroundFilters`. Lengths are view units
            // and CA filters run in the layer's own space, so they ride as-is.
            // A `shadow(…)` in the list is the layer's own shadow with no
            // shadowPath, which follows content alpha — CSS drop-shadow.
            guard let n = nodes[id] else { return }
            if a(0) == nil || a(0) is NSNull {
                n.filterList = nil
                n.layer.filters = nil
                if n.filterShadow { n.filterShadow = false; n.layer.shadowOpacity = 0 }
            } else {
                let list = FilterList(wire: a(0))
                n.filterList = list
                n.layer.filters = list.coreImageChain(forLayer: true)
                if let sh = list.shadow {
                    let color = sh.color ?? .black
                    n.filterShadow = true
                    n.layer.shadowPath = nil
                    n.layer.shadowColor = color.withAlphaComponent(1).cgColor
                    n.layer.shadowOpacity = Float(color.alphaComponent)
                    n.layer.shadowOffset = CGSize(width: sh.dx, height: -sh.dy)     // y-up space, the SHADOW precedent
                    n.layer.shadowRadius = sh.blur / 2                              // CSS blur ≈ 2× CA radius
                } else if n.filterShadow {
                    n.filterShadow = false
                    n.layer.shadowOpacity = 0
                }
            }
        case 48: // TRANSFORM3D — rotateX rotateY translateZ backfaceHidden, or null
            guard let n = nodes[id] else { return }
            if a(0) == nil || a(0) is NSNull { n.rot3D = nil } else {
                n.rot3D = (num(a(0)), num(a(1)), num(a(2)), num(a(3)) != 0)
                n.pivot = CGPoint(x: num(a(4)), y: num(a(5)))   // the affine folds the pivot in; the rotation needs it here
            }
            n.layer.isDoubleSided = !(n.rot3D?.backfaceHidden ?? false)
            applyScale(n)
        case 49: // PERSPECTIVE — this node is the eye for its children
            guard let n = nodes[id] else { return }
            n.perspective = num(a(0))
            applyPerspective(n)
        case 47: // IMAGEALIGN — start / center / end per axis
            guard let n = nodes[id] else { return }
            let f: (String?) -> CGFloat = { $0 == "start" ? 0 : $0 == "end" ? 1 : 0.5 }
            n.alignX = f(str(a(0))); n.alignY = f(str(a(1)))
            applyImage(n)
        case 46: // TRANSFORM — the affine, y-down local → parent (pivot folded in)
            guard let n = nodes[id] else { return }
            n.affine = (num(a(0)), num(a(1)), num(a(2)), num(a(3)), num(a(4)), num(a(5)))
            applyScale(n)
        case 45: // MASK — a soft alpha mask (graphics-pass.md §2), as `layer.mask`:
            // a gradient layer over the box, or the stencil node's subtree
            // rendered to a bitmap at its box (re-rendered per commit — the
            // frost's epoch rule — see refreshMasks).
            guard let n = nodes[id] else { return }
            if a(0) == nil || a(0) is NSNull {
                n.maskGradient = nil; n.maskStencil = nil
                n.layer.mask = nil
            } else if str(a(0)) == "gradient" {
                n.maskGradient = a(1) as? [String: Any]; n.maskStencil = nil
                syncMask(n)
            } else {
                n.maskGradient = nil
                n.maskStencil = ((a(1) as? NSNumber)?.intValue ?? -1, num(a(2)), num(a(3)), num(a(4)), num(a(5)))
                n.maskEpoch = -1
                syncMask(n)
            }
        default:
            break
        }
    }

    /// Keep a node's mask layer sized to its box (a gradient mask) or placed at
    /// the stencil's box (a view mask), and re-render a stencil whose epoch is
    /// behind. Called from the op arm, from place(), and per commit.
    func syncMask(_ n: Node) {
        if let g = n.maskGradient {
            let m = (n.layer.mask as? CAGradientLayer) ?? {
                let l = CAGradientLayer(); l.anchorPoint = .zero
                l.actions = ["colors": NSNull(), "bounds": NSNull(), "position": NSNull(), "locations": NSNull()]
                n.layer.mask = l; return l }()
            applyGradientSpec(m, g, size: n.box.size)
            m.bounds = CGRect(origin: .zero, size: n.box.size)
            m.position = .zero
        } else if let st = n.maskStencil {
            let m = (n.layer.mask as? CALayer).flatMap { $0 is CAGradientLayer ? nil : $0 } ?? {
                let l = CALayer(); l.anchorPoint = .zero; l.contentsGravity = .resize
                l.actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull()]
                n.layer.mask = l; return l }()
            // the stencil's box, in the masked node's y-up layer space
            m.bounds = CGRect(origin: .zero, size: CGSize(width: st.w, height: st.h))
            m.position = CGPoint(x: st.x, y: n.box.size.height - st.y - st.h)
            if n.maskEpoch != frostEpoch, let stencil = nodes[st.id] {
                n.maskEpoch = frostEpoch
                payOwedDrawings(stencil)
                m.contents = renderStencil(stencil, size: CGSize(width: st.w, height: st.h))
            }
        }
    }

    /// A hidden stencil's drawings were owed (the hidden-raster skip); a mask
    /// needs them now.
    private func payOwedDrawings(_ n: Node) {
        if n.drawList != nil, deferredDraw.contains(n.id) { rasterize(n); deferredDraw.remove(n.id) }
        for k in n.children { payOwedDrawings(k) }
    }

    /// A stencil's painted alpha as a bitmap: its subtree rendered at its own
    /// origin, at the screen's backing scale (`render(in:)` ignores CI
    /// filters, so a filtered stencil masks by its unfiltered paint).
    private func renderStencil(_ st: Node, size: CGSize) -> CGImage? {
        let scale = max(1, view?.window?.backingScaleFactor ?? 2)
        let w = Int((size.width * scale).rounded()), h = Int((size.height * scale).rounded())
        guard w > 0, h > 0, let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else { return nil }
        ctx.scaleBy(x: scale, y: scale)
        // a hidden stencil (the `visible = false` idiom) still renders here
        let wasHidden = st.layer.isHidden
        st.layer.isHidden = false
        st.layer.render(in: ctx)
        st.layer.isHidden = wasHidden
        return ctx.makeImage()
    }

    /// Per commit: stencil masks whose input may have changed re-render.
    func refreshMasks() {
        for (_, n) in nodes where n.maskStencil != nil && n.maskEpoch != frostEpoch { syncMask(n) }
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
        f.cornerRadius = n.layer.cornerRadius
        f.maskedCorners = n.layer.maskedCorners
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
        // …and so does a SHADOW: a CALayer that masks to its bounds clips its
        // own shadow, where a CSS box-shadow escapes `overflow` (the homepage's
        // Shot cards — clip + radius + glow — lost their glow). The clip moves
        // to the host layer; the outer layer keeps the shadow.
        let clips = n.boxClip || n.clipPath != nil
        let exempt = n.children.contains { $0.ignoresClip }
        let shadowed = n.layer.shadowOpacity > 0
        if clips && (exempt || shadowed) {
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
                let live = b.update(box: viewport(n), extent: pageExtentY(n), offset: n.scrollOffset)
                // the page root's bar lives in the WINDOW's rectangle, which is
                // the top of the (taller) root layer in its bottom-up space
                if n.isRoot { b.layer.position.y += n.box.height - viewport(n).height }
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
                let live = b.update(box: viewport(n), extent: pageExtentX(n), offset: n.scrollXOffset)
                if n.isRoot { b.layer.position.y += n.box.height - viewport(n).height }
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
        if n.maskGradient != nil || n.maskStencil != nil { syncMask(n) }
        if n.perspective > 0 { applyPerspective(n) }
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

    /// node id → the scaled copy its layer is showing, and the size bucket it was
    /// made for (displayImage).
    private var scaledImages: [Int: (bucket: Int, image: CGImage)] = [:]
    /// node id → the bucket a background resample is currently making for it.
    private var scalingFor: [Int: Int] = [:]

    private func layoutContent(_ n: Node) {
        let h = n.box.height
        if let g = n.gradient { g.bounds = CGRect(origin: .zero, size: n.box.size); g.position = .zero }
        if let i = n.image {
            i.bounds = CGRect(origin: .zero, size: n.box.size); i.position = .zero
            // the box decides the size bucket; a resize past it wants new pixels
            if let h = n.imageHandle, let img = bridge.image(h) {
                let shown = displayImage(n, img)
                if n.tint == nil, i.contents as AnyObject? !== shown { i.contents = shown }
            }
        }
        if let p = n.player { p.bounds = CGRect(origin: .zero, size: n.box.size); p.position = .zero }
        if let t = n.text { t.fit(box: n.box.size) }
    }

    /// A TextStyle payload → the spec. Shared by TEXTSTYLE and by EDIT, which
    /// carries a style of its own (as the DOM's EditableSpec does).
    /// The language's whole weight vocabulary, as numbers.
    ///
    /// ⚠ This MUST agree with the runtime's `WEIGHT_CSS` (runtime/src/measure.ts,
    /// mirrored in font.ts's FONT_WEIGHTS) — because the two are used on
    /// opposite sides of the SAME text. The runtime asks the measurer for a
    /// width using its own spelling of the weight, and this table decides what
    /// the host then RENDERS with. A keyword missing here does not merely draw
    /// the wrong weight: it draws a weight the box was not measured for, and
    /// the surplus is clipped by the layer's bounds.
    ///
    /// That is exactly what `thin` did. It was absent, fell to the `400`
    /// default, and weather's 34px city temperatures were measured as
    /// UltraLight (advance 50.7) but drawn as Regular (55.0) — so the degree
    /// sign lost 4pt off its right edge in every row of the list.
    private static let cssWeights: [String: String] = [
        "thin": "100", "extralight": "200", "light": "300",
        "regular": "400", "normal": "400", "medium": "500",
        "semibold": "600", "bold": "700", "extrabold": "800", "black": "900",
    ]

    private func parseTextStyle(_ s: [String: Any]) -> TextStyleSpec {
        var st = TextStyleSpec()
        let family = s["family"] as? String ?? "system-ui"
        let size = (s["size"] as? NSNumber)?.doubleValue ?? 13
        let weight = s["weight"]
        let weightStr: String = {
            if let n = weight as? NSNumber { return String(n.intValue) }
            if let t = weight as? String {
                if let n = Int(t) { return String(n) }          // already numeric
                return LayerTree.cssWeights[t.lowercased()] ?? "400"
            }
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
        st.lineHeight = (s["lineHeight"] as? NSNumber)?.doubleValue ?? 0
        st.maxLines = (s["maxLines"] as? NSNumber)?.intValue ?? 0
        st.letterSpacing = (s["letterSpacing"] as? NSNumber)?.doubleValue ?? 0
        st.selectable = (s["selectable"] as? NSNumber)?.boolValue ?? false
        if let sh = s["shadow"] as? [Any], sh.count == 4 {
            st.shadow = ((sh[0] as? NSNumber)?.doubleValue ?? 0, (sh[1] as? NSNumber)?.doubleValue ?? 0,
                         (sh[2] as? NSNumber)?.doubleValue ?? 0,
                         (sh[3] as? String).flatMap { CSSColor.parse($0) } ?? .labelColor)
        }
        st.transform = s["textTransform"] as? String
        st.smallCaps = (s["smallCaps"] as? NSNumber)?.boolValue ?? false
        st.underline = (s["underline"] as? NSNumber)?.boolValue ?? false
        st.strike = (s["strike"] as? NSNumber)?.boolValue ?? false
        if let o = s["outline"] as? [String: Any], let w = (o["width"] as? NSNumber)?.doubleValue, w > 0 {
            st.outline = (w, (o["color"] as? String).flatMap { CSSColor.parse($0) } ?? .labelColor)
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
        t.maxLines = n.textStyle.maxLines
        // The shared model (canvas-backend does the same arithmetic): a declared
        // leading is round(fontSize × multiplier) and spaces the BASELINES; the
        // first one still sits at the ascent. 0 keeps the face's own line box.
        t.lineHeight = n.textStyle.lineHeight > 0
            ? (TextEngine.parse(n.textStyle.fontCSS).size * n.textStyle.lineHeight).rounded()
            : 0
        t.align = n.textStyle.align
        t.fillGradient = n.textStyle.fillGradient
        t.attributed = TextEngine.attributed(n.textString, style: n.textStyle)
        t.fit(box: n.box.size)
    }

    /// Bitmaps far larger than the box they are drawn in, at the size they will
    /// actually be drawn — scaled OFF the main thread.
    ///
    /// Core Animation does not upload an oversized image and let the GPU scale
    /// it: `CA::Layer::prepare_contents` renders a scaled COPY, on the main
    /// thread, inside the commit, and again whenever the layer's geometry moved.
    /// Measured 2026-09-13 with `sample(1)` on the All Access mirror, after the
    /// lazy-decode fix: 1360 of 1531 commit samples were
    /// `CA::Render::create_image_by_rendering → CGContextDrawImage`, re-scaling
    /// 12-megapixel badges into a 260 pt card every frame.
    ///
    /// So scale once per layer per SIZE BUCKET (powers of two, so a springing
    /// scale does not re-scale every frame) — but NOT inline. Doing it inline
    /// merely moved the cost into the first commit: 225 samples in this function
    /// during boot, a 362 ms frame. A browser decodes and resamples off-thread
    /// and shows what it has meanwhile, which is exactly this: hand back the
    /// image we already have, scale on a background queue, swap the layer's
    /// contents when the copy lands.
    private func displayImage(_ n: Node, _ img: CGImage) -> CGImage {
        let need = max(n.box.width, n.box.height) * scale * 2      // 2× headroom for scale-up
        let have = CGFloat(max(img.width, img.height))
        guard need > 0, have > need * 1.3 else { return img }      // close enough: use the pixels we have
        let bucket = max(64, Int(exp2((log2(Double(need))).rounded(.up))))
        if let c = scaledImages[n.id], c.bucket == bucket { return c.image }
        if scalingFor[n.id] != bucket {
            scalingFor[n.id] = bucket
            let id = n.id
            DispatchQueue.global(qos: .userInitiated).async {
                guard let out = LayerTree.resample(img, longest: bucket) else { return }
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.scalingFor[id] == bucket else { return }   // the size moved on
                    if self.scaledImages.count > 64 { self.scaledImages.removeAll() }
                    self.scaledImages[id] = (bucket, out)
                    if let node = self.nodes[id], let layer = node.image, node.tint == nil {
                        layer.contents = out
                    }
                    self.bridge.needsFrame()
                }
            }
        }
        return img                                                  // this frame draws what we have
    }

    /// One resample into an sRGB bitmap, premultiplied-first little-endian —
    /// Core Animation's own layout, so the upload needs no conversion pass.
    private static func resample(_ img: CGImage, longest: Int) -> CGImage? {
        let have = CGFloat(max(img.width, img.height))
        guard have > 0 else { return nil }
        let k = CGFloat(longest) / have
        let w = max(1, Int((CGFloat(img.width) * k).rounded()))
        let h = max(1, Int((CGFloat(img.height) * k).rounded()))
        guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: cs,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
                                      | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
        return ctx.makeImage()
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
        let shown = displayImage(n, img)
        l.contents = n.tint.flatMap { LayerTree.tinted(shown, $0) } ?? shown
        l.masksToBounds = true
        l.contentsRect = CGRect(x: 0, y: 0, width: 1, height: 1)
        let aligned = n.alignX != 0.5 || n.alignY != 0.5
        if aligned, n.stretch == "contain" || n.stretch == "cover", img.width > 0, img.height > 0, n.box.width > 0, n.box.height > 0 {
            // an ALIGNED fit (case 47): CA's aspect gravities always centre, so
            // place the fit ourselves — contain as the picture's own rect in
            // the box, cover as a crop (contentsRect) of the picture over the
            // whole box; y is the layer's y-UP space, so `alignY` flips
            let iw = CGFloat(img.width), ih = CGFloat(img.height)
            let bw = n.box.width, bh = n.box.height
            l.contentsGravity = .resize
            if n.stretch == "contain" {
                let k = min(bw / iw, bh / ih)
                let dw = iw * k, dh = ih * k
                l.bounds = CGRect(origin: .zero, size: CGSize(width: dw, height: dh))
                l.position = CGPoint(x: (bw - dw) * n.alignX, y: (bh - dh) * (1 - n.alignY))
            } else {
                let k = max(bw / iw, bh / ih)
                let dw = iw * k, dh = ih * k
                // the visible fraction of the picture, offset by the alignment
                let fw = bw / dw, fh = bh / dh
                l.contentsRect = CGRect(x: (1 - fw) * n.alignX, y: (1 - fh) * (1 - n.alignY), width: fw, height: fh)
                l.bounds = CGRect(origin: .zero, size: n.box.size)
                l.position = .zero
            }
        } else if n.stretch == "cover" || n.stretch == "contain" {
            l.contentsGravity = n.stretch == "cover" ? .resizeAspectFill : .resizeAspect
            l.bounds = CGRect(origin: .zero, size: n.box.size)
            l.position = .zero
        } else {
            // `none | width | height | both`: the STRETCHED axis takes the box, the
            // other keeps the picture's natural size, drawn from the box's top-left
            // — the arithmetic canvas-backend does. This arm used to test for a
            // "fill" token the runtime never sends (the set is none|width|height|
            // both|cover|contain), so all four of these fell through to aspect-fit.
            let iw = CGFloat(img.width), ih = CGFloat(img.height)
            let dw = max(0, (n.stretch == "width" || n.stretch == "both") ? n.box.width : iw)
            let dh = max(0, (n.stretch == "height" || n.stretch == "both") ? n.box.height : ih)
            l.contentsGravity = .resize
            l.bounds = CGRect(origin: .zero, size: CGSize(width: dw, height: dh))
            l.position = CGPoint(x: 0, y: n.box.height - dh)          // y-UP: the box's top
        }
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
        applyGradientSpec(g, spec, size: n.box.size)
        g.bounds = CGRect(origin: .zero, size: n.box.size)
        g.position = .zero
        g.cornerRadius = n.radius
        g.masksToBounds = true
    }

    /// A gradient spec (kind, angle, centre, reach, stops) onto a gradient
    /// layer — the box fill and a gradient mask share it.
    private func applyGradientSpec(_ g: CAGradientLayer, _ spec: [String: Any], size: CGSize) {
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
        let kind = spec["kind"] as? String ?? "linear"
        let w = size.width, h = size.height
        // centre as fractions of the box; the layer's unit space is y-UP
        let cx = CGFloat((spec["cx"] as? NSNumber)?.doubleValue ?? 0.5)
        let cy = 1 - CGFloat((spec["cy"] as? NSNumber)?.doubleValue ?? 0.5)
        switch kind {
        case "radial":
            // CSS `circle farthest-corner at cx cy`, the ramp reaching r of that
            // distance; CA's radial is an ellipse from startPoint to the
            // endPoint's axis extents, so scale the circle into unit space
            g.type = .radial
            let px = cx * w, py = cy * h
            let far = hypot(max(px, w - px), max(py, h - py))
            let reach = far * CGFloat((spec["r"] as? NSNumber)?.doubleValue ?? 1)
            g.startPoint = CGPoint(x: cx, y: cy)
            g.endPoint = CGPoint(x: cx + (w > 0 ? reach / w : 0), y: cy + (h > 0 ? reach / h : 0))
        case "conic":
            // CSS `from Adeg` starts at 12 o'clock, clockwise on screen; CA's
            // conic sweeps from the start→end direction, counter-clockwise in
            // its y-up space — so mirror the angle
            g.type = .conic
            let rad = (deg) * .pi / 180
            g.startPoint = CGPoint(x: cx, y: cy)
            g.endPoint = CGPoint(x: cx + sin(rad) / 2, y: cy + cos(rad) / 2)
            // CA sweeps counter-clockwise on screen (its y-up space); CSS sweeps
            // clockwise — mirror by reversing the stops
            if let cs = g.colors, let ls = g.locations {
                g.colors = Array(cs.reversed())
                g.locations = ls.reversed().map { NSNumber(value: 1 - $0.doubleValue) }
            }
        default:
            g.type = .axial
            let rad = deg * .pi / 180
            let dx = sin(rad) / 2, dy = cos(rad) / 2
            g.startPoint = CGPoint(x: 0.5 - dx, y: 0.5 - dy)
            g.endPoint = CGPoint(x: 0.5 + dx, y: 0.5 + dy)
        }
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
        if let m = n.affine {
            // The model's matrix is in y-DOWN local space; this layer space is
            // y-UP, so conjugate by the flip about the box: F·M·F, F = (1,0,0,−1,0,h).
            // With F(x,y) = (x, h−y):  F(M(F(x,y))) = (a·x − c·y + (c·h + e),  −b·x + d·y + (h − d·h − f)).
            let h = n.box.height
            var t = CATransform3DIdentity
            t.m11 = m.a; t.m12 = -m.b; t.m21 = -m.c; t.m22 = m.d
            t.m41 = m.c * h + m.e; t.m42 = h - m.d * h - m.f
            if let r = n.rot3D {
                // the 3D rotation about the pivot, AFTER the affine (CSS order):
                // in this y-up space a rotation about X flips its sign, one
                // about Y keeps it, and +z is toward the viewer as in CSS
                let px = n.pivot.x, py = h - n.pivot.y
                var r3 = CATransform3DMakeTranslation(px, py, 0)
                r3 = CATransform3DRotate(r3, -r.rx * .pi / 180, 1, 0, 0)    // the y-flip negates the rotation about X (measured: trapezoid matches the DOM)
                r3 = CATransform3DRotate(r3, r.ry * .pi / 180, 0, 1, 0)
                r3 = CATransform3DTranslate(r3, -px, -py, r.tz)
                t = CATransform3DConcat(t, r3)
                // the parent's eye (CSS `perspective`, origin at the parent's
                // centre), folded into THIS layer's transform as CSS does per
                // element — a sublayerTransform's perspective is about the
                // parent's anchor and was measured off-centre
                if let par = n.parent, par.perspective > 0 {
                    let ex = par.box.width / 2 - n.box.origin.x
                    let ey = n.box.origin.y + n.box.height - par.box.height / 2
                    var pm = CATransform3DIdentity
                    pm.m34 = -1 / par.perspective
                    var eye = CATransform3DMakeTranslation(-ex, -ey, 0)
                    eye = CATransform3DConcat(eye, pm)
                    eye = CATransform3DConcat(eye, CATransform3DMakeTranslation(ex, ey, 0))
                    t = CATransform3DConcat(t, eye)
                }
            }
            n.layer.transform = t
            syncFrost(n); return
        }
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

    /// CSS `perspective` on this node: its sublayers are seen through an eye
    /// `perspective` px in front of the box's centre. CA's sublayerTransform
    /// is about the anchor (the bottom-left here), so conjugate by the centre.
    private func applyPerspective(_ n: Node) {
        // the eye rides each 3D child's own transform (applyScale); a change
        // of eye, or of the box it is centred on, re-projects them
        for c in n.children where c.rot3D != nil { applyScale(c) }
    }

    private func applyShadowPath(_ n: Node) {
        n.layer.shadowPath = cornerPath(n)
    }

    // ── corners ─────────────────────────────────────────────────────────────

    /// The corner mapping into this layer space, which is y-UP (see the SHADOW
    /// note): the model's top-left is the layer's min-x / MAX-y corner.
    private static let cornerMasks: [CACornerMask] = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner, .layerMaxXMinYCorner, .layerMinXMinYCorner]

    /// The four corners fitted to the box as CSS fits them: when two adjacent
    /// radii would overlap along an edge every radius shrinks by one factor
    /// (the web backends' radiusFit, mirrored).
    private func fittedCorners(_ n: Node) -> [CGFloat] {
        let c = (n.radii ?? [n.radius, n.radius, n.radius, n.radius]).map { max(0, $0) }
        let w = n.box.width, h = n.box.height
        func over(_ edge: CGFloat, _ sum: CGFloat) -> CGFloat { sum > 0 ? edge / sum : 1 }
        let f = min(1, over(w, c[0] + c[1]), over(w, c[3] + c[2]), over(h, c[0] + c[3]), over(h, c[1] + c[2]))
        return f >= 1 ? c : c.map { $0 * f }
    }

    /// The box outline with its corners, in layer space (y-up: tl at max-y).
    private func cornerPath(_ n: Node) -> CGPath {
        let c = fittedCorners(n)
        let w = n.box.width, h = n.box.height
        let tl = c[0], tr = c[1], br = c[2], bl = c[3]
        let p = CGMutablePath()
        p.move(to: CGPoint(x: tl, y: h))
        p.addLine(to: CGPoint(x: w - tr, y: h))
        if tr > 0 { p.addArc(tangent1End: CGPoint(x: w, y: h), tangent2End: CGPoint(x: w, y: h - tr), radius: tr) }
        p.addLine(to: CGPoint(x: w, y: br))
        if br > 0 { p.addArc(tangent1End: CGPoint(x: w, y: 0), tangent2End: CGPoint(x: w - br, y: 0), radius: br) }
        p.addLine(to: CGPoint(x: bl, y: 0))
        if bl > 0 { p.addArc(tangent1End: CGPoint(x: 0, y: 0), tangent2End: CGPoint(x: 0, y: bl), radius: bl) }
        p.addLine(to: CGPoint(x: 0, y: h - tl))
        if tl > 0 { p.addArc(tangent1End: CGPoint(x: 0, y: h), tangent2End: CGPoint(x: tl, y: h), radius: tl) }
        p.closeSubpath()
        return p
    }

    /// Route the rounding. A layer rounds ONE radius on a chosen set of corners
    /// (`maskedCorners`) — which is exactly "round these corners, not those",
    /// and stays compositor-native, paint-only (children unclipped, as on the
    /// web). Four DISTINCT radii are past a layer: then the fill and the inside
    /// stroke paint as a shape sublayer tracing cornerPath, and the layer's own
    /// background/border go quiet.
    private func applyRadius(_ n: Node) {
        let c = n.radii
        let nonzero = (c ?? []).filter { $0 > 0 }
        let uniform = c == nil || nonzero.isEmpty || nonzero.allSatisfy { $0 == nonzero[0] }
        if uniform {
            let r = c == nil ? n.radius : (nonzero.first ?? 0)
            var mask: CACornerMask = []
            if let c = c { for i in 0..<4 where c[i] > 0 { mask.insert(Self.cornerMasks[i]) } }
            else { mask = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner, .layerMaxXMinYCorner, .layerMinXMinYCorner] }
            n.layer.cornerRadius = r; n.layer.maskedCorners = mask
            n.clipHost?.cornerRadius = r; n.clipHost?.maskedCorners = mask
            if n.shapeBg != nil { dropShape(n) }
        } else {
            n.layer.cornerRadius = 0
            n.clipHost?.cornerRadius = 0
            syncShape(n)
        }
    }

    private func syncShape(_ n: Node) {
        let sh: CAShapeLayer
        if let e = n.shapeBg { sh = e } else {
            sh = CAShapeLayer(); sh.anchorPoint = .zero
            sh.actions = ["path": NSNull(), "fillColor": NSNull(), "strokeColor": NSNull(), "lineWidth": NSNull(), "bounds": NSNull(), "position": NSNull()]
            n.shapeBg = sh
            n.layer.insertSublayer(sh, at: 0)
        }
        sh.bounds = CGRect(origin: .zero, size: n.box.size); sh.position = .zero
        let path = cornerPath(n)
        sh.path = path
        sh.fillColor = n.fillColor
        // an INSIDE stroke, as the other renderers paint it: stroke the outline
        // at double width, masked to the outline — the inner half remains
        if n.strokeW > 0, let sc = n.strokeColor {
            sh.strokeColor = sc; sh.lineWidth = n.strokeW * 2
            let m = CAShapeLayer(); m.anchorPoint = .zero
            m.bounds = sh.bounds; m.position = .zero; m.path = path
            sh.mask = m
        } else { sh.strokeColor = nil; sh.lineWidth = 0; sh.mask = nil }
        n.layer.backgroundColor = nil
        n.layer.borderWidth = 0
        if let g = n.gradient {
            let m = CAShapeLayer(); m.anchorPoint = .zero
            m.bounds = sh.bounds; m.position = .zero; m.path = path
            g.mask = m
        }
    }

    private func dropShape(_ n: Node) {
        n.shapeBg?.removeFromSuperlayer(); n.shapeBg = nil
        n.gradient?.mask = nil
        n.layer.backgroundColor = n.gradient == nil ? n.fillColor : nil
        n.layer.borderWidth = n.strokeW
        n.layer.borderColor = n.strokeColor
    }

    // ── drawings ────────────────────────────────────────────────────────────

    /// ON by default. A recording the describer refuses still rasterizes, so
    /// this only ever changes what it can express — 82% of the corpus at load —
    /// and `describedN`/`rasterizedN` say how much that is for any given run.
    /// `DECLARE_NO_LAYERS` forces the old path, which is how the two are diffed.
    static let layersOn = ProcessInfo.processInfo.environment["DECLARE_NO_LAYERS"] == nil
    var describedN = 0, rasterizedN = 0

    /// Hand the compositor a DESCRIPTION rather than pixels, when we can.
    /// Returns false if this recording is not expressible.
    private func describe(_ n: Node) -> Bool {
        guard let list = n.drawList,
              let out = LayerDescribe.describe(list, scale: scale) else { return false }
        let host: CALayer
        if let e = n.draw, e is CAShapeLayer == false, e.name == "described" { host = e; e.sublayers?.forEach { $0.removeFromSuperlayer() } }
        else {
            n.draw?.removeFromSuperlayer()
            let l = CALayer()
            l.name = "described"
            l.anchorPoint = .zero
            l.actions = ["position": NSNull(), "bounds": NSNull(), "sublayers": NSNull()]
            n.draw = l
            host = l
            restack(n)
        }
        host.contentsScale = scale
        host.bounds = CGRect(x: 0, y: 0, width: out.w, height: out.h)
        host.position = CGPoint(x: out.bx, y: n.box.height - out.by - out.h)
        for l in out.layers { host.addSublayer(l) }
        describedN += 1        // unconditional: two ints, and coverage is only
        return true            // legible if it counts the LOAD, not just a gesture
    }

    private func rasterize(_ n: Node) {
        if LayerTree.layersOn, describe(n) { return }
        rasterizedN += 1
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
        // EXACT UNDER A VIEW SCALE. The bitmap is w×h points on a layer that the
        // ancestor's transform then scales; at the backing scale it is stretched
        // by that transform, the softness the DOM backend also had. The runtime
        // hands the composed density at rest (RASTERSCALE) and the bitmap is made
        // at it — contentsScale carries the extra pixels through CA unchanged.
        let s = n.rasterK > 0 ? n.rasterK : scale
        guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let cg = CGContext(data: nil, width: Int(w * s), height: Int(h * s), bitsPerComponent: 8,
                                 bytesPerRow: 0, space: cs,
                                 bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return }
        if statsOn { rasterPxNodes[n.id, default: 0] += Double(Int(w * s) * Int(h * s)) }
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
        // ⚠ NOT a described container. `describe` leaves shape/gradient
        // SUBLAYERS on n.draw; reusing that as a bitmap host sets `contents`
        // underneath them and paints the drawing TWICE — once as vectors, once
        // as the image. A recording flips this way whenever it becomes
        // inexpressible (it gains text, an image, a focal radial), which is
        // ordinary for a program whose art changes with its state.
        if let e = n.draw, e.name != "described" { l = e } else {
            n.draw?.removeFromSuperlayer()
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
        // Clip to the window FIRST, before the occluder subtraction below. A tall
        // flow scrolled so that most of it is off-screen (the scroll container's
        // own clip=false, so it does not clip here) would otherwise keep its full
        // off-screen extent, and when an occluder — e.g. the top bar — cut across
        // it, `largestRemainder` returned the LARGER, off-screen piece. That zeroed
        // the on-screen slice and dropped the band: the reader went blank a bit
        // into a long scroll. Nothing outside the window is ever visible anyway.
        vis = vis.intersection(host.bounds)
        if vis.isNull || vis.isEmpty { return .zero }
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

    // ── the page root's viewport ────────────────────────────────────────────
    //
    // A scroller's viewport is its own box — EXCEPT the page root. Its box is
    // the App's declared or realized size while the WINDOW is what it scrolls
    // in (the DOM's document scroll: the root element is the page, the window
    // is the viewport). Weather's phone dialect declares its App 2652 tall;
    // clamped against its own box the page had a 40px range and "scrolling
    // got super slow" (2026-09-10). The page's extent is likewise the larger
    // of its box and its content.
    func viewport(_ n: Node) -> CGSize { n.isRoot ? (view?.bounds.size ?? n.box.size) : n.box.size }
    func pageExtentY(_ n: Node) -> CGFloat { n.isRoot ? Swift.max(n.scrollExtent, n.box.height) : n.scrollExtent }
    func pageExtentX(_ n: Node) -> CGFloat { n.isRoot ? Swift.max(n.scrollExtentX, n.box.width) : n.scrollExtentX }

    // ── THE SCROLL PROCESS (scrolling.md "The scroll process", ruled 2026-09-10) ──
    //
    // Scrolling on the native host is the HOST's process — the platform
    // provider, over the layer tree. A wheel over a scroller never crosses to
    // JS: the walk below (the runtime's own scrollBy descent, in Swift) finds
    // the scroller, the delta lands on its offset, the FRAME commits the
    // content-layer translate (one CATransaction per frame, deltas batched),
    // and only then does the runtime hear the fact — `__declareScrollFacts`,
    // once per frame, after the frame that showed it. A settle can never delay
    // the motion. What does cross is a CLAIMANT's stream (`onWheel`), which is
    // the program's to hear. The trackpad's own momentum arrives as deltas
    // (momentumPhase), applied as delivered — no physics, no rubber band, the
    // desktop rule. Glides (a request's `{ duration, motion }`) run here too.
    //
    // Why not an NSScrollView per scroller: every surface is a CALayer under
    // one view, composed through its ancestors' clips, opacity, transforms and
    // frosts. An NSScrollView is an AppKit SUBVIEW — it draws above the whole
    // layer tree and escapes all of that (the overlays' `visibleRect` is the
    // hand-made workaround for exactly this), and Responsive Scrolling's
    // off-main-thread promise buys nothing while the runtime itself runs on
    // the main thread. The process below keeps the composition and delivers
    // the contract: offsets move on the host, facts follow.

    /// Nodes with a glide in flight, and nodes whose offset moved since the
    /// last frame (committed together at the frame).
    private var gliding = Set<Int>()
    private var pendingMoves = Set<Int>()
    /// Nodes with facts to report at the next frame, in order.
    private var dirtyScroll: [Int] = []
    private func markFact(_ n: Node) {
        if !n.factDirty { n.factDirty = true; dirtyScroll.append(n.id) }
    }

    /// A plain request or a gesture cancels the glide on its axis; when
    /// nothing else keeps the scroller live, `scrolling` settles with it.
    private func cancelGlide(_ n: Node, vertical: Bool) {
        if vertical { n.glideY = nil } else { n.glideX = nil }
        guard n.glideY == nil, n.glideX == nil else { return }
        gliding.remove(n.id)
        if n.quietWork == nil, !n.gestureLive, n.scrollingLive { n.scrollingLive = false; markFact(n) }
    }

    enum WheelTarget { case claim(Node), scroller(Node) }

    /// The runtime's wheel descent (mac-backend wheelTo + scrollBy, verbatim
    /// in Swift): reverse paint order, the innermost `onWheel` claimant or
    /// scroller under the point — whichever is deeper. A subtree that contains
    /// a scroller ends the sibling search whether or not that scroller can use
    /// the delta (the desktop's overlapping windows: one gesture must never
    /// scroll the window BEHIND); chrome with nothing to scroll passes through.
    func wheelTarget(atModel p: CGPoint) -> WheelTarget? {
        guard let v = view, let host = v.layer, let r = root else { return nil }
        let hp = CGPoint(x: p.x, y: v.bounds.height - p.y)
        guard let n = wheelWalk(r, hp, host) else { return nil }
        return n.wantsWheel ? .claim(n) : .scroller(n)
    }
    private func wheelWalk(_ n: Node, _ hp: CGPoint, _ host: CALayer) -> Node? {
        guard !n.layer.isHidden, n.layer.opacity > 0, n.layer.superlayer != nil else { return nil }
        // the layer's own space carries the transforms and the scroll
        // translations; model-local is its flip
        let l = n.layer.convert(hp, from: host)
        let ml = CGPoint(x: l.x, y: n.box.height - l.y)
        let inBox = ml.x >= 0 && ml.y >= 0 && ml.x < n.box.width && ml.y < n.box.height
        if n.boxClip && !inBox { return nil }
        if let cp = n.clipPath, !cp.contains(ml) { return nil }
        if (n.scrolls || n.scrollsX) && !inBox { return nil }
        for c in n.children.reversed() { if let hit = wheelWalk(c, hp, host) { return hit } }
        if n.wantsWheel && inBox { return n }
        return (n.scrolls || n.scrollsX) && inBox ? n : nil
    }

    /// The scroller that takes a delta on one axis: the target itself or its
    /// nearest ancestor that scrolls that way AND has somewhere to go — a
    /// vertical wheel over an x-only strip scrolls the page it sits in.
    func axisScrollerPublic(from n: Node, vertical: Bool) -> Node? { axisScroller(from: n, vertical: vertical) }
    private func axisScroller(from n: Node, vertical: Bool) -> Node? {
        var cur: Node? = n
        while let m = cur {
            if vertical, m.scrolls, pageExtentY(m) > viewport(m).height + 0.5 { return m }
            // the page pans on x whenever it is wider than the window, declared
            // or not — the browser's own behaviour for a floored app
            if !vertical, m.scrollsX || (m.isRoot && m.scrolls), pageExtentX(m) > viewport(m).width + 0.5 { return m }
            cur = m.parent
        }
        return nil
    }

    /// A wheel event, model coordinates — from the view (scrollWheel /
    /// magnify) or the control channel. `phase`/`momentum` empty = a legacy
    /// mouse wheel (no gesture, ends when quiet).
    func wheel(atModel p: CGPoint, dx: CGFloat, dy: CGFloat, pinch: Bool,
               phase: NSEvent.Phase, momentum: NSEvent.Phase) {
        let target = wheelTarget(atModel: p)
        if LayerTree.scrollDebug {
            NSLog("[scroll] wheel at (%.0f,%.0f) d=(%.0f,%.0f) phase=%d momentum=%d -> %@", p.x, p.y, dx, dy,
                  phase.rawValue, momentum.rawValue, target.map { t -> String in
                      switch t { case .claim(let n): return "claim #\(n.id)"; case .scroller(let n): return "scroller #\(n.id) ext=\(Int(n.scrollExtent)) box=\(Int(n.box.height))" } } ?? "nothing")
        }
        guard let target else { return }
        switch target {
        case .claim:
            bridge.call("__declareWheel", [Double(p.x), Double(p.y), Double(dx), Double(dy), pinch ? 1 : 0])
            bridge.needsFrame()
        case .scroller(let n):
            if pinch { return }                          // a pinch is nobody's scroll
            let legacy = phase.isEmpty && momentum.isEmpty
            var owners: [Node] = []
            if dy != 0, let ny = axisScroller(from: n, vertical: true) {
                cancelGlide(ny, vertical: true)
                let lim = Swift.max(0, pageExtentY(ny) - viewport(ny).height)
                let next = min(lim, Swift.max(0, ny.scrollOffset + dy))
                if next != ny.scrollOffset { ny.scrollOffset = next; pendingMoves.insert(ny.id) }
                owners.append(ny)                        // CONTAIN: owned even at its limit
            }
            if dx != 0, let nx = axisScroller(from: n, vertical: false) {
                cancelGlide(nx, vertical: false)
                let lim = Swift.max(0, pageExtentX(nx) - viewport(nx).width)
                let next = min(lim, Swift.max(0, nx.scrollXOffset + dx))
                if next != nx.scrollXOffset { nx.scrollXOffset = next; pendingMoves.insert(nx.id) }
                if !owners.contains(where: { $0 === nx }) { owners.append(nx) }
            }
            for m in owners { streamEvent(m, phase: phase, momentum: momentum, gesture: !legacy, legacy: legacy) }
            if !owners.isEmpty { bridge.needsFrame() }
        }
    }

    /// Stream bookkeeping for one scroller: `scrolling` rises with the first
    /// delta and settles when the platform says the stream ended (momentum
    /// .ended/.cancelled), or when it goes quiet — 80ms after a lifted finger
    /// that no momentum followed, 120ms after the last legacy wheel tick.
    private func streamEvent(_ n: Node, phase: NSEvent.Phase, momentum: NSEvent.Phase, gesture: Bool, legacy: Bool) {
        n.quietWork?.cancel(); n.quietWork = nil
        if !n.scrollingLive { n.scrollingLive = true; markFact(n) }
        if n.gestureLive != gesture { n.gestureLive = gesture; markFact(n) }
        if momentum.contains(.ended) || momentum.contains(.cancelled) { endStream(n); return }
        let fingerUp = phase.contains(.ended) || phase.contains(.cancelled)
        let delay: TimeInterval = legacy ? 0.12 : (fingerUp ? 0.08 : 0.5)
        let w = DispatchWorkItem { [weak self, weak n] in
            guard let self, let n else { return }
            n.quietWork = nil
            self.endStream(n)
            self.bridge.needsFrame()
        }
        n.quietWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: w)
    }
    private func endStream(_ n: Node) {
        if n.gestureLive { n.gestureLive = false; markFact(n) }
        if n.scrollingLive, n.glideY == nil, n.glideX == nil { n.scrollingLive = false; markFact(n) }
    }

    /// The scroll process's frame step — FIRST in the frame (Bridge.onFrame):
    /// glides advance, every offset that moved since the last frame commits
    /// as one transaction. Returns whether another frame is wanted.
    static let scrollDebug = ProcessInfo.processInfo.environment["DECLARE_DEBUG_SCROLL"] != nil
    func tickScroll(now: CFTimeInterval) -> Bool {
        var live = false
        if LayerTree.scrollDebug, !gliding.isEmpty || !pendingMoves.isEmpty {
            NSLog("[scroll] tick gliding=%d pending=%d", gliding.count, pendingMoves.count)
        }
        for id in Array(gliding) {
            guard let n = nodes[id] else { gliding.remove(id); continue }
            if let g = n.glideY {
                let p = min(1, (now - g.start) / g.duration)
                let v = g.from + (g.to - g.from) * Self.bezier(g.bezier, CGFloat(p))
                if v != n.scrollOffset { n.scrollOffset = v; pendingMoves.insert(id) }
                if p >= 1 { n.glideY = nil } else { live = true }
            }
            if let g = n.glideX {
                let p = min(1, (now - g.start) / g.duration)
                let v = g.from + (g.to - g.from) * Self.bezier(g.bezier, CGFloat(p))
                if v != n.scrollXOffset { n.scrollXOffset = v; pendingMoves.insert(id) }
                if p >= 1 { n.glideX = nil } else { live = true }
            }
            if n.glideY == nil && n.glideX == nil {
                gliding.remove(id)
                if LayerTree.scrollDebug { NSLog("[scroll] glide #%d done at y=%.0f", n.id, n.scrollOffset) }
                if n.quietWork == nil, !n.gestureLive, n.scrollingLive { n.scrollingLive = false; markFact(n) }
            }
        }
        commitMoves()
        return live
    }

    /// One CATransaction for every scroller that moved: the content-layer
    /// translate, the bars, the bands, the overlays — the SCROLLPOS body,
    /// batched. Nothing here reads the runtime.
    private func commitMoves() {
        guard !pendingMoves.isEmpty else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for id in pendingMoves {
            guard let n = nodes[id] else { continue }
            place(n)
            for c in n.children { place(c) }
            updateBars(n, flash: true)
            markFact(n)
        }
        pendingMoves.removeAll()
        flushBands()
        // content just moved under every frost: the sampler re-captures in
        // this same transaction, exactly as an op commit does (apply)
        frostEpoch &+= 1
        let fr = refreshFrosts()
        refreshMasks()
        frostLastN = fr.n; frostLastMs = fr.ms
        frostTotalN += fr.n; frostTotalMs += fr.ms
        CATransaction.commit()
        view?.repositionOverlays()
    }

    /// The facts, once per frame, after the frame that showed them:
    /// [id, y | null, x | null, scrolling, gesture] per touched scroller.
    func flushScrollFacts() {
        guard !dirtyScroll.isEmpty else { return }
        var rows: [[Any]] = []
        for id in dirtyScroll {
            guard let n = nodes[id] else { continue }
            n.factDirty = false
            rows.append([n.id, n.scrolls ? Double(n.scrollOffset) as Any : NSNull(),
                         n.scrollsX ? Double(n.scrollXOffset) as Any : NSNull(),
                         n.scrollingLive ? 1 : 0, n.gestureLive ? 1 : 0])
        }
        dirtyScroll.removeAll()
        bridge.call("__declareScrollFacts", [rows])
    }

    /// A CSS cubic bezier (P0 = 0, P3 = 1), solved for t by Newton on x.
    private static func bezier(_ b: (CGFloat, CGFloat, CGFloat, CGFloat), _ t: CGFloat) -> CGFloat {
        if t <= 0 { return 0 }
        if t >= 1 { return 1 }
        let (x1, y1, x2, y2) = b
        func curve(_ a: CGFloat, _ c: CGFloat, _ u: CGFloat) -> CGFloat { ((1 - 3 * c + 3 * a) * u + (3 * c - 6 * a)) * u * u + 3 * a * u }
        func slope(_ a: CGFloat, _ c: CGFloat, _ u: CGFloat) -> CGFloat { 3 * (1 - 3 * c + 3 * a) * u * u + 2 * (3 * c - 6 * a) * u + 3 * a }
        var u = t
        for _ in 0..<8 {
            let x = curve(x1, x2, u) - t
            if abs(x) < 1e-5 { break }
            let d = slope(x1, x2, u)
            if abs(d) < 1e-6 { break }
            u -= x / d
        }
        u = min(1, Swift.max(0, u))
        return curve(y1, y2, u)
    }

    /// Turn a thumb position into a content offset — the host's own gesture,
    /// applied here and reported as a fact like any other scroll.
    func dragScrollbar(_ n: Node, vertical: Bool, to thumbStart: CGFloat) {
        guard let bar = vertical ? n.vbar : n.hbar, bar.live, bar.travel > 0.5 else { return }
        let t = min(1, max(0, (thumbStart - Scrollbar.trackInset) / bar.travel))
        let offset = t * bar.maxOffset
        bar.hold()
        cancelGlide(n, vertical: vertical)
        if vertical {
            if offset != n.scrollOffset { n.scrollOffset = offset; pendingMoves.insert(n.id) }
        } else if offset != n.scrollXOffset { n.scrollXOffset = offset; pendingMoves.insert(n.id) }
        streamEvent(n, phase: [], momentum: [], gesture: true, legacy: true)
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
        deferredDraw.remove(n.id)
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
        deferredDraw.formIntersection(live)
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
    /// Clamp a flow to `lines` (0 lifts it) and answer its new height — the model
    /// apportions one budget across the document, TextKit ends the last line.
    /// -1 when this node has no flow, which tells the runtime nothing happened.
    func richClamp(id: Int, lines: Int) -> Double {
        guard let rich = nodes[id]?.rich else { return -1 }
        let h = Double(rich.clamp(lines: lines))
        if let n = nodes[id] { rich.place(inBox: n.box.size, scale: scale) }
        return h
    }

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


// ── the filter vocabulary, off the wire (graphics-pass.md §1) ───────────────
//
// One list serves two tiers: `backdrop` (Frost.swift samples beneath and runs
// the chain over the sample) and `filter` (case 44 hands the chain to the
// node's own layer). Records ride as `{fn, v}` / `{fn, color}` / the shadow's
// four fields, colours as CSS text — the SHADOW op's own convention.

struct FilterFn {
    let fn: String
    let v: CGFloat
    let color: NSColor?
    let dx: CGFloat, dy: CGFloat, blur: CGFloat
}

struct FilterList {
    let items: [FilterFn]

    init(wire: Any?) {
        var out: [FilterFn] = []
        for raw in (wire as? [[String: Any]]) ?? [] {
            let fn = raw["fn"] as? String ?? ""
            let v = CGFloat((raw["v"] as? NSNumber)?.doubleValue ?? 0)
            let color = (raw["color"] as? String).flatMap { CSSColor.parse($0) }
            out.append(FilterFn(fn: fn, v: v, color: color,
                                dx: CGFloat((raw["dx"] as? NSNumber)?.doubleValue ?? 0),
                                dy: CGFloat((raw["dy"] as? NSNumber)?.doubleValue ?? 0),
                                blur: CGFloat((raw["blur"] as? NSNumber)?.doubleValue ?? 0)))
        }
        items = out
    }

    /// The frost pair Frost.swift's snapshot caches key on.
    var blur: CGFloat { items.filter { $0.fn == "blur" }.reduce(0) { $0 + $1.v } }
    var saturate: CGFloat { items.filter { $0.fn == "saturate" }.reduce(1) { $0 * $1.v } }
    /// Anything beyond the pair — the full chain then runs, keyed by `key`.
    var isPlainFrost: Bool { items.allSatisfy { $0.fn == "blur" || $0.fn == "saturate" } }
    var shadow: FilterFn? { items.first { $0.fn == "shadow" } }
    var key: String {
        items.map { f in
            switch f.fn {
            case "shadow": return String(format: "shadow/%.2f/%.2f/%.2f/%@", f.dx, f.dy, f.blur, f.color?.description ?? "")
            case "tint": return "tint/" + (f.color?.description ?? "")
            default: return String(format: "%@/%.3f", f.fn, f.v)
            }
        }.joined(separator: ",")
    }

    /// The CSS `saturate(s)` matrix verbatim (Filter Effects, Rec.709).
    private static func saturateMatrix(_ s: CGFloat) -> CIFilter? {
        guard let f = CIFilter(name: "CIColorMatrix") else { return nil }
        f.setValue(CIVector(x: 0.213 + 0.787 * s, y: 0.715 - 0.715 * s, z: 0.072 - 0.072 * s, w: 0), forKey: "inputRVector")
        f.setValue(CIVector(x: 0.213 - 0.213 * s, y: 0.715 + 0.285 * s, z: 0.072 - 0.072 * s, w: 0), forKey: "inputGVector")
        f.setValue(CIVector(x: 0.213 - 0.213 * s, y: 0.715 - 0.715 * s, z: 0.072 + 0.928 * s, w: 0), forKey: "inputBVector")
        f.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
        return f
    }
    /// The CSS sepia matrix, lerped by amount.
    private static func sepiaMatrix(_ k: CGFloat) -> CIFilter? {
        guard let f = CIFilter(name: "CIColorMatrix") else { return nil }
        let l = { (a: CGFloat, b: CGFloat) -> CGFloat in a + (b - a) * k }
        f.setValue(CIVector(x: l(1, 0.393), y: l(0, 0.769), z: l(0, 0.189), w: 0), forKey: "inputRVector")
        f.setValue(CIVector(x: l(0, 0.349), y: l(1, 0.686), z: l(0, 0.168), w: 0), forKey: "inputGVector")
        f.setValue(CIVector(x: l(0, 0.272), y: l(0, 0.534), z: l(1, 0.131), w: 0), forKey: "inputBVector")
        f.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
        return f
    }
    /// invert(k): c' = c + (1 − 2c)·k = c(1 − 2k) + k, alpha kept.
    private static func invertMatrix(_ k: CGFloat) -> CIFilter? {
        guard let f = CIFilter(name: "CIColorMatrix") else { return nil }
        let m = 1 - 2 * k
        f.setValue(CIVector(x: m, y: 0, z: 0, w: 0), forKey: "inputRVector")
        f.setValue(CIVector(x: 0, y: m, z: 0, w: 0), forKey: "inputGVector")
        f.setValue(CIVector(x: 0, y: 0, z: m, w: 0), forKey: "inputBVector")
        f.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
        f.setValue(CIVector(x: k, y: k, z: k, w: 0), forKey: "inputBiasVector")
        return f
    }
    /// tint(color): every pixel becomes the colour, shaped by its own alpha —
    /// premultiplied working space, so the bias rides on alpha.
    private static func tintMatrix(_ c: NSColor) -> CIFilter? {
        guard let f = CIFilter(name: "CIColorMatrix"), let rgb = c.usingColorSpace(.sRGB) else { return nil }
        let a = rgb.alphaComponent
        f.setValue(CIVector(x: 0, y: 0, z: 0, w: rgb.redComponent), forKey: "inputRVector")
        f.setValue(CIVector(x: 0, y: 0, z: 0, w: rgb.greenComponent), forKey: "inputGVector")
        f.setValue(CIVector(x: 0, y: 0, z: 0, w: rgb.blueComponent), forKey: "inputBVector")
        f.setValue(CIVector(x: 0, y: 0, z: 0, w: a), forKey: "inputAVector")
        return f
    }

    /// The chain as Core Image filters, in list order, in ENCODED sRGB (the
    /// tone-curve sandwich `applyFrostFilters` established — without it
    /// `saturate` bites far harder than the web's). `forLayer`: a `shadow(…)`
    /// is the layer's own shadow, not a filter, so it is skipped here; a
    /// `blur` on a layer clamps to its extent (CA's default) which is what a
    /// group blur should do at the layer's edge.
    func coreImageChain(forLayer: Bool, blurScale: CGFloat = 1) -> [CIFilter]? {
        var fs: [CIFilter] = []
        for f in items {
            switch f.fn {
            case "blur":
                if f.v > 0.01, let g = CIFilter(name: "CIGaussianBlur") { g.setValue(f.v * blurScale, forKey: kCIInputRadiusKey); fs.append(g) }
            case "saturate":
                if abs(f.v - 1) > 0.001, let m = Self.saturateMatrix(f.v) { fs.append(m) }
            case "grayscale":
                if f.v > 0.001, let m = Self.saturateMatrix(1 - f.v) { fs.append(m) }
            case "brightness":
                // CSS brightness is a plain multiply; CIColorControls' brightness
                // is an offset, so use a matrix scale instead
                if abs(f.v - 1) > 0.001, let m = CIFilter(name: "CIColorMatrix") {
                    m.setValue(CIVector(x: f.v, y: 0, z: 0, w: 0), forKey: "inputRVector")
                    m.setValue(CIVector(x: 0, y: f.v, z: 0, w: 0), forKey: "inputGVector")
                    m.setValue(CIVector(x: 0, y: 0, z: f.v, w: 0), forKey: "inputBVector")
                    m.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
                    fs.append(m)
                }
            case "contrast":
                // CSS contrast: c' = (c − 0.5)·k + 0.5 — a scale about mid-grey
                if abs(f.v - 1) > 0.001, let m = CIFilter(name: "CIColorMatrix") {
                    let off = (1 - f.v) * 0.5
                    m.setValue(CIVector(x: f.v, y: 0, z: 0, w: 0), forKey: "inputRVector")
                    m.setValue(CIVector(x: 0, y: f.v, z: 0, w: 0), forKey: "inputGVector")
                    m.setValue(CIVector(x: 0, y: 0, z: f.v, w: 0), forKey: "inputBVector")
                    m.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
                    m.setValue(CIVector(x: off, y: off, z: off, w: 0), forKey: "inputBiasVector")
                    fs.append(m)
                }
            case "sepia":
                if f.v > 0.001, let m = Self.sepiaMatrix(f.v) { fs.append(m) }
            case "invert":
                if f.v > 0.001, let m = Self.invertMatrix(f.v) { fs.append(m) }
            case "hueRotate":
                if abs(f.v) > 0.001, let h = CIFilter(name: "CIHueAdjust") { h.setValue(f.v * .pi / 180, forKey: kCIInputAngleKey); fs.append(h) }
            case "tint":
                if let c = f.color, let m = Self.tintMatrix(c) { fs.append(m) }
            case "shadow":
                if forLayer { break }
                // in a backdrop chain a shadow of the sample is meaningless; skipped
            default:
                break
            }
        }
        if fs.isEmpty { return nil }
        if let toSRGB = CIFilter(name: "CILinearToSRGBToneCurve"),
           let toLinear = CIFilter(name: "CISRGBToneCurveToLinear") {
            fs = [toSRGB] + fs + [toLinear]
        }
        return fs
    }
}
