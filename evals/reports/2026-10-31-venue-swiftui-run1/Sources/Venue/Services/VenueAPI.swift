import Foundation

/// The one backend there is: the Venue service on 127.0.0.1:8352.
///
/// Nothing is cached — every request goes to the service — and the session rides on the
/// `vn_session` cookie held in the shared cookie store.
struct VenueAPI: Sendable {
    enum Failure: Error, LocalizedError {
        /// The service refused, with its own sentence.
        case refused(status: Int, ServiceError)
        /// The service couldn't be reached or answered nonsense.
        case unreachable(underlying: Error)

        var errorDescription: String? {
            switch self {
            case let .refused(_, error): error.message
            case .unreachable: "The box office can’t be reached right now. Check your connection and try again."
            }
        }
    }

    static let baseURL = URL(string: "http://127.0.0.1:8352")!
    static let sessionCookieName = "vn_session"

    let baseURL: URL
    let session: URLSession

    init(baseURL: URL = VenueAPI.baseURL, cookies: HTTPCookieStorage = .shared) {
        let configuration = URLSessionConfiguration.default
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        configuration.urlCache = nil
        configuration.httpCookieStorage = cookies
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.timeoutIntervalForRequest = 30
        self.baseURL = baseURL
        self.session = URLSession(configuration: configuration)
    }

    // MARK: Production

    func production() async throws -> Production {
        try await send("GET", "/api/production")
    }

    func seatMap(for performanceId: String) async throws -> SeatMap {
        try await send("GET", "/api/performances/\(performanceId)/seats")
    }

    // MARK: Session

    func signIn(email: String, password: String) async throws {
        struct Credentials: Encodable { let email: String; let password: String }
        let _: SignedIn = try await send("POST", "/api/session", body: Credentials(email: email, password: password))
    }

    func signOut() async throws {
        let _: Empty = try await send("DELETE", "/api/session")
    }

    /// The signed-in account, or `nil` when signed out.
    func me() async throws -> Account? {
        do {
            return try await send("GET", "/api/me")
        } catch Failure.refused(status: 401, _) {
            return nil
        }
    }

    // MARK: Paying

    func placeOrder(_ order: OrderRequest) async throws -> Order {
        try await send("POST", "/api/orders", body: order)
    }

    // MARK: Live seats

    /// A request for the server-sent stream of other people's purchases.
    func eventsRequest(for performanceId: String) -> URLRequest {
        var components = URLComponents(url: baseURL.appending(path: "/api/events"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "performance", value: performanceId)]
        var request = URLRequest(url: components.url!)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = .infinity
        return request
    }

    // MARK: Plumbing

    private struct Empty: Decodable {}
    private struct SignedIn: Decodable { let name: String; let email: String }
    private struct NoBody: Encodable {}

    private func send<Response: Decodable>(_ method: String, _ path: String) async throws -> Response {
        try await send(method, path, body: Optional<NoBody>.none)
    }

    private func send<Response: Decodable, Body: Encodable>(
        _ method: String, _ path: String, body: Body?
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Failure.unreachable(underlying: error)
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            if let refusal = try? JSONDecoder().decode(ServiceError.self, from: data) {
                throw Failure.refused(status: status, refusal)
            }
            throw Failure.unreachable(underlying: URLError(.badServerResponse))
        }
        if status == 204 || data.isEmpty, let empty = Empty() as? Response {
            return empty
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw Failure.unreachable(underlying: error)
        }
    }
}
