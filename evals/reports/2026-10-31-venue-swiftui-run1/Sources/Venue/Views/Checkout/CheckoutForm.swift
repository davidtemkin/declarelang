import SwiftUI

/// The checkout fields. Nothing is marked wrong while it's being typed for the first time;
/// a field is judged once the person leaves it, or tries to pay.
struct CheckoutForm: View {
    @Bindable var model: CheckoutModel
    let account: Account?
    var focus: FocusState<CheckoutField?>.Binding
    let signIn: () -> Void
    let pay: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 36) {
            if account == nil {
                signInPrompt
            }
            if let account, !account.cards.isEmpty {
                paymentChoice(account)
            }
            switch model.method {
            case .saved:
                savedCardFields
            case .newCard:
                newCardFields
            }
        }
        .textFieldStyle(.roundedBorder)
        .controlSize(.large)
        .animation(.smooth(duration: 0.25), value: model.method)
    }

    // MARK: Sign in

    private var signInPrompt: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("Have an account?").foregroundStyle(.secondary)
            Button("Sign in", action: signIn)
                .buttonStyle(.link)
            Text("You can also pay without one.").foregroundStyle(.secondary)
        }
        .font(.callout)
    }

    // MARK: Saved cards

    private func paymentChoice(_ account: Account) -> some View {
        FormSection("Pay with") {
            VStack(spacing: 0) {
                ForEach(account.cards) { card in
                    SavedCardRow(card: card, isSelected: model.method == .saved(cardId: card.id)) {
                        model.choose(.saved(cardId: card.id))
                        focus.wrappedValue = .savedCardCode
                    }
                    Divider()
                }
                NewCardRow(isSelected: model.method == .newCard) {
                    model.choose(.newCard)
                    focus.wrappedValue = .cardNumber
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Payment card")
        }
    }

    @ViewBuilder
    private var savedCardFields: some View {
        if let card = model.savedCard(in: account) {
            FormSection("Confirm card") {
                field(.savedCardCode, note: "\(card.brand.securityCodeLength) digits on the \(card.brand == .amex ? "front" : "back")") {
                    TextField(CheckoutField.savedCardCode.label, text: $model.savedCardCode,
                              prompt: Text(card.brand == .amex ? "4 digits" : "3 digits"))
                        .textContentType(.creditCardSecurityCode)
                        .frame(maxWidth: 140)
                        .onSubmit(pay)
                }
                if let email = account?.email {
                    Text("Tickets will be sent to \(email).")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: New card

    private var newCardFields: some View {
        VStack(alignment: .leading, spacing: 36) {
            FormSection("Your tickets", caption: "Tickets are sent by email — there’s nothing to post.") {
                field(.email) {
                    TextField(CheckoutField.email.label, text: $model.email, prompt: Text("you@example.com"))
                        .textContentType(.emailAddress)
                        .onSubmit { focus.wrappedValue = .cardName }
                }
            }

            FormSection("Card") {
                field(.cardName) {
                    TextField(CheckoutField.cardName.label, text: $model.cardName)
                        .textContentType(.creditCardName)
                        .onSubmit { focus.wrappedValue = .cardNumber }
                }
                field(.cardNumber) {
                    TextField(CheckoutField.cardNumber.label, text: $model.cardNumber,
                              prompt: Text("1234 5678 9012 3456"))
                        .textContentType(.creditCardNumber)
                        .monospacedDigit()
                        .overlay(alignment: .trailing) { brandBadge }
                        .onChange(of: model.cardBrand) { _, brand in
                            if let brand { AccessibilityNotification.Announcement(brand.displayName).post() }
                        }
                        .onSubmit { focus.wrappedValue = .expiry }
                }
                HStack(alignment: .top, spacing: 16) {
                    field(.expiry) {
                        TextField(CheckoutField.expiry.label, text: $model.expiry, prompt: Text("MM / YY"))
                            .textContentType(.creditCardExpiration)
                            .monospacedDigit()
                            .onSubmit { focus.wrappedValue = .securityCode }
                    }
                    field(.securityCode, note: model.cardBrand.map { "\($0.securityCodeLength) digits" }) {
                        TextField(CheckoutField.securityCode.label, text: $model.securityCode,
                                  prompt: Text(model.cardBrand == .amex ? "1234" : "123"))
                            .textContentType(.creditCardSecurityCode)
                            .monospacedDigit()
                            .onSubmit { focus.wrappedValue = .line1 }
                    }
                }
            }

            FormSection("Billing address") {
                field(.line1) {
                    TextField(CheckoutField.line1.label, text: $model.line1)
                        .textContentType(.streetAddressLine1)
                        .onSubmit { focus.wrappedValue = .line2 }
                }
                field(.line2, note: "Optional") {
                    TextField(CheckoutField.line2.label, text: $model.line2, prompt: Text("Flat, suite, building"))
                        .textContentType(.streetAddressLine2)
                        .onSubmit { focus.wrappedValue = .city }
                }
                field(.city) {
                    TextField(CheckoutField.city.label, text: $model.city)
                        .textContentType(.addressCity)
                        .onSubmit { focus.wrappedValue = .postalCode }
                }
                HStack(alignment: .top, spacing: 16) {
                    field(.postalCode) {
                        TextField(CheckoutField.postalCode.label, text: $model.postalCode,
                                  prompt: Text(model.country.postalCodeExample))
                            .textContentType(.postalCode)
                            .onSubmit(pay)
                    }
                    field(.country) {
                        // Named by the visible label above it.
                        Picker(selection: $model.country) {
                            ForEach(Country.allCases) { country in
                                Text(country.displayName).tag(country)
                            }
                        } label: {
                            EmptyView()
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var brandBadge: some View {
        if let brand = model.cardBrand {
            Text(brand.shortName)
                .font(.caption.weight(.bold))
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(.secondary)
                .padding(.trailing, 10)
                .transition(.opacity)
                .accessibilityHidden(true)
        }
    }

    // MARK: Parts

    private func field<Content: View>(_ field: CheckoutField, note: String? = nil,
                                      @ViewBuilder content: () -> Content) -> some View {
        LabeledField(field.label, note: note, error: model.visibleError(for: field, account: account)) {
            content().focused(focus, equals: field)
        }
        .id(field)
        .onChange(of: model.visibleError(for: field, account: account)) { old, new in
            // A newly arrived error is said aloud; one that changes as they fix it is not.
            if old == nil, let new { AccessibilityNotification.Announcement("\(field.label): \(new)").post() }
        }
    }
}

/// A titled group of fields; type and space do the separating, not boxes.
private struct FormSection<Content: View>: View {
    let title: String
    let caption: String?
    @ViewBuilder let content: Content

    init(_ title: String, caption: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.caption = caption
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(Theme.display(19, weight: .medium))
                    .accessibilityAddTraits(.isHeader)
                if let caption {
                    Text(caption).font(.callout).foregroundStyle(.secondary)
                }
            }
            content
        }
    }
}

private struct SavedCardRow: View {
    let card: SavedCard
    let isSelected: Bool
    let select: () -> Void

    var body: some View {
        let expired = card.isExpired()
        Button(action: select) {
            HStack(spacing: 12) {
                RadioMark(isSelected: isSelected)
                CardBrandMark(brand: card.brand)
                Text("\(card.brand.displayName) •••• \(card.last4)")
                    .font(.body.weight(.medium).monospacedDigit())
                Spacer()
                Text(expired ? "Expired \(card.expiryText)" : "Expires \(card.expiryText)")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(expired ? Theme.error : .secondary)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(expired)
        .opacity(expired ? 0.55 : 1)
        .accessibilityLabel(card.spokenDescription)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(expired ? "This card has expired and can’t be used." : "")
    }
}

private struct NewCardRow: View {
    let isSelected: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack(spacing: 12) {
                RadioMark(isSelected: isSelected)
                Image(systemName: "creditcard")
                    .frame(width: 34)
                    .foregroundStyle(.secondary)
                Text("A new card").font(.body.weight(.medium))
                Spacer()
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("A new card")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct RadioMark: View {
    let isSelected: Bool

    var body: some View {
        ZStack {
            Circle().strokeBorder(isSelected ? Theme.accent : Theme.ink.opacity(0.35), lineWidth: 1.5)
            if isSelected {
                Circle().fill(Theme.accent).padding(4).transition(.scale)
            }
        }
        .frame(width: 18, height: 18)
        .animation(.snappy(duration: 0.2), value: isSelected)
        .accessibilityHidden(true)
    }
}

/// A small printed mark for the card's kind, so it reads like the card in the wallet.
struct CardBrandMark: View {
    let brand: CardBrand

    var body: some View {
        Text(abbreviation)
            .font(.system(size: 9, weight: .heavy).width(.condensed))
            .tracking(0.4)
            .foregroundStyle(Theme.ink.opacity(0.8))
            .frame(width: 34, height: 22)
            .background(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.rule, lineWidth: 1))
            .accessibilityHidden(true)
    }

    private var abbreviation: String {
        switch brand {
        case .visa: "VISA"
        case .mastercard: "MC"
        case .amex: "AMEX"
        case .discover: "DISC"
        }
    }
}
