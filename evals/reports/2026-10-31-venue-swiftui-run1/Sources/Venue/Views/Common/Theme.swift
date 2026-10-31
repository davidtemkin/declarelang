import AppKit
import SwiftUI

/// The look of the house.
///
/// Two type families — New York (serif) for the production's voice, SF for everything
/// that's read in passing — and one accent, ink blue, which always means *yours*: the
/// seats you've chosen, the card you're paying with, the button that commits.
enum Theme {
    // MARK: Colour

    /// Ink blue. The one accent.
    static let accent = Color(light: NSColor(srgbRed: 0.13, green: 0.22, blue: 0.70, alpha: 1),
                              dark: NSColor(srgbRed: 0.56, green: 0.64, blue: 1.00, alpha: 1))

    /// Text and marks on the accent.
    static let onAccent = Color(light: .white,
                                dark: NSColor(srgbRed: 0.05, green: 0.06, blue: 0.14, alpha: 1))

    /// Warm programme paper.
    static let paper = Color(light: NSColor(srgbRed: 0.973, green: 0.961, blue: 0.937, alpha: 1),
                             dark: NSColor(srgbRed: 0.090, green: 0.086, blue: 0.098, alpha: 1))

    /// A slightly raised surface: the stage, the ticket.
    static let card = Color(light: NSColor(srgbRed: 1, green: 1, blue: 0.995, alpha: 1),
                            dark: NSColor(srgbRed: 0.137, green: 0.133, blue: 0.149, alpha: 1))

    static let ink = Color(light: NSColor(srgbRed: 0.10, green: 0.09, blue: 0.09, alpha: 1),
                           dark: NSColor(srgbRed: 0.94, green: 0.92, blue: 0.89, alpha: 1))

    /// Hairlines and the marks of seats already gone.
    static let rule = Color(light: NSColor(srgbRed: 0.10, green: 0.09, blue: 0.09, alpha: 0.14),
                            dark: NSColor(srgbRed: 0.94, green: 0.92, blue: 0.89, alpha: 0.16))

    /// Errors keep the system's red: it is a signal, not decoration.
    static let error = Color(nsColor: .systemRed)

    // MARK: Type

    static func display(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }

    /// Small capitals-style labels: section names, field captions.
    static let eyebrow = Font.system(size: 11, weight: .semibold).width(.expanded)

    // MARK: Measure

    static let gutter: CGFloat = 24
    /// Below this width, the app arranges itself as it would on a phone.
    static let compactWidth: CGFloat = 720
}

extension Color {
    init(light: NSColor, dark: NSColor) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .vibrantDark, .accessibilityHighContrastDarkAqua]) != nil ? dark : light
        })
    }
}

extension View {
    /// Section captions: small, wide, tracked, quiet.
    func eyebrowStyle() -> some View {
        font(Theme.eyebrow)
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(.secondary)
    }
}
