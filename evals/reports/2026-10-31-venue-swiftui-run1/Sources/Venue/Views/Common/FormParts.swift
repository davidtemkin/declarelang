import SwiftUI

/// A visible label above its control. The control carries the same words as its
/// accessible name, so what's seen and what's spoken agree.
struct LabeledField<Content: View>: View {
    let label: String
    let note: String?
    let error: String?
    @ViewBuilder let content: Content

    init(_ label: String, note: String? = nil, error: String? = nil, @ViewBuilder content: () -> Content) {
        self.label = label
        self.note = note
        self.error = error
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(label)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(error == nil ? Theme.ink : Theme.error)
                if let note {
                    Text(note).font(.caption).foregroundStyle(.secondary)
                }
            }
            .accessibilityHidden(true)
            content
                .accessibilityLabel(label)
                .accessibilityHint(error ?? "")
            if let error {
                FieldMessage(error)
                    .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: -4)), removal: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.18), value: error)
    }
}

/// An error, said once beside the thing it's about.
struct FieldMessage: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Label {
            Text(text).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "exclamationmark.circle.fill")
        }
        .font(.callout)
        .foregroundStyle(Theme.error)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(text)
    }
}
