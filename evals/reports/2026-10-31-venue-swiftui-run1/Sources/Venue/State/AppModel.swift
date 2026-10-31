import Foundation
import Observation
import SwiftUI

/// Where the person is in the hall → checkout → tickets journey.
enum Route: Hashable {
    case checkout
    case tickets(Order)
}

/// The visit: the season on offer, the performance being looked at, the person's choice
/// and what they've typed. Owned by the app so nothing is lost moving between screens.
@MainActor
@Observable
final class AppModel {
    enum Loadable<Value> {
        case loading
        case loaded(Value)
        case failed(String)
    }

    let api: VenueAPI
    let account: AccountModel
    let checkout = CheckoutModel()

    private(set) var production: Loadable<Production> = .loading
    var selectedPerformanceID: Performance.ID? {
        didSet { performanceChanged(from: oldValue) }
    }
    var path: [Route] = []

    /// The hall for each performance looked at this visit, so wandering off to compare
    /// dates and coming back keeps the seats they'd chosen.
    private var bookings: [Performance.ID: BookingModel] = [:]

    init(api: VenueAPI = VenueAPI()) {
        self.api = api
        self.account = AccountModel(api: api, vault: SessionCookieVault(baseURL: api.baseURL))
    }

    // MARK: Season

    func loadProduction() async {
        do {
            let fresh = try await api.production()
            production = .loaded(fresh)
        } catch {
            if case .loaded = production { return }
            production = .failed(error.localizedDescription)
        }
    }

    var performances: [Performance] {
        if case let .loaded(production) = production { production.performances } else { [] }
    }

    func performance(_ id: Performance.ID?) -> Performance? {
        performances.first { $0.id == id }
    }

    // MARK: Hall

    var booking: BookingModel? {
        guard let id = selectedPerformanceID else { return nil }
        if let existing = bookings[id] { return existing }
        return nil
    }

    private func performanceChanged(from oldID: Performance.ID?) {
        guard oldID != selectedPerformanceID else { return }
        if let oldID { bookings[oldID]?.stopLive() }
        path = []
        guard let id = selectedPerformanceID, let performance = performance(id) else { return }
        let booking = bookings[id] ?? BookingModel(performance: performance, api: api)
        bookings[id] = booking
        booking.goLive()
        // Keep the list's counts as true as the hall's.
        Task { await loadProduction() }
    }

    // MARK: Account

    func signedIn() {
        if let account = account.account { checkout.adopt(account) }
    }

    func signOut() async {
        await account.signOut()
        checkout.accountWentAway()
    }

    // MARK: Paying

    func proceedToCheckout() {
        guard let booking, !booking.selection.isEmpty else { return }
        if let account = account.account { checkout.adopt(account) }
        path = [.checkout]
    }

    /// Runs the payment and moves the journey on according to the outcome.
    func pay() async -> CheckoutModel.Outcome {
        guard let booking else { return .ignored }
        booking.isHoldingSelection = true
        let outcome = await checkout.pay(booking: booking, account: account.account, api: api)
        booking.isHoldingSelection = false
        switch outcome {
        case let .paid(order):
            withAnimation(.smooth) { path = [.tickets(order)] }
            checkout.reset()
            booking.clearSelection()
            // The house is fuller now; refresh the season's counts.
            Task { await loadProduction() }
        case let .seatsTaken(ids, message):
            booking.seatsWereUnavailable(ids, message: message)
            path = []
        case .signedOut:
            account.sessionEnded()
        case .fieldProblem, .refused, .ignored:
            // Anything announced as sold while we waited, and not ours after all, goes now.
            await booking.reload()
        }
        return outcome
    }

    /// After the tickets: back to the season, ready to book again.
    func startAgain() {
        path = []
        selectedPerformanceID = nil
        Task { await loadProduction() }
    }
}
