import ApplicationServices
import AppKit
// usage: ax press <name> | ax set <name> <value> | ax dump [filter] | ax value <name> | ax focus <name> | ax focused
let args = CommandLine.arguments
let pid = NSRunningApplication.runningApplications(withBundleIdentifier: "com.example.venue").first!.processIdentifier
let app = AXUIElementCreateApplication(pid)
func attr(_ e: AXUIElement, _ a: String) -> AnyObject? { var v: AnyObject?; AXUIElementCopyAttributeValue(e, a as CFString, &v); return v }
func name(_ e: AXUIElement) -> String {
  for a in ["AXDescription","AXTitle"] { if let s = attr(e,a) as? String, !s.isEmpty { return s } }
  if let t = attr(e,"AXTitleUIElement") { return (attr(t as! AXUIElement,"AXValue") as? String) ?? "" }
  return ""
}
func walk(_ e: AXUIElement, _ depth: Int = 0, _ f: (AXUIElement, Int) -> Bool) -> Bool {
  if f(e, depth) { return true }
  for c in (attr(e,"AXChildren") as? [AXUIElement]) ?? [] { if walk(c, depth+1, f) { return true } }
  return false
}
func find(_ n: String, role: String? = nil) -> AXUIElement? {
  var found: [AXUIElement] = []
  _ = walk(app) { e, _ in
    if name(e) == n && (role == nil || (attr(e,"AXRole") as? String) == role) { found.append(e) }; return false }
  return ProcessInfo.processInfo.environment["LAST"] != nil ? found.last : found.first
}
switch args[1] {
case "press":
  guard let e = find(args[2]) else { print("NOT FOUND \(args[2])"); exit(1) }
  print(AXUIElementPerformAction(e, kAXPressAction as CFString) == .success ? "pressed" : "press failed")
case "set":
  guard let e = find(args[2], role: "AXTextField") else { print("NOT FOUND \(args[2])"); exit(1) }
  AXUIElementSetAttributeValue(e, kAXFocusedAttribute as CFString, kCFBooleanTrue)
  AXUIElementSetAttributeValue(e, kAXValueAttribute as CFString, args[3] as CFString)
  print("value now:", attr(e,"AXValue") ?? "nil")
case "focus":
  guard let e = find(args[2]) else { print("NOT FOUND"); exit(1) }
  AXUIElementSetAttributeValue(e, kAXFocusedAttribute as CFString, kCFBooleanTrue)
case "value":
  guard let e = find(args[2]) else { print("NOT FOUND"); exit(1) }
  print(attr(e,"AXValue") ?? "nil", "|", attr(e, "AXHelp") ?? "", "|", attr(e,"AXEnabled") ?? "")
case "focused":
  let f = attr(app, "AXFocusedUIElement")
  if let f { print(attr(f as! AXUIElement,"AXRole") ?? "", name(f as! AXUIElement)) } else { print("none") }
default:
  let filter = args.count > 2 ? args[2] : ""
  _ = walk(app) { e, d in
    let r = (attr(e,"AXRole") as? String) ?? ""; let n = name(e); let v = (attr(e,"AXValue") as? String) ?? ""
    if (filter.isEmpty || r.contains(filter) || n.contains(filter)) && !(n.isEmpty && v.isEmpty && !filter.isEmpty) {
      print(String(repeating: " ", count: d) + r + " «" + n + "» " + v) }
    return false }
}
