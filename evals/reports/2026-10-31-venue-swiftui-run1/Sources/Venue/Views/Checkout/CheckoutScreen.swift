import SwiftUI

/// Paying. Quiet and orderly: the fields on one side, the seats and the total on the other
/// (or, in a narrow window, the total and the pay button pinned to the bottom).
struct CheckoutScreen: View {
    @Environment(AppModel.self) private var app
    let booking: BookingModel
    let signIn: () -> Void

    @FocusState private var focus: CheckoutField?
    @State private var lastFocus: CheckoutField?

    var body: some View {
        GeometryReader { geometry in
            if geometry.size.width >= 820 {
                wideLayout
            } else {
                compactLayout
            }
        }
        .background(Theme.paper)
        .navigationTitle("Checkout")
        .navigationSubtitle("\(booking.performance.startsAt.dayText), \(booking.performance.startsAt.timeText)")
        .navigationBarBackButtonHidden(app.checkout.isPaying)
        .onChange(of: focus) { old, new in
            if let old { app.checkout.left(old) }
            lastFocus = new ?? lastFocus
        }
        .onChange(of: booking.selection.isEmpty) { _, empty in
            // Every seat they'd chosen has gone to someone else: back to the hall.
            if empty, app.path.last == .checkout { app.path = [] }
        }
        .onChange(of: app.account.account) { _, account in
            if let account { app.checkout.adopt(account) } else { app.checkout.accountWentAway() }
        }
    }

    // MARK: Layouts

    private var wideLayout: some View {
        HStack(alignment: .top, spacing: 0) {
            ScrollView {
                form
                    .frame(maxWidth: 520, alignment: .leading)
                    .padding(.horizontal, 40)
                    .padding(.vertical, 32)
                    .frame(maxWidth: .infinity)
            }
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    OrderSummary(booking: booking)
                    payArea
                }
                .padding(32)
            }
            .frame(width: 360)
            .background(Theme.card.opacity(0.6))
        }
    }

    private var compactLayout: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    DisclosureGroup {
                        OrderSummary(booking: booking, showsTotal: false)
                            .padding(.top, 12)
                    } label: {
                        Text(booking.summary)
                            .font(.headline.monospacedDigit())
                    }
                    form
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
            // Keep the field being typed in clear of the pinned pay bar.
            .onChange(of: focus) { _, field in
                if let field { withAnimation(.smooth) { proxy.scrollTo(field, anchor: .center) } }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Total").font(.headline)
                        Spacer()
                        Text(Money.format(booking.totalCents))
                            .font(Theme.display(22, weight: .semibold).monospacedDigit())
                    }
                    .accessibilityElement(children: .combine)
                    payArea
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(.bar)
                .overlay(alignment: .top) { Divider() }
            }
        }
    }

    // MARK: Form

    private var form: some View {
        CheckoutForm(model: app.checkout, account: app.account.account, focus: $focus,
                     signIn: signIn, pay: pay)
    }

    private var payArea: some View {
        PayButtonArea(model: app.checkout, totalCents: booking.totalCents, pay: pay)
    }

    // MARK: Paying

    private func pay() {
        // Synchronous guard before any suspension: a second press can't start a second payment.
        guard !app.checkout.isPaying else { return }
        Task {
            let outcome = await app.pay()
            respond(to: outcome)
        }
    }

    private func respond(to outcome: CheckoutModel.Outcome) {
        let checkout = app.checkout
        let account = app.account.account
        switch outcome {
        case let .fieldProblem(field):
            focus = field
            let count = checkout.fields(for: account).filter { checkout.problem(with: $0, account: account) != nil }.count
            let message = checkout.problem(with: field, account: account) ?? ""
            let prefix = count > 1 ? "\(count) things need attention. " : ""
            AccessibilityNotification.Announcement("\(prefix)\(field.label): \(message)").post()
        case .refused:
            if let message = checkout.paymentMessage {
                AccessibilityNotification.Announcement(message).post()
            }
            focus = checkout.method == .newCard ? .securityCode : .savedCardCode
        case let .signedOut(message):
            AccessibilityNotification.Announcement(message).post()
            focus = .cardNumber
        case let .seatsTaken(_, message):
            AccessibilityNotification.Announcement(message).post()
        case .paid, .ignored:
            break
        }
    }
}

/// The pay button, and what the bank said last time.
private struct PayButtonArea: View {
    let model: CheckoutModel
    let totalCents: Int
    let pay: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let message = model.paymentMessage {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "creditcard.trianglebadge.exclamationmark")
                        .accessibilityHidden(true)
                    Text(message).fixedSize(horizontal: false, vertical: true)
                }
                .font(.callout.weight(.medium))
                .foregroundStyle(Theme.error)
                .accessibilityElement(children: .combine)
                .transition(.opacity.combined(with: .offset(y: 6)))
            }
            Button(action: pay) {
                HStack(spacing: 10) {
                    if model.isPaying {
                        ProgressView().controlSize(.small).tint(Theme.onAccent)
                    }
                    Text("Pay \(Money.format(totalCents))")
                        .monospacedDigit()
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.extraLarge)
            .tint(Theme.accent)
            // While a payment is under way the button stays put but does nothing.
            .allowsHitTesting(!model.isPaying)
            .opacity(model.isPaying ? 0.75 : 1)
            .accessibilityValue(model.isPaying ? "Payment under way" : "")
            .keyboardShortcut(.return, modifiers: .command)

            Label("Your card goes only to the Grand Hall box office.", systemImage: "lock.fill")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .animation(.snappy, value: model.paymentMessage)
    }
}
