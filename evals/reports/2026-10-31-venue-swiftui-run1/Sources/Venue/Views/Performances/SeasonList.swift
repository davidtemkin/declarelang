import SwiftUI

/// The twenty performances: when, from how much, and how full — nearly-sold-out ones
/// apparent before anyone picks.
struct SeasonList: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        Group {
            switch app.production {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(message):
                ContentUnavailableView {
                    Label("Performances unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try Again") { Task { await app.loadProduction() } }
                }
            case let .loaded(production):
                List(selection: $app.selectedPerformanceID) {
                    ForEach(months(production.performances), id: \.title) { month in
                        Section {
                            ForEach(month.performances) { performance in
                                PerformanceRow(performance: performance)
                                    .tag(performance.id)
                                    .selectionDisabled(performance.isSoldOut)
                            }
                        } header: {
                            Text(month.title).eyebrowStyle()
                        }
                    }
                }
                .listStyle(.sidebar)
                .accessibilityLabel("Performances")
            }
        }
        .navigationTitle("Performances")
    }

    private func months(_ performances: [Performance]) -> [(title: String, performances: [Performance])] {
        var result: [(title: String, performances: [Performance])] = []
        for performance in performances {
            let title = performance.startsAt.monthText
            if result.last?.title == title {
                result[result.count - 1].performances.append(performance)
            } else {
                result.append((title, [performance]))
            }
        }
        return result
    }
}

struct PerformanceRow: View {
    let performance: Performance

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(performance.startsAt.dayText)
                        .font(.body.weight(.semibold))
                    Text(performance.startsAt.timeText)
                        .font(.body.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                availability
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                Text("from \(Money.formatWhole(performance.priceFromCents))")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
                FullnessGauge(fullness: performance.fullness)
                    .frame(width: 64, height: 5)
            }
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenSummary)
    }

    @ViewBuilder
    private var availability: some View {
        if performance.isSoldOut {
            Text("Sold out").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        } else if performance.isNearlySoldOut {
            Label("\(performance.seatsLeft) left", systemImage: "flame.fill")
                .labelStyle(.titleAndIcon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
        } else {
            Text("\(performance.seatsLeft) seats left")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
    }

    private var spokenSummary: String {
        let when = "\(performance.startsAt.spokenDayText), \(performance.startsAt.timeText)"
        let price = "from \(Money.format(performance.priceFromCents))"
        let seats = performance.isSoldOut ? "sold out"
            : performance.isNearlySoldOut ? "nearly sold out, \(performance.seatsLeft) seats left"
            : "\(performance.seatsLeft) of \(performance.seats) seats left"
        return "\(when), \(price), \(seats)"
    }
}

/// How full the house is: a filled bar, darker the fuller.
struct FullnessGauge: View {
    let fullness: Double

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.rule)
                Capsule()
                    .fill(Theme.ink.opacity(0.35 + 0.55 * fullness))
                    .frame(width: max(3, geometry.size.width * fullness))
            }
        }
        .accessibilityHidden(true)
    }
}
