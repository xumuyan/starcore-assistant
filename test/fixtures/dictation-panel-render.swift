import AppKit
@main struct Preview {
 static func main() throws {
  _ = NSApplication.shared
  let view = DictationPanelContent(frame: NSRect(x: 0, y: 0, width: 232, height: 68))
  let window = NSWindow(contentRect: view.frame, styleMask: .borderless, backing: .buffered, defer: false)
  window.contentView = view
  view.apply(title: "正在语音输入", detail: "再按右 Ctrl完成 · esc取消", elapsed: 0, level: 0, canCopy: false)
  let levels: [Float] = [0.05,0.1,0.2,0.7,0.95,0.4,0.25,0.6,0.35,0.45,0.25,0.5,0.35,0.75,0.4,0.65,0.3,0.45,0.3,0.2,0.25,0.15,0.1,0.05]
  for level in levels { view.updateLevel(level, elapsed: 8) }
  view.layoutSubtreeIfNeeded()
  func scaleLayers(_ node: NSView) {
   node.layer?.contentsScale = 3
   for child in node.subviews { scaleLayers(child) }
  }
  scaleLayers(view)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 696, pixelsHigh: 204,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = NSSize(width: 232, height: 68)
  view.cacheDisplay(in: view.bounds, to: rep)
  try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
 }
}
