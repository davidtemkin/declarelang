// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Venue",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Venue", targets: ["Venue"]),
    ],
    targets: [
        .executableTarget(
            name: "Venue",
            path: "Sources/Venue"
        ),
        .testTarget(
            name: "VenueTests",
            dependencies: ["Venue"],
            path: "Tests/VenueTests"
        ),
    ]
)
