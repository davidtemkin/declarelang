import Foundation
import Observation
import SwiftUI

/// One performance's hall: the live seat map and the person's choice within it.
@MainActor
@Observable
final class BookingModel {
    let performance: Performance

    private(set) var seatMap: SeatMap?
    private(set) var seatIndex: [String: SeatInfo] = [:]
    /// Live status of every seat. The map's shape never changes; this does.
    private(set) var statuses: [String: SeatMap.Status] = [:]
    private(set) var loadError: String?

    /// Chosen seat ids, in the order they were chosen.
    private(set) var selection: [String] = []

    /// Seats of theirs that went to someone else, with the sentence explaining it.
    /// Shown until dismissed or until they choose again.
    private(set) var lostSeatsNotice: String?

    /// Seats sold by someone else in the last moment, so the hall can show them going.
    private(set) var recentlyTaken: Set<String> = []

    /// While a payment is in flight the service announces this person's own seats as sold
    /// too; those announcements must not be mistaken for someone else taking them.
    /// (If someone else really did, the order itself comes back 409 and says which.)
    var isHoldingSelection = false

    private let api: VenueAPI
    private var liveTask: Task<Void, Never>?

    init(performance: Performance, api: VenueAPI) {
        self.performance = performance
        self.api = api
    }

    // MARK: Derived

    var chosenSeats: [SeatInfo] { selection.compactMap { seatIndex[$0] } }
    var totalPriceCents: Int { chosenSeats.reduce(0) { $0 + $1.priceCents } }
    var totalFeesCents: Int { chosenSeats.reduce(0) { $0 + $1.feeCents } }
    var totalCents: Int { totalPriceCents + totalFeesCents }
    var summary: String { selectionSummary(count: selection.count, totalCents: totalPriceCents) }

    var availableCount: Int { statuses.values.filter { $0 == .available }.count }

    func isChosen(_ seatId: String) -> Bool { selection.contains(seatId) }

    // MARK: Loading and staying live

    /// Fetches the map and keeps it true while the hall or checkout is on screen.
    func goLive() {
        guard liveTask == nil else { return }
        liveTask = Task { [weak self, api, performance] in
            for await event in api.seatEvents(for: performance.id) {
                guard let self else { return }
                switch event {
                case .connected:
                    // Whatever sold while we weren't listening is in a fresh map.
                    await self.reload()
                case let .sold(seatId):
                    self.seatWasTaken(seatId)
                }
            }
        }
    }

    func stopLive() {
        liveTask?.cancel()
        liveTask = nil
    }

    func reload() async {
        do {
            let map = try await api.seatMap(for: performance.id)
            let firstLoad = seatMap == nil
            seatMap = map
            seatIndex = map.seatIndex
            statuses = Self.statuses(in: map)
            loadError = nil
            // Anything of theirs that sold in the meantime leaves their choice.
            let gone = selection.filter { seatIndex[$0] == nil || status(of: $0) == .sold }
            if !gone.isEmpty, !isHoldingSelection { release(gone, because: nil) }
            if firstLoad { recentlyTaken = [] }
        } catch {
            if seatMap == nil { loadError = error.localizedDescription }
        }
    }

    func status(of seatId: String) -> SeatMap.Status? { statuses[seatId] }

    private static func statuses(in map: SeatMap) -> [String: SeatMap.Status] {
        var result: [String: SeatMap.Status] = [:]
        for section in map.sections {
            for row in section.rows {
                for seat in row.seats { result[seat.id] = seat.status }
            }
        }
        return result
    }

    // MARK: Choosing

    func toggle(_ seatId: String) {
        guard status(of: seatId) == .available else { return }
        if let index = selection.firstIndex(of: seatId) {
            selection.remove(at: index)
        } else {
            selection.append(seatId)
            lostSeatsNotice = nil
        }
    }

    func remove(_ seatId: String) {
        selection.removeAll { $0 == seatId }
    }

    func dismissNotice() { lostSeatsNotice = nil }

    func clearSelection() {
        selection = []
        lostSeatsNotice = nil
    }

    // MARK: Other people

    private func seatWasTaken(_ seatId: String) {
        guard statuses[seatId] == .available else { return }
        withAnimation(.easeOut(duration: 0.35)) {
            statuses[seatId] = .sold
            recentlyTaken.insert(seatId)
        }
        if selection.contains(seatId), !isHoldingSelection {
            release([seatId], because: nil)
        }
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(2.5))
            withAnimation(.easeOut(duration: 0.6)) { _ = self?.recentlyTaken.remove(seatId) }
        }
    }

    /// The service refused an order because these seats were sold first.
    func seatsWereUnavailable(_ seatIds: [String], message: String) {
        for id in seatIds where statuses[id] != nil { statuses[id] = .sold }
        release(seatIds.filter(selection.contains), because: message)
        if lostSeatsNotice == nil { lostSeatsNotice = message }
    }

    private func release(_ seatIds: [String], because message: String?) {
        guard !seatIds.isEmpty else { return }
        withAnimation(.snappy) { selection.removeAll { seatIds.contains($0) } }
        let names = seatIds.compactMap { seatIndex[$0]?.accessibleName }
        let sentence = message ?? Self.takenSentence(names)
        lostSeatsNotice = sentence
        AccessibilityNotification.Announcement(sentence).post()
    }

    static func takenSentence(_ names: [String]) -> String {
        switch names.count {
        case 0: "A seat you’d chosen was just taken by someone else."
        case 1: "\(names[0]) was just taken by someone else. It’s no longer in your choice."
        default: "\(names.dropLast().joined(separator: "; ")) and \(names.last!) were just taken by someone else. They’re no longer in your choice."
        }
    }
}
