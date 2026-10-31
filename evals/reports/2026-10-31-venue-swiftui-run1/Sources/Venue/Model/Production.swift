import Foundation

/// The production and its run of performances, as `GET /api/production` returns them.
struct Production: Decodable, Sendable {
    let title: String
    let hall: String
    let runningTime: String
    let performances: [Performance]
}

struct Performance: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let startsAt: HallTime
    let doorsAt: HallTime
    let priceFromCents: Int
    let seatsLeft: Int
    let seats: Int

    /// Share of the house already sold, 0...1.
    var fullness: Double {
        guard seats > 0 else { return 1 }
        return 1 - Double(seatsLeft) / Double(seats)
    }

    var isSoldOut: Bool { seatsLeft == 0 }

    /// Fewer than one seat in six left.
    var isNearlySoldOut: Bool { !isSoldOut && Double(seatsLeft) / Double(max(seats, 1)) < 0.16 }
}

/// A wall-clock time in the hall, printed exactly as it would be on a ticket.
///
/// The service sends local times without a zone (`2026-11-13T19:30`). They are parsed and
/// formatted against a fixed calendar so that the device's time zone can never shift them.
struct HallTime: Decodable, Hashable, Comparable, Sendable {
    let date: Date

    init(date: Date) { self.date = date }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard let date = HallTime.parse(raw) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                                    debugDescription: "Unreadable hall time \(raw)"))
        }
        self.date = date
    }

    static func parse(_ raw: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .hall
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return formatter.date(from: raw)
    }

    static func < (lhs: HallTime, rhs: HallTime) -> Bool { lhs.date < rhs.date }

    /// `Fri 13 Nov`
    var dayText: String { Self.format(date, "EEE d MMM") }

    /// `Friday 13 November`, for screen readers.
    var spokenDayText: String { Self.format(date, "EEEE d MMMM") }

    /// `7:30pm`
    var timeText: String {
        Self.format(date, "h:mma")
            .replacingOccurrences(of: "AM", with: "am")
            .replacingOccurrences(of: "PM", with: "pm")
    }

    /// `Fri`
    var weekdayText: String { Self.format(date, "EEE") }

    /// `November 2026`
    var monthText: String { Self.format(date, "MMMM yyyy") }

    var isMatinee: Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .hall
        return calendar.component(.hour, from: date) < 17
    }

    private static func format(_ date: Date, _ pattern: String) -> String {
        let formatter = DateFormatter()
        // POSIX keeps the fixed forms the brief asks for ("Nov", not "Nov." or "Sept").
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .hall
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }
}

extension TimeZone {
    /// Hall times carry no zone; treat them as UTC on both sides of parsing and printing.
    static let hall = TimeZone(secondsFromGMT: 0)!
}
