import Foundation
import Security

/// Keeps the service's session cookie across launches.
///
/// The service issues `vn_session` as a browser-session cookie, which the cookie store drops
/// when the app quits. The session itself lives with the service; this only remembers the
/// key to it — in the Keychain, since it is a credential — so relaunching the app is like
/// reloading a page: still signed in until the person signs out.
struct SessionCookieVault: Sendable {
    let baseURL: URL
    var service = "Venue.session"
    var account = VenueAPI.sessionCookieName

    /// Puts a remembered session back into the cookie store, if there is one.
    func restore(into storage: HTTPCookieStorage = .shared) {
        guard let value = readValue(), let cookie = makeCookie(value: value) else { return }
        storage.setCookie(cookie)
    }

    /// Remembers the session cookie the service just set.
    func capture(from storage: HTTPCookieStorage = .shared) {
        guard let cookie = storage.cookies(for: baseURL)?.first(where: { $0.name == account }) else { return }
        save(cookie.value)
    }

    /// Forgets the session, in the Keychain and in the cookie store.
    func clear(from storage: HTTPCookieStorage = .shared) {
        for cookie in storage.cookies(for: baseURL) ?? [] where cookie.name == account {
            storage.deleteCookie(cookie)
        }
        SecItemDelete(baseQuery as CFDictionary)
    }

    // MARK: Keychain

    private var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    private func readValue() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func save(_ value: String) {
        let data = Data(value.utf8)
        let update = [kSecValueData as String: data]
        if SecItemUpdate(baseQuery as CFDictionary, update as CFDictionary) == errSecItemNotFound {
            var add = baseQuery
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    private func makeCookie(value: String) -> HTTPCookie? {
        HTTPCookie(properties: [
            .name: account,
            .value: value,
            .domain: baseURL.host() ?? "127.0.0.1",
            .path: "/",
            .init("HttpOnly"): "TRUE",
            .sameSitePolicy: HTTPCookieStringPolicy.sameSiteLax.rawValue,
        ])
    }
}
