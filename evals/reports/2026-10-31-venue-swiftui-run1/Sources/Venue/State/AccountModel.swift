import Foundation
import Observation

/// Who is signed in. The session lives with the service; this mirrors it.
@MainActor
@Observable
final class AccountModel {
    private(set) var account: Account?
    /// True until the first `GET /api/me` after launch has answered.
    private(set) var isRestoring = true

    private let api: VenueAPI
    private let vault: SessionCookieVault

    init(api: VenueAPI, vault: SessionCookieVault) {
        self.api = api
        self.vault = vault
    }

    var isSignedIn: Bool { account != nil }

    /// Picks up a session remembered from last time, if the service still honours it.
    func restore() async {
        vault.restore()
        defer { isRestoring = false }
        do {
            account = try await api.me()
            if account == nil { vault.clear() }
        } catch {
            // Unreachable: stay signed out for now; the person can sign in by hand.
            account = nil
        }
    }

    /// Signs in. Throws with the service's own sentence on a wrong password.
    func signIn(email: String, password: String) async throws {
        try await api.signIn(email: email, password: password)
        vault.capture()
        account = try await api.me()
    }

    func signOut() async {
        try? await api.signOut()
        vault.clear()
        account = nil
    }

    /// The service said the session is gone (for instance, a saved card was refused as
    /// signed out); stop pretending otherwise.
    func sessionEnded() {
        vault.clear()
        account = nil
    }
}
