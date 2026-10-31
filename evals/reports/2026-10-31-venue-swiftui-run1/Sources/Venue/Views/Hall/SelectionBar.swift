import SwiftUI

/// The running summary — `3 seats · $240.00` — and the way on to paying. Always on screen
/// while anything is chosen; also where the hall says a chosen seat was lost.
struct SelectionBar: View {
    let booking: BookingModel
    let proceed: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            if let notice = booking.lostSeatsNotice {
                LostSeatNotice(message: notice) { withAnimation(.snappy) { booking.dismissNotice() } }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if !booking.selection.isEmpty {
                bar.transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.3), value: booking.selection.isEmpty)
        .animation(.snappy(duration: 0.3), value: booking.lostSeatsNotice)
    }

    private var bar: some View {
        VStack(spacing: 0) {
            Divider()
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: Theme.gutter) {
                    summary
                    chosenSeats
                    Spacer(minLength: 0)
                    continueButton
                }
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .firstTextBaseline) {
                        summary
                        Spacer(minLength: 12)
                        continueButton
                    }
                    chosenSeats
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.vertical, 14)
        }
        .background(.bar)
    }

    private var summary: some View {
        Text(booking.summary)
            .font(Theme.display(24, weight: .semibold).monospacedDigit())
            .contentTransition(.numericText(value: Double(booking.totalPriceCents)))
            .animation(.snappy, value: booking.totalPriceCents)
            .fixedSize()
            .accessibilityLabel(booking.summary)
            .accessibilityAddTraits(.updatesFrequently)
    }

    private var chosenSeats: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(booking.chosenSeats) { seat in
                    ChosenSeatChip(seat: seat) {
                        withAnimation(.snappy) { booking.remove(seat.id) }
                        AccessibilityNotification.Announcement("Removed \(seat.accessibleName). \(booking.summary)").post()
                    }
                    .transition(.scale(scale: 0.7).combined(with: .opacity))
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.never)
        .accessibilityLabel("Your seats")
    }

    private var continueButton: some View {
        Button(action: proceed) {
            Text("Continue")
                .font(.headline)
                .padding(.horizontal, 18)
                .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .tint(Theme.accent)
        .controlSize(.large)
        .keyboardShortcut(.return, modifiers: .command)
        .help("Continue to checkout (⌘Return)")
    }
}

private struct ChosenSeatChip: View {
    let seat: SeatInfo
    let remove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 0) {
                Text(seat.sectionName).font(.caption2).foregroundStyle(.secondary)
                Text("\(seat.row)\(seat.number)").font(.callout.weight(.semibold).monospacedDigit())
            }
            Button(action: remove) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .frame(width: 18, height: 18)
                    .contentShape(Circle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Remove \(seat.accessibleName)")
        }
        .padding(.leading, 10)
        .padding(.trailing, 4)
        .padding(.vertical, 4)
        .background(Theme.accent.opacity(0.10), in: Capsule())
        .accessibilityElement(children: .contain)
    }
}

/// A seat they'd chosen went to someone else.
struct LostSeatNotice: View {
    let message: String
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "person.fill.xmark")
                .foregroundStyle(Theme.error)
                .accessibilityHidden(true)
            Text(message)
                .font(.callout)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Dismiss", action: dismiss)
                .buttonStyle(.borderless)
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.vertical, 10)
        .background(Theme.card)
        .overlay(alignment: .top) { Divider() }
        .accessibilityElement(children: .contain)
    }
}
