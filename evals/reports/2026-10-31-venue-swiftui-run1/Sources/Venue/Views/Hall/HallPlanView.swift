import SwiftUI

/// The Grand Hall drawn as a room: the stage, the four sections fanned out in front of it,
/// rows labelled at both ends, every seat where it really is.
struct HallPlanView: View {
    let booking: BookingModel
    let layout: HallLayout
    /// Points per seat unit.
    let unit: CGFloat
    let cursor: String?
    let showsCursor: Bool
    let toggle: (String) -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            floor
            stage
            sectionLabels
            rowLabels
            seats
        }
        .frame(width: layout.size.width * unit, height: layout.size.height * unit, alignment: .topLeading)
    }

    // MARK: Floor and stage

    /// Each section's footprint, tinted deeper the nearer (and dearer) it is to the stage.
    private var floor: some View {
        Canvas { context, _ in
            let centre = scaled(layout.focus)
            for (index, section) in layout.sections.enumerated() {
                let inner = section.innerRadius * unit
                let outer = section.outerRadius * unit
                // Angles measured from straight down the axis.
                let start = Angle.radians(.pi / 2 - section.halfAngle)
                let end = Angle.radians(.pi / 2 + section.halfAngle)
                var path = Path()
                path.addArc(center: centre, radius: outer, startAngle: start, endAngle: end, clockwise: false)
                path.addArc(center: centre, radius: inner, startAngle: end, endAngle: start, clockwise: true)
                path.closeSubpath()
                let depth = Double(layout.sections.count - index) / Double(max(layout.sections.count, 1))
                context.fill(path, with: .color(Theme.ink.opacity(0.025 + 0.045 * depth)))
            }
        }
        .accessibilityHidden(true)
    }

    private var stage: some View {
        let rect = layout.stage
        return ZStack {
            UnevenRoundedRectangle(bottomLeadingRadius: unit * 1.6, bottomTrailingRadius: unit * 1.6)
                .fill(Theme.ink.opacity(0.88))
            Text("Stage")
                .font(Theme.display(max(10, unit * 0.9), weight: .regular).italic())
                .foregroundStyle(Theme.paper)
        }
        .frame(width: rect.width * unit, height: rect.height * unit)
        .position(x: rect.midX * unit, y: rect.midY * unit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Stage")
    }

    // MARK: Labels

    private var sectionLabels: some View {
        ForEach(layout.sections) { section in
            HStack(spacing: unit * 0.4) {
                Text(section.name)
                    .textCase(.uppercase)
                    .tracking(unit * 0.06)
                    .fontWeight(.semibold)
                Text(Money.formatWhole(section.priceCents))
                    .fontWeight(.regular)
                    .foregroundStyle(.secondary)
            }
            .font(.system(size: max(8, unit * 0.55)).width(.expanded))
            .foregroundStyle(Theme.ink.opacity(0.8))
            .fixedSize()
            .position(scaled(section.labelCenter))
            .accessibilityHidden(true)
        }
    }

    private var rowLabels: some View {
        ForEach(layout.sections) { section in
            ForEach(section.rowLabels, id: \.name) { label in
                ForEach([label.left, label.right], id: \.x) { point in
                    Text(label.name)
                        .font(.system(size: max(7, unit * 0.48), weight: .medium).monospacedDigit())
                        .foregroundStyle(.tertiary)
                        .fixedSize()
                        .position(scaled(point))
                }
            }
            .accessibilityHidden(true)
        }
    }

    // MARK: Seats

    /// Seats grouped by section, so a screen reader can move section by section.
    private var seats: some View {
        ForEach(Array(layout.sections.enumerated()), id: \.element.id) { index, section in
            ZStack(alignment: .topLeading) {
                ForEach(layout.seats.filter { $0.rowKey.section == index }) { placed in
                    seat(placed)
                }
            }
            .frame(width: layout.size.width * unit, height: layout.size.height * unit, alignment: .topLeading)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("\(section.name), \(Money.format(section.priceCents)) a seat")
        }
    }

    @ViewBuilder
    private func seat(_ placed: HallLayout.PlacedSeat) -> some View {
        if let info = booking.seatIndex[placed.id] {
            SeatView(info: info,
                     state: state(of: placed.id),
                     unit: unit,
                     isCursor: showsCursor && cursor == placed.id,
                     justTaken: booking.recentlyTaken.contains(placed.id),
                     toggle: { toggle(placed.id) })
                .rotationEffect(.radians(placed.angle))
                .position(scaled(placed.center))
                .id(placed.id)
        }
    }

    private func state(of seatId: String) -> SeatState {
        if booking.isChosen(seatId) { return .yours }
        return booking.status(of: seatId) == .available ? .free : .gone
    }

    private func scaled(_ point: CGPoint) -> CGPoint {
        CGPoint(x: point.x * unit, y: point.y * unit)
    }
}
