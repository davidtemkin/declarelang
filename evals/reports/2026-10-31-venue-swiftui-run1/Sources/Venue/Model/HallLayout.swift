import CoreGraphics
import Foundation

/// Where every seat sits in the Grand Hall, in "seat units" (one seat's width).
///
/// The stage is at the top. Rows curve around a point behind it so that every seat faces
/// the stage, and each section sits further back than the last with a gap that marks the
/// change of level. A centre aisle splits every row.
///
/// Seats are listed left to right *as seen from the stage*; looking down on the plan with
/// the stage at the top, the stage's left is the plan's right, so seat 1 sits on the right.
struct HallLayout: Sendable {
    struct PlacedSeat: Identifiable, Sendable {
        let id: String
        let center: CGPoint
        /// Rotation so the seat faces the stage, in radians.
        let angle: Double
        let rowKey: RowKey
        let indexInRow: Int
    }

    struct RowKey: Hashable, Sendable {
        let section: Int
        let row: Int
    }

    struct PlacedSection: Identifiable, Sendable {
        let id: String
        let name: String
        let priceCents: Int
        /// Where the section's name is printed: just in front of its first row, on the axis.
        let labelCenter: CGPoint
        /// The section's footprint, for tinting the floor.
        let innerRadius: Double
        let outerRadius: Double
        let halfAngle: Double
        /// Row labels at each end of every row.
        let rowLabels: [(name: String, left: CGPoint, right: CGPoint)]
    }

    let seats: [PlacedSeat]
    let sections: [PlacedSection]
    /// The point everything faces, behind the stage.
    let focus: CGPoint
    let stage: CGRect
    let size: CGSize
    /// Seats grouped into rows, in order, for keyboard travel.
    let rows: [RowKey: [String]]
    let rowOrder: [RowKey]

    // Geometry, in seat units.
    static let seatPitch = 1.0
    static let rowPitch = 1.18
    static let aisle = 1.1
    static let sectionGap = 2.2
    static let focusBehindStage = 18.0
    static let stageDepth = 3.2
    static let stageToFirstRow = 2.6
    static let margin = 2.4

    init(map: SeatMap) {
        var placed: [PlacedSeat] = []
        var placedSections: [PlacedSection] = []
        var rows: [RowKey: [String]] = [:]
        var rowOrder: [RowKey] = []

        // Work around an origin at the focus; translate at the end.
        var radius = Self.focusBehindStage + Self.stageDepth + Self.stageToFirstRow
        var widest = 0.0

        for (s, section) in map.sections.enumerated() {
            if s > 0 { radius += Self.sectionGap }
            let inner = radius - Self.rowPitch * 0.6
            var halfAngle = 0.0
            var rowLabels: [(String, CGPoint, CGPoint)] = []
            // Leave room in front of the section for its name.
            radius += 1.5

            for (r, row) in section.rows.enumerated() {
                let key = RowKey(section: s, row: r)
                rowOrder.append(key)
                let n = row.seats.count
                let half = n / 2
                // Arc length from the axis to each seat centre, with the aisle in the middle.
                func offset(_ i: Int) -> Double {
                    let fromCentre = Double(i) - Double(n - 1) / 2
                    let aisleShift = (i < half ? -1 : 1) * Self.aisle / 2
                    return (fromCentre * Self.seatPitch + (n.isMultiple(of: 2) ? aisleShift : 0))
                }
                var ids: [String] = []
                for (i, seat) in row.seats.enumerated() {
                    // Seat 1 is stage-left, which is plan-right: negate.
                    let theta = -offset(i) / radius
                    let point = CGPoint(x: radius * sin(theta), y: radius * cos(theta))
                    placed.append(PlacedSeat(id: seat.id, center: point, angle: -theta, rowKey: key, indexInRow: i))
                    ids.append(seat.id)
                    widest = max(widest, abs(point.x))
                }
                rows[key] = ids
                let edge = (abs(offset(0)) + 1.0) / radius
                halfAngle = max(halfAngle, edge)
                rowLabels.append((row.name,
                                  CGPoint(x: -radius * sin(edge + 0.35 / radius), y: radius * cos(edge)),
                                  CGPoint(x: radius * sin(edge + 0.35 / radius), y: radius * cos(edge))))
                if r < section.rows.count - 1 { radius += Self.rowPitch }
            }
            let outer = radius + Self.rowPitch * 0.6
            placedSections.append(PlacedSection(
                id: section.key, name: section.name, priceCents: section.priceCents,
                labelCenter: .zero, innerRadius: inner, outerRadius: outer, halfAngle: halfAngle,
                rowLabels: rowLabels.map { (name: $0.0, left: $0.1, right: $0.2) }))
        }

        // Fit everything into a box with the stage at the top.
        let halfWidth = widest + Self.margin + 1.2
        let stageTop = Self.focusBehindStage
        let originX = halfWidth
        let originY = -stageTop + Self.margin
        func shift(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x + originX, y: p.y + originY) }

        self.seats = placed.map {
            PlacedSeat(id: $0.id, center: shift($0.center), angle: $0.angle, rowKey: $0.rowKey, indexInRow: $0.indexInRow)
        }
        self.sections = placedSections.map { section in
            PlacedSection(id: section.id, name: section.name, priceCents: section.priceCents,
                          labelCenter: shift(CGPoint(x: 0, y: section.innerRadius + 1.0)),
                          innerRadius: section.innerRadius, outerRadius: section.outerRadius,
                          halfAngle: section.halfAngle,
                          rowLabels: section.rowLabels.map { (name: $0.name, left: shift($0.left), right: shift($0.right)) })
        }
        self.focus = shift(.zero)
        let stageWidth = min(halfWidth * 1.1, 22)
        self.stage = CGRect(x: originX - stageWidth / 2, y: originY + stageTop,
                            width: stageWidth, height: Self.stageDepth)
        let deepest = (placed.map(\.center.y).max() ?? 0) + originY
        self.size = CGSize(width: halfWidth * 2, height: deepest + Self.margin)
        self.rows = rows
        self.rowOrder = rowOrder
    }

    // MARK: Keyboard travel

    enum Direction { case left, right, up, down }

    private var seatsByID: [String: PlacedSeat] {
        Dictionary(uniqueKeysWithValues: seats.map { ($0.id, $0) })
    }

    /// The seat one step away on the plan, or nil at an edge.
    func neighbour(of seatId: String, _ direction: Direction) -> String? {
        let byID = seatsByID
        guard let seat = byID[seatId], let row = rows[seat.rowKey] else { return nil }
        switch direction {
        case .left, .right:
            // Seat order runs right-to-left on the plan.
            let step = direction == .left ? 1 : -1
            let index = seat.indexInRow + step
            return row.indices.contains(index) ? row[index] : nil
        case .up, .down:
            guard let rowIndex = rowOrder.firstIndex(of: seat.rowKey) else { return nil }
            let target = rowIndex + (direction == .up ? -1 : 1)
            guard rowOrder.indices.contains(target), let next = rows[rowOrder[target]] else { return nil }
            return next.min { a, b in
                abs((byID[a]?.center.x ?? 0) - seat.center.x) < abs((byID[b]?.center.x ?? 0) - seat.center.x)
            }
        }
    }

    /// The seat nearest the middle of the house, a good place for the keyboard to start.
    var centreSeat: String? {
        guard let key = rowOrder.dropFirst(rowOrder.count / 4).first, let row = rows[key] else { return seats.first?.id }
        return row[row.count / 2]
    }
}
