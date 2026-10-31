import Foundation

/// The seat map for one performance, as `GET /api/performances/:id/seats` returns it.
struct SeatMap: Decodable, Sendable {
    let performanceId: String
    var sections: [Section]

    struct Section: Decodable, Identifiable, Hashable, Sendable {
        let key: String
        let name: String
        let priceCents: Int
        let feeCents: Int
        var rows: [Row]

        var id: String { key }
    }

    struct Row: Decodable, Identifiable, Hashable, Sendable {
        let name: String
        var seats: [Seat]

        var id: String { name }
    }

    struct Seat: Decodable, Identifiable, Hashable, Sendable {
        let id: String
        let number: Int
        var status: Status
    }

    enum Status: String, Decodable, Sendable {
        case available
        case sold
    }
}

/// Everything known about one seat, flattened out of the map for display and checkout.
struct SeatInfo: Identifiable, Hashable, Sendable {
    let id: String
    let sectionKey: String
    let sectionName: String
    let row: String
    let number: Int
    let priceCents: Int
    let feeCents: Int

    /// `Orchestra, row C, seat 14` — the seat's accessible name.
    var accessibleName: String { "\(sectionName), row \(row), seat \(number)" }

    /// `Row C · Seat 14`
    var shortName: String { "Row \(row) · Seat \(number)" }
}

extension SeatMap {
    /// Every seat by id, with its section's prices.
    var seatIndex: [String: SeatInfo] {
        var index: [String: SeatInfo] = [:]
        for section in sections {
            for row in section.rows {
                for seat in row.seats {
                    index[seat.id] = SeatInfo(id: seat.id, sectionKey: section.key, sectionName: section.name,
                                              row: row.name, number: seat.number,
                                              priceCents: section.priceCents, feeCents: section.feeCents)
                }
            }
        }
        return index
    }

    var totalCount: Int {
        sections.reduce(0) { total, section in total + section.rows.reduce(0) { $0 + $1.seats.count } }
    }

}
