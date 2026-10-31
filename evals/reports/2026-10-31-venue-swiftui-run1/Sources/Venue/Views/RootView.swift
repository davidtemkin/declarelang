import SwiftUI

/// Performances down the side; the chosen performance's journey — hall, checkout,
/// tickets — in the main area. Narrow windows give the main area the whole width once a
/// performance is chosen, as a phone would.
struct RootView: View {
    @Environment(AppModel.self) private var app
    @State private var columns: NavigationSplitViewVisibility = .all
    @State private var showingSignIn = false
    @State private var width: CGFloat = 1000

    var body: some View {
        @Bindable var app = app
        NavigationSplitView(columnVisibility: $columns) {
            SeasonList()
                .navigationSplitViewColumnWidth(min: 260, ideal: 300, max: 360)
                .disabled(app.checkout.isPaying)
        } detail: {
            NavigationStack(path: $app.path) {
                Group {
                    if let booking = app.booking {
                        HallScreen(booking: booking)
                            .id(booking.performance.id)
                    } else {
                        Playbill()
                    }
                }
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .checkout:
                        if let booking = app.booking {
                            CheckoutScreen(booking: booking, signIn: { showingSignIn = true })
                        }
                    case let .tickets(order):
                        TicketsScreen(order: order)
                    }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                AccountButton(showSignIn: { showingSignIn = true })
            }
        }
        .sheet(isPresented: $showingSignIn) {
            SignInSheet { app.signedIn() }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { newWidth in
            let wasNarrow = width < Theme.compactWidth
            width = newWidth
            if wasNarrow != (newWidth < Theme.compactWidth) { arrangeColumns() }
        }
        .onChange(of: app.selectedPerformanceID) { arrangeColumns() }
        .tint(Theme.accent)
        .task {
            await app.account.restore()
            await app.loadProduction()
        }
    }
}

extension RootView {
    /// At phone width the list and the hall take turns: choosing a performance takes the
    /// person into the hall; at a desk both stay side by side.
    private func arrangeColumns() {
        if width < Theme.compactWidth {
            columns = app.selectedPerformanceID == nil ? .all : .detailOnly
        } else {
            columns = .all
        }
    }
}

/// The main area before a performance is chosen: the production's title page.
private struct Playbill: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(spacing: 18) {
            Text("Grand Hall · This Season").eyebrowStyle()
            Text("The Marriage\nof Figaro")
                .font(Theme.display(54, weight: .regular))
                .multilineTextAlignment(.center)
                .lineSpacing(-4)
                .accessibilityAddTraits(.isHeader)
            if case let .loaded(production) = app.production {
                Text("Mozart · \(production.performances.count) performances · \(production.runningTime)")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            Text("Choose a performance to see the hall.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .padding(.top, 12)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.paper)
        .navigationTitle("The Marriage of Figaro")
    }
}
