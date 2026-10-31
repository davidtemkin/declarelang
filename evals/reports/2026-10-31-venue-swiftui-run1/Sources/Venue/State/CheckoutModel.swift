import Foundation
import Observation
import SwiftUI

/// Every field in checkout, in the order they appear — also the order focus goes to the
/// first one that needs attention.
enum CheckoutField: Hashable, CaseIterable {
    case savedCardCode
    case email
    case cardName
    case cardNumber
    case expiry
    case securityCode
    case line1
    case line2
    case city
    case postalCode
    case country

    var label: String {
        switch self {
        case .savedCardCode: "Security code"
        case .email: "Email"
        case .cardName: "Name on card"
        case .cardNumber: "Card number"
        case .expiry: "Expiry"
        case .securityCode: "Security code"
        case .line1: "Street address"
        case .line2: "Address line 2"
        case .city: "City"
        case .postalCode: "Postal code"
        case .country: "Country"
        }
    }
}

enum PaymentMethod: Hashable {
    case saved(cardId: String)
    case newCard
}

/// What the person has typed at checkout, and what has been said about it.
///
/// Lives for the whole visit rather than with the checkout screen, so signing in, going
/// back to the hall, or a failed payment never loses a keystroke.
@MainActor
@Observable
final class CheckoutModel {
    // MARK: Fields

    var method: PaymentMethod = .newCard
    var savedCardCode = "" { didSet { edited(.savedCardCode) } }

    var email = "" { didSet { edited(.email) } }
    var cardName = "" { didSet { edited(.cardName) } }
    var cardNumber = "" {
        didSet {
            let grouped = CardRules.groupedNumber(cardNumber)
            if grouped != cardNumber { cardNumber = grouped }
            edited(.cardNumber)
        }
    }
    var expiry = "" {
        didSet {
            let formatted = CardRules.formattedExpiry(expiry, previous: oldValue)
            if formatted != expiry { expiry = formatted }
            edited(.expiry)
        }
    }
    var securityCode = "" {
        didSet {
            let limited = String(CardRules.digits(in: securityCode).prefix(cardBrand?.securityCodeLength ?? 4))
            if limited != securityCode { securityCode = limited }
            edited(.securityCode)
        }
    }
    var line1 = "" { didSet { edited(.line1) } }
    var line2 = "" { didSet { edited(.line2) } }
    var city = "" { didSet { edited(.city) } }
    var postalCode = "" { didSet { edited(.postalCode) } }
    var country: Country = .gb { didSet { edited(.postalCode) } }

    // MARK: State of the attempt

    /// Fields the person has left at least once; only these are judged while typing.
    private(set) var visited: Set<CheckoutField> = []
    /// Once they've tried to pay, every field is judged.
    private(set) var attemptedPayment = false
    /// The service's own sentence about one field, until that field is edited.
    private(set) var serviceFieldErrors: [CheckoutField: String] = [:]
    /// The service's sentence about the payment as a whole (declined, insufficient funds…).
    private(set) var paymentMessage: String?
    private(set) var isPaying = false

    // MARK: Derived

    var cardBrand: CardBrand? { CardBrand.detect(CardRules.digits(in: cardNumber)) }

    func savedCard(in account: Account?) -> SavedCard? {
        guard case let .saved(id) = method else { return nil }
        return account?.cards.first { $0.id == id }
    }

    /// The fields this payment method needs, in screen order.
    func fields(for account: Account?) -> [CheckoutField] {
        switch method {
        case .saved: [.savedCardCode]
        case .newCard:
            [.email, .cardName, .cardNumber, .expiry, .securityCode, .line1, .line2, .city, .postalCode, .country]
        }
    }

    /// What's wrong with a field right now, whether or not it's time to say so.
    func problem(with field: CheckoutField, account: Account?) -> String? {
        if let message = serviceFieldErrors[field] { return message }
        switch field {
        case .savedCardCode:
            return CardRules.securityCodeProblem(savedCardCode, brand: savedCard(in: account)?.brand)
        case .email:
            return CardRules.emailProblem(email)
        case .cardName:
            return cardName.trimmed.isEmpty ? "Enter the name as it’s printed on the card." : nil
        case .cardNumber:
            return CardRules.numberProblem(cardNumber)
        case .expiry:
            return CardRules.expiryProblem(expiry)
        case .securityCode:
            return CardRules.securityCodeProblem(securityCode, brand: cardBrand)
        case .line1:
            return line1.trimmed.isEmpty ? "Enter the street address." : nil
        case .line2, .country:
            return nil
        case .city:
            return city.trimmed.isEmpty ? "Enter the city." : nil
        case .postalCode:
            return CardRules.postalCodeProblem(postalCode, country: country)
        }
    }

    /// The error to show under a field: only once they've left it, or tried to pay.
    func visibleError(for field: CheckoutField, account: Account?) -> String? {
        guard visited.contains(field) || attemptedPayment || serviceFieldErrors[field] != nil else { return nil }
        return problem(with: field, account: account)
    }

    func firstProblem(account: Account?) -> CheckoutField? {
        fields(for: account).first { problem(with: $0, account: account) != nil }
    }

    // MARK: Events from the form

    /// Leaving a field with something in it is when it's judged. Passing through an empty
    /// one isn't a mistake yet — it's flagged only if they try to pay without it.
    func left(_ field: CheckoutField) {
        if !value(of: field).trimmed.isEmpty { visited.insert(field) }
    }

    private func value(of field: CheckoutField) -> String {
        switch field {
        case .savedCardCode: savedCardCode
        case .email: email
        case .cardName: cardName
        case .cardNumber: cardNumber
        case .expiry: expiry
        case .securityCode: securityCode
        case .line1: line1
        case .line2: line2
        case .city: city
        case .postalCode: postalCode
        case .country: country.rawValue
        }
    }

    private func edited(_ field: CheckoutField) {
        if serviceFieldErrors[field] != nil { serviceFieldErrors[field] = nil }
        if field == .cardNumber, serviceFieldErrors[.securityCode] != nil { serviceFieldErrors[.securityCode] = nil }
    }

    /// Fills what the account knows into fields the person hasn't already typed in.
    func adopt(_ account: Account) {
        if email.trimmed.isEmpty { email = account.email }
        if cardName.trimmed.isEmpty { cardName = account.name }
        if let billing = account.billing, line1.trimmed.isEmpty, city.trimmed.isEmpty, postalCode.trimmed.isEmpty {
            line1 = billing.line1
            line2 = billing.line2 ?? ""
            city = billing.city
            postalCode = billing.postalCode
            country = billing.country
        }
        // Offer their usable saved card, unless they've already started on a new one.
        let typedNewCard = !CardRules.digits(in: cardNumber).isEmpty
        if method == .newCard, !typedNewCard, let card = account.cards.first(where: { !$0.isExpired() }) {
            method = .saved(cardId: card.id)
        }
    }

    /// Signed out: saved cards no longer apply.
    func accountWentAway() {
        if case .saved = method { method = .newCard }
        savedCardCode = ""
    }

    func choose(_ method: PaymentMethod) {
        guard self.method != method else { return }
        self.method = method
        paymentMessage = nil
        attemptedPayment = false
    }

    // MARK: Paying

    enum Outcome {
        case paid(Order)
        /// Fix this field; the message is already attached to it.
        case fieldProblem(CheckoutField)
        /// Declined or similar; the message is in `paymentMessage`.
        case refused
        /// Seats went to someone else; back to the hall.
        case seatsTaken(ids: [String], message: String)
        /// The saved card needed a session the service no longer has.
        case signedOut(message: String)
        /// Nothing was sent: the busy guard, or nothing chosen.
        case ignored
    }

    /// Pays, once. A second call while the first is in flight does nothing.
    func pay(booking: BookingModel, account: Account?, api: VenueAPI) async -> Outcome {
        guard !isPaying, !booking.selection.isEmpty else { return .ignored }
        isPaying = true
        defer { isPaying = false }

        attemptedPayment = true
        paymentMessage = nil
        if let field = firstProblem(account: account) { return .fieldProblem(field) }

        guard let request = makeRequest(booking: booking, account: account) else { return .ignored }

        do {
            let order = try await api.placeOrder(request)
            return .paid(order)
        } catch let VenueAPI.Failure.refused(status, error) {
            return handleRefusal(status: status, error)
        } catch {
            paymentMessage = error.localizedDescription
            return .refused
        }
    }

    private func handleRefusal(status: Int, _ error: ServiceError) -> Outcome {
        switch (status, error.error) {
        case (409, _):
            return .seatsTaken(ids: error.conflicts ?? [], message: error.message)
        case (401, _):
            accountWentAway()
            paymentMessage = error.message
            return .signedOut(message: error.message)
        case (422, _):
            let field = fieldNamed(error.field)
            serviceFieldErrors[field] = error.message
            if field == .securityCode || field == .savedCardCode { clearSecurityCodes(keepingErrors: true) }
            return .fieldProblem(field)
        default:
            // Declined, insufficient funds, or anything else: say it, keep what they typed
            // apart from the security code.
            paymentMessage = error.message
            clearSecurityCodes(keepingErrors: false)
            return .refused
        }
    }

    private func clearSecurityCodes(keepingErrors: Bool) {
        let kept = serviceFieldErrors
        savedCardCode = ""
        securityCode = ""
        if keepingErrors { serviceFieldErrors = kept }
        // A cleared code is not a mistake; don't greet them with "Enter the security code."
        visited.remove(.savedCardCode)
        visited.remove(.securityCode)
        if !keepingErrors { attemptedPayment = false }
    }

    private func fieldNamed(_ name: String?) -> CheckoutField {
        switch name {
        case "cvc": if case .saved = method { .savedCardCode } else { .securityCode }
        case "postalCode": .postalCode
        case "number": .cardNumber
        case "expiry": .expiry
        case "email": .email
        default: if case .saved = method { .savedCardCode } else { .cardNumber }
        }
    }

    private func makeRequest(booking: BookingModel, account: Account?) -> OrderRequest? {
        switch method {
        case let .saved(cardId):
            return OrderRequest(performanceId: booking.performance.id, seatIds: booking.selection,
                                email: account?.email ?? email.trimmed,
                                payment: .saved(cardId: cardId, cvc: savedCardCode))
        case .newCard:
            guard let (month, year) = CardRules.parseExpiry(expiry) else { return nil }
            let card = OrderRequest.NewCard(number: CardRules.digits(in: cardNumber), expMonth: month,
                                            expYear: year, cvc: securityCode, name: cardName.trimmed)
            let billing = BillingAddress(line1: line1.trimmed, line2: line2.trimmed.isEmpty ? nil : line2.trimmed,
                                         city: city.trimmed,
                                         postalCode: postalCode.trimmed.uppercased(), country: country)
            return OrderRequest(performanceId: booking.performance.id, seatIds: booking.selection,
                                email: email.trimmed, payment: .new(card: card, billing: billing))
        }
    }

    /// After a successful order: forget the card, keep nothing sensitive.
    func reset() {
        method = .newCard
        savedCardCode = ""
        cardNumber = ""
        expiry = ""
        securityCode = ""
        visited = []
        attemptedPayment = false
        serviceFieldErrors = [:]
        paymentMessage = nil
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
