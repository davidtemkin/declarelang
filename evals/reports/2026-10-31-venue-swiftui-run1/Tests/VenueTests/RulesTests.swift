import Foundation
import Testing
@testable import Venue

@Suite("Money")
struct MoneyTests {
    @Test func formatsCents() {
        #expect(Money.format(24000) == "$240.00")
        #expect(Money.format(26100) == "$261.00")
        #expect(Money.format(705) == "$7.05")
        #expect(Money.format(123456) == "$1,234.56")
        #expect(Money.format(0) == "$0.00")
    }

    @Test func summaryReadsExactly() {
        #expect(selectionSummary(count: 3, totalCents: 24000) == "3 seats · $240.00")
        #expect(selectionSummary(count: 1, totalCents: 8000) == "1 seat · $80.00")
    }
}

@Suite("Hall time")
struct HallTimeTests {
    @Test func printsDateAndTime() throws {
        let date = try #require(HallTime.parse("2026-11-13T19:30"))
        let time = HallTime(date: date)
        #expect(time.dayText == "Fri 13 Nov")
        #expect(time.timeText == "7:30pm")
        #expect(HallTime(date: try #require(HallTime.parse("2026-11-15T14:00"))).timeText == "2:00pm")
    }
}

@Suite("Card rules")
struct CardRulesTests {
    @Test func recognisesBrands() {
        #expect(CardBrand.detect("4242") == .visa)
        #expect(CardBrand.detect("5555") == .mastercard)
        #expect(CardBrand.detect("2221") == .mastercard)
        #expect(CardBrand.detect("3782") == .amex)
        #expect(CardBrand.detect("6011") == .discover)
        #expect(CardBrand.detect("9999") == nil)
    }

    @Test func groupsAsPrinted() {
        #expect(CardRules.groupedNumber("4242424242424242") == "4242 4242 4242 4242")
        #expect(CardRules.groupedNumber("378282246310005") == "3782 822463 10005")
        #expect(CardRules.groupedNumber("42424") == "4242 4")
        #expect(CardRules.groupedNumber("4242 4242 4242 4242 999") == "4242 4242 4242 4242 999")
    }

    @Test func catchesImpossibleNumbers() {
        #expect(CardRules.numberProblem("4242 4242 4242 4242") == nil)
        #expect(CardRules.numberProblem("3782 822463 10005") == nil)
        #expect(CardRules.numberProblem("4000 0000 0000 0002") == nil)
        #expect(CardRules.numberProblem("4242 4242 4242 4241") != nil)
        #expect(CardRules.numberProblem("4242") != nil)
        #expect(CardRules.numberProblem("") != nil)
    }

    @Test func securityCodeLengthFollowsBrand() {
        #expect(CardRules.securityCodeProblem("123", brand: .visa) == nil)
        #expect(CardRules.securityCodeProblem("1234", brand: .visa) != nil)
        #expect(CardRules.securityCodeProblem("1234", brand: .amex) == nil)
        #expect(CardRules.securityCodeProblem("123", brand: .amex) != nil)
    }

    @Test func expiry() {
        let now = Calendar(identifier: .gregorian).date(from: DateComponents(year: 2026, month: 10, day: 31))!
        #expect(CardRules.expiryProblem("04 / 28", now: now) == nil)
        #expect(CardRules.expiryProblem("10 / 26", now: now) == nil)
        #expect(CardRules.expiryProblem("09 / 26", now: now) == "This card has expired.")
        #expect(CardRules.expiryProblem("13 / 28", now: now) == "There’s no month 13.")
        #expect(CardRules.expiryProblem("00 / 28", now: now) != nil)
        #expect(CardRules.expiryProblem("4", now: now) != nil)
    }

    @Test func expiryFormatsAsTyped() {
        #expect(CardRules.formattedExpiry("0", previous: "") == "0")
        #expect(CardRules.formattedExpiry("04", previous: "0") == "04 / ")
        #expect(CardRules.formattedExpiry("04 / 2", previous: "04 / ") == "04 / 2")
        #expect(CardRules.formattedExpiry("4", previous: "") == "04 / ")
        #expect(CardRules.formattedExpiry("04 /", previous: "04 / ") == "04")
        #expect(CardRules.formattedExpiry("0428", previous: "") == "04 / 28")
    }

    @Test func postalCodes() {
        #expect(CardRules.postalCodeProblem("94103", country: .us) == nil)
        #expect(CardRules.postalCodeProblem("94103-1234", country: .us) == nil)
        #expect(CardRules.postalCodeProblem("9410", country: .us) != nil)
        #expect(CardRules.postalCodeProblem("M5V 2T6", country: .ca) == nil)
        #expect(CardRules.postalCodeProblem("m5v2t6", country: .ca) == nil)
        #expect(CardRules.postalCodeProblem("12345", country: .ca) != nil)
        #expect(CardRules.postalCodeProblem("WC1N 1AB", country: .gb) == nil)
        #expect(CardRules.postalCodeProblem("SW1A 1AA", country: .gb) == nil)
        #expect(CardRules.postalCodeProblem("WC1N", country: .gb) != nil)
    }

    @Test func savedCardExpiry() {
        let now = Calendar(identifier: .gregorian).date(from: DateComponents(year: 2026, month: 10, day: 31))!
        let visa = SavedCard(id: "card_1", brand: .visa, last4: "4242", expMonth: 4, expYear: 2028)
        let mastercard = SavedCard(id: "card_2", brand: .mastercard, last4: "4444", expMonth: 8, expYear: 2026)
        #expect(!visa.isExpired(on: now))
        #expect(mastercard.isExpired(on: now))
    }
}

@Suite("Server-sent events")
struct ServerSentEventTests {
    @Test func readsSeatChanges() {
        var parser = ServerSentEventParser()
        #expect(parser.consume(": open") == nil)
        #expect(parser.consume("event: seatchanged") == nil)
        let event = parser.consume(#"data: {"seatId":"ORCH-A-2","status":"sold"}"#)
        #expect(event?.name == "seatchanged")
        #expect(event?.data == #"{"seatId":"ORCH-A-2","status":"sold"}"#)
    }
}

@Suite("Hall layout")
struct HallLayoutTests {
    private func map() -> SeatMap {
        func row(_ prefix: String, _ name: String, _ count: Int) -> SeatMap.Row {
            SeatMap.Row(name: name, seats: (1...count).map { .init(id: "\(prefix)-\(name)-\($0)", number: $0, status: .available) })
        }
        return SeatMap(performanceId: "p01", sections: [
            .init(key: "ORCH", name: "Orchestra", priceCents: 8000, feeCents: 700,
                  rows: [row("ORCH", "A", 18), row("ORCH", "B", 20)]),
            .init(key: "BALC", name: "Balcony", priceCents: 3500, feeCents: 400,
                  rows: [row("BALC", "A", 30)]),
        ])
    }

    @Test func seatOneIsOnTheStagesLeft() throws {
        let layout = HallLayout(map: map())
        let first = try #require(layout.seats.first { $0.id == "ORCH-A-1" })
        let last = try #require(layout.seats.first { $0.id == "ORCH-A-18" })
        // Seen from the stage, left is the plan's right.
        #expect(first.center.x > last.center.x)
    }

    @Test func rowsRunFrontToBack() throws {
        let layout = HallLayout(map: map())
        let a = try #require(layout.seats.first { $0.id == "ORCH-A-9" })
        let b = try #require(layout.seats.first { $0.id == "ORCH-B-10" })
        let balcony = try #require(layout.seats.first { $0.id == "BALC-A-15" })
        #expect(a.center.y < b.center.y)
        #expect(b.center.y < balcony.center.y)
        #expect(layout.stage.maxY < a.center.y)
    }

    @Test func arrowKeysWalkThePlan() {
        let layout = HallLayout(map: map())
        #expect(layout.neighbour(of: "ORCH-A-5", .left) == "ORCH-A-6")
        #expect(layout.neighbour(of: "ORCH-A-5", .right) == "ORCH-A-4")
        #expect(layout.neighbour(of: "ORCH-A-1", .right) == nil)
        #expect(layout.neighbour(of: "ORCH-A-9", .down)?.hasPrefix("ORCH-B-") == true)
        #expect(layout.neighbour(of: "ORCH-A-9", .up) == nil)
    }

    @Test func accessibleName() {
        let info = SeatInfo(id: "ORCH-C-14", sectionKey: "ORCH", sectionName: "Orchestra", row: "C", number: 14,
                            priceCents: 8000, feeCents: 700)
        #expect(info.accessibleName == "Orchestra, row C, seat 14")
    }
}
