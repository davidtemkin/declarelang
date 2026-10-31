import SwiftUI

/// Choosing seats: the hall, the legend, and — once anything is chosen — the running total.
struct HallScreen: View {
    @Environment(AppModel.self) private var app
    let booking: BookingModel

    @State private var zoom: CGFloat = 1
    @GestureState private var pinch: CGFloat = 1
    @State private var cursor: String?
    @FocusState private var hallFocused: Bool
    /// The keyboard cursor is drawn only once the arrow keys are in use, not after a click.
    @State private var usingKeyboard = false

    private static let zoomRange: ClosedRange<CGFloat> = 1...5

    var body: some View {
        VStack(spacing: 0) {
            HallHeader(booking: booking)
            if let map = booking.seatMap {
                plan(HallLayout(map: map))
            } else if let error = booking.loadError {
                ContentUnavailableView {
                    Label("The hall couldn’t be loaded", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try Again") { Task { await booking.reload() } }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView("Opening the hall…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SelectionBar(booking: booking) { app.proceedToCheckout() }
        }
        .background(Theme.paper)
        .navigationTitle(booking.performance.startsAt.dayText)
        .navigationSubtitle(booking.performance.startsAt.timeText)
        .toolbar { zoomControls }
        .task { if booking.seatMap == nil { await booking.reload() } }
    }

    // MARK: Plan

    /// Seats smaller than this (in points) are too small to hit with a thumb; a narrow
    /// window shows the whole room first and zooms in where it's tapped.
    private static let thumbSizedSeat: CGFloat = 30

    private func plan(_ layout: HallLayout) -> some View {
        GeometryReader { geometry in
            let fit = min(geometry.size.width / layout.size.width, geometry.size.height / layout.size.height)
            let effectiveZoom = (zoom * pinch).clamped(to: Self.zoomRange)
            let unit = max(fit, 6) * effectiveZoom
            let isNarrow = geometry.size.width < Theme.compactWidth
            let isOverview = isNarrow && unit < Self.thumbSizedSeat
            ScrollViewReader { proxy in
                ScrollView([.horizontal, .vertical]) {
                    HallPlanView(booking: booking, layout: layout, unit: unit,
                                 cursor: cursor, showsCursor: hallFocused && usingKeyboard,
                                 toggle: { usingKeyboard = false; choose($0) })
                        .overlay {
                            if isOverview {
                                // Taps on the overview zoom in on that part of the room
                                // rather than guessing which of several tiny seats was meant.
                                // Screen readers and the keyboard still reach every seat.
                                Color.clear
                                    .contentShape(Rectangle())
                                    .onTapGesture { location in
                                        zoomIn(at: location, unit: unit, fit: max(fit, 6), layout: layout, proxy: proxy)
                                    }
                                    .accessibilityHidden(true)
                            }
                        }
                        .frame(minWidth: geometry.size.width, minHeight: geometry.size.height, alignment: .top)
                }
                .scrollIndicators(effectiveZoom > 1 ? .automatic : .hidden)
                .defaultScrollAnchor(.top)
                .overlay(alignment: .topTrailing) {
                    if isNarrow, !isOverview {
                        Button("Whole hall", systemImage: "arrow.down.right.and.arrow.up.left") {
                            withAnimation(.smooth) { zoom = 1 }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .padding(12)
                    }
                }
                .overlay(alignment: .bottom) {
                    if isOverview {
                        Text("Tap part of the hall to zoom in")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .padding(.bottom, 12)
                            .accessibilityHidden(true)
                    }
                }
                .gesture(MagnifyGesture()
                    .updating($pinch) { value, state, _ in state = value.magnification }
                    .onEnded { value in zoom = (zoom * value.magnification).clamped(to: Self.zoomRange) })
                .focusable()
                .focused($hallFocused)
                .focusEffectDisabled()
                .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow]) { press in
                    usingKeyboard = true
                    move(press.key, in: layout, proxy: proxy)
                    return .handled
                }
                .onKeyPress(keys: [.space, .return]) { _ in
                    usingKeyboard = true
                    if let cursor { choose(cursor) }
                    return .handled
                }
                .onChange(of: hallFocused) { _, focused in
                    if focused, cursor == nil { cursor = layout.centreSeat }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Seating plan, \(booking.availableCount) of \(layout.seats.count) seats free")
                .accessibilityHint("Arrow keys move between seats; Space chooses.")
            }
        }
    }

    private func zoomIn(at location: CGPoint, unit: CGFloat, fit: CGFloat, layout: HallLayout,
                        proxy: ScrollViewProxy) {
        let point = CGPoint(x: location.x / unit, y: location.y / unit)
        let nearest = layout.seats.min { a, b in
            hypot(a.center.x - point.x, a.center.y - point.y) < hypot(b.center.x - point.x, b.center.y - point.y)
        }
        let target = ((Self.thumbSizedSeat + 6) / fit).clamped(to: Self.zoomRange)
        withAnimation(.smooth(duration: 0.35)) { zoom = target }
        if let nearest {
            Task { @MainActor in
                // Let the zoomed plan lay out before centring on where they tapped.
                try? await Task.sleep(for: .milliseconds(30))
                withAnimation(.smooth(duration: 0.3)) { proxy.scrollTo(nearest.id, anchor: .center) }
            }
        }
    }

    private func choose(_ seatId: String) {
        cursor = seatId
        booking.toggle(seatId)
        if let info = booking.seatIndex[seatId] {
            let verb = booking.isChosen(seatId) ? "Chosen" : "Removed"
            AccessibilityNotification.Announcement("\(verb) \(info.accessibleName). \(booking.summary)").post()
        }
    }

    private func move(_ key: KeyEquivalent, in layout: HallLayout, proxy: ScrollViewProxy) {
        guard let current = cursor ?? layout.centreSeat else { return }
        let direction: HallLayout.Direction = switch key {
        case .leftArrow: .left
        case .rightArrow: .right
        case .upArrow: .up
        default: .down
        }
        guard let next = layout.neighbour(of: current, direction) else { return }
        cursor = next
        proxy.scrollTo(next)
        if let info = booking.seatIndex[next] {
            let state = booking.isChosen(next) ? "chosen" : booking.status(of: next) == .available ? Money.format(info.priceCents) : "sold"
            AccessibilityNotification.Announcement("\(info.accessibleName), \(state)").post()
        }
    }

    // MARK: Zoom

    @ToolbarContentBuilder
    private var zoomControls: some ToolbarContent {
        ToolbarItemGroup {
            ControlGroup {
                Button("Zoom Out", systemImage: "minus.magnifyingglass") {
                    withAnimation(.smooth) { zoom = (zoom / 1.5).clamped(to: Self.zoomRange) }
                }
                .keyboardShortcut("-", modifiers: .command)
                .disabled(zoom <= Self.zoomRange.lowerBound)
                Button("Zoom In", systemImage: "plus.magnifyingglass") {
                    withAnimation(.smooth) { zoom = (zoom * 1.5).clamped(to: Self.zoomRange) }
                }
                .keyboardShortcut("=", modifiers: .command)
                .disabled(zoom >= Self.zoomRange.upperBound)
            }
            .help("Zoom the seating plan")
        }
    }
}

extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self { min(max(self, range.lowerBound), range.upperBound) }
}

/// The performance, how full the house is, and what the marks mean.
private struct HallHeader: View {
    let booking: BookingModel

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.gutter) {
                title
                Spacer(minLength: 12)
                SeatLegend()
            }
            VStack(alignment: .leading, spacing: 10) {
                title
                SeatLegend()
            }
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var title: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(booking.performance.startsAt.dayText), \(booking.performance.startsAt.timeText)")
                .font(Theme.display(22, weight: .medium))
            if booking.seatMap != nil {
                Text("\(booking.availableCount) of \(booking.performance.seats) seats free")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText(value: Double(booking.availableCount)))
                    .animation(.default, value: booking.availableCount)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

struct SeatLegend: View {
    var body: some View {
        HStack(spacing: 16) {
            item(.free, "Free")
            item(.yours, "Yours")
            item(.gone, "Sold")
        }
        .font(.callout)
        .foregroundStyle(.secondary)
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Key: open ring, free; solid with a tick, yours; small dot, sold.")
    }

    private func item(_ state: SeatState, _ title: String) -> some View {
        HStack(spacing: 6) {
            LegendMark(state: state).frame(width: 16, height: 16)
            Text(title)
        }
    }
}

/// The legend's copy of a seat mark, drawn the same way as the hall's.
private struct LegendMark: View {
    let state: SeatState

    var body: some View {
        switch state {
        case .free:
            Circle().fill(Theme.card)
                .overlay(Circle().strokeBorder(Theme.ink.opacity(0.62), lineWidth: 1.5))
                .padding(2)
        case .yours:
            Circle().fill(Theme.accent)
                .overlay(Image(systemName: "checkmark").font(.system(size: 7, weight: .heavy)).foregroundStyle(Theme.onAccent))
        case .gone:
            Circle().fill(Theme.ink.opacity(0.22)).frame(width: 5, height: 5)
        }
    }
}
