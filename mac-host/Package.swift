// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "DeclareMac",
    platforms: [.macOS(.v14)],
    targets: [
        // The reactive kernel, native (docs/system-design/kernel.md, Phase D):
        // kernel/src mirrored in by build.sh, its ABI installed on the JavaScript
        // context by kernel_jsc.c.
        .target(
            name: "DeclareKernel",
            path: "Sources/DeclareKernel",
            cSettings: [.unsafeFlags(["-O2"])],
            linkerSettings: [.linkedFramework("JavaScriptCore")]
        ),
        .executableTarget(
            name: "DeclareMac",
            dependencies: ["DeclareKernel"],
            path: "Sources/DeclareMac",
            swiftSettings: [.unsafeFlags(["-parse-as-library"])]
        )
    ]
)
