import Foundation

/// What the live stream tells the hall.
enum SeatEvent: Sendable, Equatable {
    /// The stream (re)opened. Anything sold while it was closed was missed, so the map
    /// should be fetched again.
    case connected
    /// Someone else bought this seat; it is no longer free to anyone.
    case sold(seatId: String)
}

extension VenueAPI {
    /// Other people's purchases in one performance, as they happen.
    ///
    /// Reads `GET /api/events` as server-sent events and reconnects with a growing pause if
    /// the connection drops. Ends when the consuming task is cancelled.
    func seatEvents(for performanceId: String) -> AsyncStream<SeatEvent> {
        let request = eventsRequest(for: performanceId)
        let session = self.session
        return AsyncStream { continuation in
            let task = Task {
                var backoff: Duration = .milliseconds(500)
                while !Task.isCancelled {
                    do {
                        let (bytes, response) = try await session.bytes(for: request)
                        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                            throw URLError(.badServerResponse)
                        }
                        continuation.yield(.connected)
                        backoff = .milliseconds(500)

                        var parser = ServerSentEventParser()
                        for try await line in bytes.lines {
                            guard let event = parser.consume(line) else { continue }
                            if let change = SeatChange(event), change.status == "sold" {
                                continuation.yield(.sold(seatId: change.seatId))
                            }
                        }
                    } catch {
                        if Task.isCancelled { break }
                    }
                    try? await Task.sleep(for: backoff)
                    backoff = min(backoff * 2, .seconds(8))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

private struct SeatChange: Decodable {
    let seatId: String
    let status: String

    init?(_ event: ServerSentEventParser.Event) {
        guard event.name == "seatchanged",
              let decoded = try? JSONDecoder().decode(SeatChange.self, from: Data(event.data.utf8)) else {
            return nil
        }
        self = decoded
    }
}

/// A minimal `text/event-stream` reader: accumulates `event:` and `data:` fields and hands
/// back an event at each blank line.
///
/// `AsyncLineSequence` skips empty lines, so a new `event:` field also closes the previous
/// event, and an event is emitted as soon as it has data.
struct ServerSentEventParser {
    struct Event: Equatable {
        var name = "message"
        var data = ""
    }

    private var pending = Event()
    private var hasData = false

    mutating func consume(_ line: String) -> Event? {
        if line.isEmpty || line.hasPrefix(":") { return line.isEmpty ? flush() : nil }
        let (field, value) = split(line)
        switch field {
        case "event":
            pending = Event(name: value)
            hasData = false
        case "data":
            pending.data += hasData ? "\n" + value : value
            hasData = true
            // The service sends one data line per event; deliver it without waiting
            // for a blank line the line reader will never show us.
            return flush()
        default:
            break
        }
        return nil
    }

    private mutating func flush() -> Event? {
        defer { pending = Event(); hasData = false }
        return hasData ? pending : nil
    }

    private func split(_ line: String) -> (String, String) {
        guard let colon = line.firstIndex(of: ":") else { return (line, "") }
        var value = line[line.index(after: colon)...]
        if value.first == " " { value = value.dropFirst() }
        return (String(line[..<colon]), String(value))
    }
}
