import Foundation

enum CardBrand: String, Codable, Sendable {
    case visa
    case mastercard
    case amex
    case discover

    var displayName: String {
        switch self {
        case .visa: "Visa"
        case .mastercard: "Mastercard"
        case .amex: "American Express"
        case .discover: "Discover"
        }
    }

    /// Short form for tight spaces: `Amex`.
    var shortName: String { self == .amex ? "Amex" : displayName }

    var securityCodeLength: Int { self == .amex ? 4 : 3 }

    var validLengths: Set<Int> {
        switch self {
        case .visa: [13, 16, 19]
        case .mastercard: [16]
        case .amex: [15]
        case .discover: [16, 19]
        }
    }

    var maxLength: Int { validLengths.max() ?? 19 }

    /// Where the spaces fall, as printed on the card: 4-6-5 for Amex, fours otherwise.
    var groups: [Int] { self == .amex ? [4, 6, 5] : [4, 4, 4, 4, 3] }

    /// Recognises the brand from the leading digits of a card number.
    static func detect(_ digits: String) -> CardBrand? {
        guard let first = digits.first else { return nil }
        let prefix2 = Int(digits.prefix(2)) ?? -1
        let prefix3 = Int(digits.prefix(3)) ?? -1
        let prefix4 = Int(digits.prefix(4)) ?? -1
        let prefix6 = digits.count >= 6 ? Int(digits.prefix(6)) ?? -1 : -1

        if first == "4" { return .visa }
        if prefix2 == 34 || prefix2 == 37 { return .amex }
        if (51...55).contains(prefix2) { return .mastercard }
        if digits.count >= 4, (2221...2720).contains(prefix4) { return .mastercard }
        if prefix4 == 6011 || prefix2 == 65 { return .discover }
        if digits.count >= 3, (644...649).contains(prefix3) { return .discover }
        if (622126...622925).contains(prefix6) { return .discover }
        return nil
    }
}

/// Pure functions behind the card form: grouping as typed, and the checks that catch
/// what can be caught before anything is sent.
enum CardRules {
    static func digits(in text: String) -> String { text.filter(\.isASCIIDigit) }

    /// `4242424242424242` → `4242 4242 4242 4242`; `378282246310005` → `3782 822463 10005`.
    static func groupedNumber(_ text: String) -> String {
        let brand = CardBrand.detect(digits(in: text))
        let digits = String(digits(in: text).prefix(brand?.maxLength ?? 19))
        var result = ""
        var remaining = Substring(digits)
        for size in brand?.groups ?? [4, 4, 4, 4, 3] where !remaining.isEmpty {
            if !result.isEmpty { result += " " }
            result += remaining.prefix(size)
            remaining = remaining.dropFirst(size)
        }
        return result
    }

    static func passesLuhn(_ digits: String) -> Bool {
        guard !digits.isEmpty else { return false }
        var sum = 0
        for (offset, character) in digits.reversed().enumerated() {
            guard var value = character.wholeNumberValue else { return false }
            if offset.isMultiple(of: 2) == false {
                value *= 2
                if value > 9 { value -= 9 }
            }
            sum += value
        }
        return sum.isMultiple(of: 10)
    }

    static func numberProblem(_ text: String) -> String? {
        let digits = digits(in: text)
        if digits.isEmpty { return "Enter the card number." }
        guard let brand = CardBrand.detect(digits) else {
            return "That isn’t a card number we recognise."
        }
        if !brand.validLengths.contains(digits.count) || !passesLuhn(digits) {
            return digits.count < (brand.validLengths.min() ?? 13)
                ? "That card number is too short."
                : "That card number isn’t right — check the digits."
        }
        return nil
    }

    /// Formats expiry as typed: `4` → `4`, `04` → `04 / `, `0428` → `04 / 28`.
    /// A leading digit above 1 is taken as a single-digit month.
    static func formattedExpiry(_ text: String, previous: String) -> String {
        var digits = digits(in: text)
        // Deleting the separator should delete into the month, not bounce back.
        let isDeleting = text.count < previous.count
        if let first = digits.first, first != "0", first != "1" {
            digits = "0" + digits
        }
        digits = String(digits.prefix(4))
        if digits.count < 2 { return digits }
        if digits.count == 2 { return isDeleting ? digits : digits + " / " }
        return digits.prefix(2) + " / " + digits.dropFirst(2)
    }

    static func parseExpiry(_ text: String) -> (month: Int, year: Int)? {
        let digits = digits(in: text)
        guard digits.count == 4, let month = Int(digits.prefix(2)), let year = Int(digits.suffix(2)) else {
            return nil
        }
        return (month, 2000 + year)
    }

    static func expiryProblem(_ text: String, now: Date = .now) -> String? {
        let digits = digits(in: text)
        if digits.isEmpty { return "Enter the expiry date." }
        guard let (month, year) = parseExpiry(text) else { return "Enter the expiry as MM / YY." }
        guard (1...12).contains(month) else { return "There’s no month \(String(format: "%02d", month))." }
        let calendar = Calendar(identifier: .gregorian)
        let today = calendar.dateComponents([.year, .month], from: now)
        if (year, month) < (today.year ?? 0, today.month ?? 0) { return "This card has expired." }
        if year > (today.year ?? 0) + 20 { return "That expiry is too far ahead." }
        return nil
    }

    static func securityCodeProblem(_ text: String, brand: CardBrand?) -> String? {
        let digits = digits(in: text)
        let expected = brand?.securityCodeLength
        if digits.isEmpty { return "Enter the security code." }
        if let expected, digits.count != expected {
            return "The security code is \(expected == 4 ? "four" : "three") digits."
        }
        if expected == nil, !(3...4).contains(digits.count) {
            return "The security code is three or four digits."
        }
        return nil
    }

    static func postalCodeProblem(_ text: String, country: Country) -> String? {
        let code = text.trimmingCharacters(in: .whitespaces).uppercased()
        if code.isEmpty { return "Enter the \(country.postalCodeLabel.lowercased())." }
        let pattern: String = switch country {
        case .us: #"^\d{5}(-\d{4})?$"#
        case .ca: #"^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$"#
        case .gb: #"^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|[A-HK-Y][0-9]{1,2}|[0-9][A-HJKS-UW]|[A-HK-Y][0-9][ABEHMNPRV-Y]) ?[0-9][ABD-HJLNP-UW-Z]{2})$"#
        }
        if code.range(of: pattern, options: .regularExpression) == nil {
            return "That isn’t a \(country.adjective) \(country.postalCodeLabel.lowercased()) — it should look like \(country.postalCodeExample)."
        }
        return nil
    }

    static func emailProblem(_ text: String) -> String? {
        let email = text.trimmingCharacters(in: .whitespaces)
        if email.isEmpty { return "Enter the email address for your tickets." }
        if email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"#, options: .regularExpression) == nil {
            return "That email address doesn’t look complete."
        }
        return nil
    }
}

private extension Character {
    var isASCIIDigit: Bool { ("0"..."9").contains(self) }
}
