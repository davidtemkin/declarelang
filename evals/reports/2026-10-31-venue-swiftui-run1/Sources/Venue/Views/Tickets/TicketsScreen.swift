import CoreImage.CIFilterBuiltins
import SwiftUI

/// The tickets: what someone holds up at the door with a queue behind them. One at a time,
/// big enough to read at arm's length, each with its own code to scan.
struct TicketsScreen: View {
    @Environment(AppModel.self) private var app
    let order: Order

    @State private var index = 0
    @State private var direction: Edge = .trailing
    @FocusState private var focused: Bool

    var body: some View {
        let performance = app.performance(order.performanceId)
        ScrollView {
            VStack(spacing: 28) {
                header
                if let performance {
                    ticketStack(performance)
                }
                pager
                Button("Book another performance") { app.startAgain() }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .padding(.top, 8)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.paper)
        .navigationTitle("Your tickets")
        .navigationBarBackButtonHidden()
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) { step(-1); return .handled }
        .onKeyPress(.rightArrow) { step(1); return .handled }
        .onAppear {
            focused = true
            AccessibilityNotification.Announcement(
                "Paid. \(order.tickets.count) \(order.tickets.count == 1 ? "ticket" : "tickets"), sent to \(order.email)."
            ).post()
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Text("You’re going.")
                .font(Theme.display(34, weight: .medium))
                .accessibilityAddTraits(.isHeader)
            Text("Sent to \(order.email)")
                .font(.title3)
            Text("Confirmation \(order.code) · \(Money.format(order.totalCents)) paid with \(order.brand.displayName) •••• \(order.last4)")
                .font(.callout.monospacedDigit())
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .textSelection(.enabled)
        }
        .accessibilityElement(children: .combine)
    }

    private func ticketStack(_ performance: Performance) -> some View {
        let ticket = order.tickets[index]
        let remaining = order.tickets.count - index - 1
        return ZStack {
            // The edges of the tickets still to come, so the count is felt as well as read.
            ForEach(0..<min(remaining, 2), id: \.self) { depth in
                RoundedRectangle(cornerRadius: 18)
                    .fill(Theme.card)
                    .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
                    .offset(y: CGFloat(depth + 1) * 10)
                    .scaleEffect(1 - CGFloat(depth + 1) * 0.04)
                    .zIndex(-Double(depth + 1))
                    .accessibilityHidden(true)
            }
            TicketCard(ticket: ticket, performance: performance, position: index + 1, of: order.tickets.count)
                .id(ticket.id)
                .transition(.asymmetric(
                    insertion: .move(edge: direction).combined(with: .opacity),
                    removal: .move(edge: direction == .trailing ? .leading : .trailing).combined(with: .opacity)))
        }
        .frame(maxWidth: 420)
        .padding(.bottom, 20)
    }

    private var pager: some View {
        HStack(spacing: 20) {
            Button("Previous ticket", systemImage: "chevron.left") { step(-1) }
                .labelStyle(.iconOnly)
                .disabled(index == 0)
            Text("Ticket \(index + 1) of \(order.tickets.count)")
                .font(.headline.monospacedDigit())
                .contentTransition(.numericText(value: Double(index)))
            Button("Next ticket", systemImage: "chevron.right") { step(1) }
                .labelStyle(.iconOnly)
                .disabled(index == order.tickets.count - 1)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .opacity(order.tickets.count > 1 ? 1 : 0)
        .accessibilityHidden(order.tickets.count <= 1)
    }

    private func step(_ delta: Int) {
        let next = index + delta
        guard order.tickets.indices.contains(next) else { return }
        direction = delta > 0 ? .trailing : .leading
        withAnimation(.smooth(duration: 0.35)) { index = next }
        let ticket = order.tickets[next]
        AccessibilityNotification.Announcement(
            "Ticket \(next + 1) of \(order.tickets.count): \(ticket.section), row \(ticket.row), seat \(ticket.number)"
        ).post()
    }
}

/// One ticket, laid out like a printed one: the production, when, where to sit, the code.
struct TicketCard: View {
    let ticket: Order.Ticket
    let performance: Performance
    let position: Int
    let of: Int

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Grand Hall").eyebrowStyle()
                    Spacer()
                    Text("\(position) / \(of)").eyebrowStyle().monospacedDigit()
                }
                Text("The Marriage of Figaro")
                    .font(Theme.display(28, weight: .medium))
                    .fixedSize(horizontal: false, vertical: true)
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text(performance.startsAt.dayText)
                    Text(performance.startsAt.timeText).foregroundStyle(.secondary)
                }
                .font(.system(size: 24, weight: .semibold).monospacedDigit())

                HStack(alignment: .top, spacing: 0) {
                    seatPart("Section", ticket.section, large: false)
                    seatPart("Row", ticket.row, large: true)
                    seatPart("Seat", String(ticket.number), large: true)
                }
                .padding(.top, 4)

                Label("Doors open \(performance.doorsAt.timeText) — arrive by then", systemImage: "door.left.hand.open")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            .padding(24)

            Perforation()

            VStack(spacing: 10) {
                QRCode(payload: ticket.barcode)
                    .frame(width: 200, height: 200)
                    .accessibilityHidden(true)
                Text(ticket.barcode)
                    .font(.system(size: 15, weight: .medium, design: .monospaced))
                    .tracking(1.5)
                    .textSelection(.enabled)
            }
            .padding(24)
        }
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
        .shadow(color: .black.opacity(0.10), radius: 14, y: 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Ticket \(position) of \(of). The Marriage of Figaro, \(performance.startsAt.spokenDayText), \(performance.startsAt.timeText). \(ticket.section), row \(ticket.row), seat \(ticket.number). Doors open \(performance.doorsAt.timeText). Code \(ticket.barcode).")
    }

    private func seatPart(_ title: String, _ value: String, large: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).eyebrowStyle()
            Text(value)
                .font(Theme.display(large ? 44 : 22, weight: .semibold).monospacedDigit())
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The tear line between the ticket and its stub.
private struct Perforation: View {
    var body: some View {
        HStack(spacing: 0) {
            Circle().fill(Theme.paper).frame(width: 22, height: 22).offset(x: -11)
            Line()
                .stroke(Theme.rule, style: StrokeStyle(lineWidth: 1.5, dash: [5, 5]))
                .frame(height: 1)
            Circle().fill(Theme.paper).frame(width: 22, height: 22).offset(x: 11)
        }
        .accessibilityHidden(true)
    }

    private struct Line: Shape {
        func path(in rect: CGRect) -> Path {
            Path { $0.move(to: CGPoint(x: 0, y: rect.midY)); $0.addLine(to: CGPoint(x: rect.maxX, y: rect.midY)) }
        }
    }
}

/// A scannable code for the door, drawn crisp at any size.
struct QRCode: View {
    let payload: String

    var body: some View {
        if let image = Self.render(payload) {
            Image(decorative: image, scale: 1)
                .interpolation(.none)
                .resizable()
                .aspectRatio(1, contentMode: .fit)
                .padding(10)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private static func render(_ payload: String) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(payload.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        return CIContext().createCGImage(output, from: output.extent)
    }
}
