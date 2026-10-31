import Foundation

/// Amounts are integer cents everywhere; this is the one place they become text.
enum Money {
    /// `24000` → `$240.00`; `123456` → `$1,234.56`.
    static func format(_ cents: Int) -> String {
        let sign = cents < 0 ? "-" : ""
        let magnitude = abs(cents)
        let dollars = magnitude / 100
        let remainder = magnitude % 100
        return "\(sign)$\(grouped(dollars)).\(remainder < 10 ? "0" : "")\(remainder)"
    }

    /// `$35`, for the "from" price where cents would be noise. Falls back to full form.
    static func formatWhole(_ cents: Int) -> String {
        cents % 100 == 0 ? "$\(grouped(cents / 100))" : format(cents)
    }

    private static func grouped(_ value: Int) -> String {
        let digits = String(value)
        var result = ""
        for (index, character) in digits.enumerated() {
            if index > 0, (digits.count - index).isMultiple(of: 3) { result += "," }
            result.append(character)
        }
        return result
    }
}

/// `3 seats · $240.00` — the running summary in the hall, word for word.
func selectionSummary(count: Int, totalCents: Int) -> String {
    "\(count) \(count == 1 ? "seat" : "seats") · \(Money.format(totalCents))"
}
