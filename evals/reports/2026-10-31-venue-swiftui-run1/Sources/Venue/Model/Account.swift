import Foundation

/// The signed-in person, as `GET /api/me` returns them.
struct Account: Decodable, Equatable, Sendable {
    let name: String
    let email: String
    let billing: BillingAddress?
    let cards: [SavedCard]
}

struct BillingAddress: Codable, Equatable, Sendable {
    var line1: String
    var line2: String?
    var city: String
    var postalCode: String
    var country: Country
}

struct SavedCard: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let brand: CardBrand
    let last4: String
    let expMonth: Int
    let expYear: Int

    /// A card is good through the last day of its expiry month.
    func isExpired(on date: Date = .now) -> Bool {
        let calendar = Calendar(identifier: .gregorian)
        let now = calendar.dateComponents([.year, .month], from: date)
        guard let year = now.year, let month = now.month else { return false }
        return (expYear, expMonth) < (year, month)
    }

    /// `04/28`
    var expiryText: String { String(format: "%02d/%02d", expMonth, expYear % 100) }

    /// `Visa ending 4242, expires April 2028`
    var spokenDescription: String {
        let monthName = DateFormatter().monthSymbols[max(0, min(11, expMonth - 1))]
        return "\(brand.displayName) ending \(last4), \(isExpired() ? "expired" : "expires") \(monthName) \(expYear)"
    }
}

enum Country: String, Codable, CaseIterable, Identifiable, Sendable {
    case us = "US"
    case ca = "CA"
    case gb = "GB"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .us: "United States"
        case .ca: "Canada"
        case .gb: "United Kingdom"
        }
    }

    var adjective: String {
        switch self {
        case .us: "US"
        case .ca: "Canadian"
        case .gb: "UK"
        }
    }

    var postalCodeLabel: String {
        switch self {
        case .us: "ZIP code"
        case .ca: "Postal code"
        case .gb: "Postcode"
        }
    }

    var postalCodeExample: String {
        switch self {
        case .us: "94103"
        case .ca: "K1A 0B1"
        case .gb: "WC1N 1AB"
        }
    }
}
