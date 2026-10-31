import SwiftUI

/// The seats being bought, each with its price and booking fee, and the total — amounts
/// in one right-aligned column, to the cent, always adding up.
struct OrderSummary: View {
    let booking: BookingModel
    var showsTotal = true

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("The Marriage of Figaro")
                    .font(Theme.display(20, weight: .medium))
                Text("\(booking.performance.startsAt.dayText) · \(booking.performance.startsAt.timeText) · Grand Hall")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)

            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 12) {
                ForEach(booking.chosenSeats) { seat in
                    GridRow(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(seat.sectionName).font(.body.weight(.medium))
                            Text(seat.shortName).font(.callout).foregroundStyle(.secondary)
                        }
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(Money.format(seat.priceCents))
                            Text("+ \(Money.format(seat.feeCents)) fee")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                        .monospacedDigit()
                        .gridColumnAlignment(.trailing)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(seat.accessibleName), \(Money.format(seat.priceCents)) plus \(Money.format(seat.feeCents)) booking fee")
                }

                if showsTotal {
                    GridRow { Divider().gridCellColumns(2) }
                    totalRow("Seats", booking.totalPriceCents)
                    totalRow("Booking fees", booking.totalFeesCents)
                    GridRow(alignment: .firstTextBaseline) {
                        Text("Total").font(.headline)
                        Text(Money.format(booking.totalCents))
                            .font(Theme.display(26, weight: .semibold).monospacedDigit())
                            .contentTransition(.numericText(value: Double(booking.totalCents)))
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .animation(.snappy, value: booking.selection)
        }
    }

    private func totalRow(_ title: String, _ cents: Int) -> some View {
        GridRow(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(.secondary)
            Text(Money.format(cents))
                .monospacedDigit()
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .font(.callout)
        .accessibilityElement(children: .combine)
    }
}
