import AppKit
import CoreGraphics
import ImageIO
import Foundation
import UniformTypeIdentifiers

// 1) App icon: crop squircle from source art, mask rounded rect, output 1024 PNG.
let sourceURL = URL(fileURLWithPath: "images/20261110032644-macOS-app-icon-design-ro.png")
guard let src = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError("load fail") }
print("src \(img.width)x\(img.height)")

// Measured squircle bounds in the 1254x1254 art (eyeballed, then refined visually).
let cropX = 128, cropY = 140, cropW = 1000, cropH = 1000
let cropped = img.cropping(to: CGRect(x: cropX, y: cropY, width: cropW, height: cropH))!

let out = 1024
let ctx = CGContext(data: nil, width: out, height: out, bitsPerComponent: 8, bytesPerRow: out * 4,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .high
// Big Sur style rounded-rect mask, corner radius ~22.4%, tiny inset to avoid halo.
let r: CGFloat = CGFloat(out) * 0.224
let inset: CGFloat = 4
ctx.addPath(CGPath(roundedRect: CGRect(x: inset, y: inset, width: CGFloat(out) - inset * 2, height: CGFloat(out) - inset * 2), cornerWidth: r, cornerHeight: r, transform: nil))
ctx.clip()
ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: CGFloat(out), height: CGFloat(out)))
let icon1024 = ctx.makeImage()!

func writePNG(_ image: CGImage, _ path: String) {
    let url = URL(fileURLWithPath: path) as CFURL
    let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)
}

let iconsDir = "desktop/src-tauri/icons"
try? FileManager.default.createDirectory(atPath: iconsDir, withIntermediateDirectories: true)
writePNG(icon1024, iconsDir + "/icon.png")

// iconset
// 生成 icon.icns 还需手动执行：iconutil -c icns /tmp/moss.iconset -o desktop/src-tauri/icons/icon.icns
// 用法（仓库根目录）：swift desktop/src-tauri/assets/generate-icons.swift
let setDir = "/tmp/moss.iconset"
try? FileManager.default.removeItem(atPath: setDir)
try! FileManager.default.createDirectory(atPath: setDir, withIntermediateDirectories: true)
for s in [16, 32, 128, 256, 512] {
    for (name, scale) in [("icon_\(s)x\(s).png", 1), ("icon_\(s)x\(s)@2x.png", 2)] {
        let px = s * scale
        let c = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: px * 4,
                          space: CGColorSpace(name: CGColorSpace.sRGB)!,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        c.interpolationQuality = .high
        c.draw(icon1024, in: CGRect(x: 0, y: 0, width: CGFloat(px), height: CGFloat(px)))
        writePNG(c.makeImage()!, setDir + "/" + name)
    }
}

// 2) Tray template glyph 36x36: three rounded vertical bars (waveform motif, matches app icon).
let t = 36
// Raw RGBA bytes for include_bytes! in Rust — context draws straight into our buffer.
var pixels = [UInt8](repeating: 0, count: t * t * 4)
let tc = CGContext(data: &pixels, width: t, height: t, bitsPerComponent: 8, bytesPerRow: t * 4,
                   space: CGColorSpace(name: CGColorSpace.sRGB)!,
                   bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)!
tc.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
let barW: CGFloat = 7
let capR: CGFloat = barW / 2
let midX: CGFloat = 18
let spacing: CGFloat = 11.5
let midH: CGFloat = 26
let sideH: CGFloat = 17
for (cx, h) in [(midX - spacing, sideH), (midX, midH), (midX + spacing, sideH)] {
    let y = CGFloat(18) - CGFloat(h) / 2
    let rect = CGRect(x: cx - barW / 2, y: y, width: barW, height: CGFloat(h))
    tc.addPath(CGPath(roundedRect: rect, cornerWidth: capR, cornerHeight: capR, transform: nil))
}
tc.fillPath()
let glyph = tc.makeImage()!
let rgbaPath = "desktop/src-tauri/assets/tray-moss.rgba"
try? FileManager.default.createDirectory(atPath: (rgbaPath as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
try! Data(pixels).write(to: URL(fileURLWithPath: rgbaPath))
print("rgba bytes: \(pixels.count)")

// 8x preview to eyeball the glyph (white bg so alpha visible).
let p8 = t * 8
let pc = CGContext(data: nil, width: p8, height: p8, bitsPerComponent: 8, bytesPerRow: p8 * 4,
                   space: CGColorSpace(name: CGColorSpace.sRGB)!,
                   bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
pc.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
pc.fill(CGRect(x: 0, y: 0, width: CGFloat(p8), height: CGFloat(p8)))
pc.interpolationQuality = .none
pc.draw(glyph, in: CGRect(x: 0, y: 0, width: CGFloat(p8), height: CGFloat(p8)))
writePNG(pc.makeImage()!, "/tmp/tray-glyph-preview.png")
print("DONE")
