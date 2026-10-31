import SwiftUI

/// The three states a seat can be in, told apart by shape as well as colour:
/// free is an open ring, yours is a solid accent disc with a tick, gone is a small faint dot.
enum SeatState: Equatable {
    case free
    case yours
    case gone

    var spoken: String {
        switch self {
        case .free: "Available"
        case .yours: "Chosen"
        case .gone: "Sold"
        }
    }
}

/// One seat in the hall. Its whole pitch is clickable, so neighbouring seats meet with no
/// dead space between them and the nearest seat to the pointer is always the one hit.
struct SeatView: View {
    let info: SeatInfo
    let state: SeatState
    /// Points per seat unit at the current zoom.
    let unit: CGFloat
    let isCursor: Bool
    let justTaken: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            mark
                .frame(width: unit, height: unit)
                .contentShape(Rectangle())
        }
        .buttonStyle(SeatButtonStyle())
        // The hall moves a single keyboard cursor with the arrow keys instead of making
        // six hundred tab stops.
        .focusable(false)
        .disabled(state == .gone)
        .accessibilityLabel(info.accessibleName)
        .accessibilityValue(state == .gone ? state.spoken : "\(state.spoken), \(Money.format(info.priceCents))")
        .accessibilityAddTraits(state == .yours ? .isSelected : [])
        .accessibilityHint(state == .free ? "Adds this seat to your choice." : state == .yours ? "Removes this seat from your choice." : "")
        .help(state == .gone ? "\(info.accessibleName) — sold" : "\(info.accessibleName) — \(Money.format(info.priceCents))")
    }

    @ViewBuilder
    private var mark: some View {
        ZStack {
            switch state {
            case .free:
                Circle()
                    .fill(Theme.card)
                    .overlay(Circle().strokeBorder(Theme.ink.opacity(0.62), lineWidth: max(1, unit * 0.09)))
                    .frame(width: unit * 0.74, height: unit * 0.74)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            case .yours:
                Circle()
                    .fill(Theme.accent)
                    .frame(width: unit * 0.9, height: unit * 0.9)
                    .overlay {
                        if unit >= 11 {
                            Image(systemName: "checkmark")
                                .font(.system(size: unit * 0.44, weight: .heavy))
                                .foregroundStyle(Theme.onAccent)
                        }
                    }
                    .transition(.scale(scale: 0.4).combined(with: .opacity))
            case .gone:
                Circle()
                    .fill(Theme.ink.opacity(0.22))
                    .frame(width: unit * 0.3, height: unit * 0.3)
                    .transition(.scale(scale: 2.2).combined(with: .opacity))
            }
            if justTaken {
                // Someone else just bought this one: a ring that fades, so the change is seen.
                Circle()
                    .strokeBorder(Theme.ink.opacity(0.55), style: StrokeStyle(lineWidth: max(1, unit * 0.08), dash: [2, 2]))
                    .frame(width: unit * 0.95, height: unit * 0.95)
                    .transition(.opacity)
            }
            if isCursor {
                RoundedRectangle(cornerRadius: unit * 0.25)
                    .strokeBorder(Theme.accent, lineWidth: 2)
                    .frame(width: unit * 1.15, height: unit * 1.15)
            }
        }
        .animation(.spring(response: 0.28, dampingFraction: 0.55), value: state)
    }
}

/// A seat gives way under the pointer as it is pressed: the press registered.
private struct SeatButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.88 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}
