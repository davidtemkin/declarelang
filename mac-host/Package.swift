// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "DeclareMac",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "DeclareMac",
            path: "Sources/DeclareMac",
            swiftSettings: [.unsafeFlags(["-parse-as-library"])]
        )
    ]
)
