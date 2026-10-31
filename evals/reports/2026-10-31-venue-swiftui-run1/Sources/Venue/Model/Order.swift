import Foundation

/// The body of `POST /api/orders`.
struct OrderRequest: Encodable, Sendable {
    let performanceId: String
    let seatIds: [String]
    let email: String
    let payment: Payment

    enum Payment: Encodable, Sendable {
        case saved(cardId: String, cvc: String)
        case new(card: NewCard, billing: BillingAddress)

        private enum CodingKeys: String, CodingKey { case savedCardId, cvc, card, billing }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case let .saved(cardId, cvc):
                try container.encode(cardId, forKey: .savedCardId)
                try container.encode(cvc, forKey: .cvc)
            case let .new(card, billing):
                try container.encode(card, forKey: .card)
                try container.encode(billing, forKey: .billing)
            }
        }
    }

    struct NewCard: Encodable, Sendable {
        let number: String
        let expMonth: Int
        let expYear: Int
        let cvc: String
        let name: String
    }
}

/// A successful order: the confirmation and one ticket per seat.
struct Order: Decodable, Hashable, Sendable {
    let code: String
    let email: String
    let totalCents: Int
    let brand: CardBrand
    let last4: String
    let performanceId: String
    let tickets: [Ticket]

    struct Ticket: Decodable, Hashable, Identifiable, Sendable {
        let seatId: String
        let section: String
        let row: String
        let number: Int
        let barcode: String

        var id: String { barcode }
    }
}

/// Every refusal from the service: a code, a sentence for the person, and sometimes more.
struct ServiceError: Decodable, Error, Sendable {
    let error: String
    let message: String
    let field: String?
    let conflicts: [String]?
}
