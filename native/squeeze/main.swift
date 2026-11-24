// squeeze-helper: the macOS side of the SQUEEZE layout.
//
// A small command line tool built on Apple's own frameworks (ImageIO, PDFKit,
// AVFoundation). The app runs it as a separate process for each step, so a
// crash or a cancel never touches the app, and pausing is just stopping the
// process. It only ever reads the input path and writes the output path it is
// given; the app decides where those are (always a temporary file next to the
// output folder, never the original).
//
// Every command prints one JSON object on its last line of stdout. Long
// exports also print "P <fraction>" progress lines before it.

import Foundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers
import PDFKit
import AVFoundation
import AppKit
import CryptoKit

// MARK: - Output

func emit(_ obj: [String: Any]) {
  let data = (try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])) ?? Data("{\"ok\":false,\"error\":\"Could not encode the result.\"}".utf8)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
}

func fail(_ message: String) -> Never {
  emit(["ok": false, "error": message])
  exit(1)
}

func arg(_ name: String) -> String? {
  let a = CommandLine.arguments
  guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
  return a[i + 1]
}
func flag(_ name: String) -> Bool { CommandLine.arguments.contains(name) }

func url(_ p: String) -> URL { URL(fileURLWithPath: p) }

// MARK: - Images

let gpsKey = kCGImagePropertyGPSDictionary as String
let exifKey = kCGImagePropertyExifDictionary as String
let tiffKey = kCGImagePropertyTIFFDictionary as String
let iptcKey = kCGImagePropertyIPTCDictionary as String

func imageSource(_ p: String) -> CGImageSource? {
  CGImageSourceCreateWithURL(url(p) as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary)
}

// What personal or descriptive metadata an image carries, by category.
func imageMetadataFound(_ src: CGImageSource) -> [String] {
  var found = Set<String>()
  let count = CGImageSourceGetCount(src)
  for i in 0..<max(count, 1) {
    guard let props = CGImageSourceCopyPropertiesAtIndex(src, i, nil) as? [String: Any] else { continue }
    if let gps = props[gpsKey] as? [String: Any], !gps.isEmpty { found.insert("location") }
    if let exif = props[exifKey] as? [String: Any] {
      if exif[kCGImagePropertyExifDateTimeOriginal as String] != nil || exif[kCGImagePropertyExifDateTimeDigitized as String] != nil { found.insert("timestamps") }
      if exif[kCGImagePropertyExifLensModel as String] != nil || exif[kCGImagePropertyExifLensMake as String] != nil || exif[kCGImagePropertyExifBodySerialNumber as String] != nil { found.insert("camera") }
      if exif[kCGImagePropertyExifUserComment as String] != nil { found.insert("comments") }
      if exif.count > 2 { found.insert("exif") }
    }
    if let tiff = props[tiffKey] as? [String: Any] {
      if tiff[kCGImagePropertyTIFFMake as String] != nil || tiff[kCGImagePropertyTIFFModel as String] != nil { found.insert("camera") }
      if tiff[kCGImagePropertyTIFFSoftware as String] != nil || tiff[kCGImagePropertyTIFFHostComputer as String] != nil { found.insert("software") }
      if tiff[kCGImagePropertyTIFFArtist as String] != nil || tiff[kCGImagePropertyTIFFCopyright as String] != nil { found.insert("author") }
      if tiff[kCGImagePropertyTIFFDateTime as String] != nil { found.insert("timestamps") }
      if tiff[kCGImagePropertyTIFFImageDescription as String] != nil { found.insert("comments") }
    }
    if let iptc = props[iptcKey] as? [String: Any], !iptc.isEmpty { found.insert("iptc") }
    for k in props.keys where k.hasPrefix("{Maker") { found.insert("camera"); _ = k }
    if let png = props[kCGImagePropertyPNGDictionary as String] as? [String: Any] {
      if png[kCGImagePropertyPNGSoftware as String] != nil { found.insert("software") }
      if png[kCGImagePropertyPNGAuthor as String] != nil || png[kCGImagePropertyPNGCopyright as String] != nil { found.insert("author") }
      if png[kCGImagePropertyPNGDescription as String] != nil || png[kCGImagePropertyPNGComment as String] != nil { found.insert("comments") }
      if png[kCGImagePropertyPNGCreationTime as String] != nil || png[kCGImagePropertyPNGModificationTime as String] != nil { found.insert("timestamps") }
    }
    if let thumbs = props[kCGImagePropertyThumbnailImages as String] as? [Any], !thumbs.isEmpty { found.insert("thumbnail") }
    if let meta = CGImageSourceCopyMetadataAtIndex(src, i, nil), let tags = CGImageMetadataCopyTags(meta) as? [CGImageMetadataTag] {
      for t in tags {
        let prefix = (CGImageMetadataTagCopyPrefix(t) as String?) ?? ""
        if ["xmp", "xmpMM", "photoshop", "dc", "aux", "Iptc4xmpCore", "lr", "crs"].contains(prefix) { found.insert("xmp") }
      }
    }
  }
  return Array(found).sorted()
}

func imageInfo(_ p: String) -> [String: Any] {
  guard let src = imageSource(p), let type = CGImageSourceGetType(src) as String? else { fail("This image could not be read.") }
  let count = CGImageSourceGetCount(src)
  if count == 0 { fail("This image has no pictures in it.") }
  let props = (CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [String: Any]) ?? [:]
  var out: [String: Any] = ["ok": true, "kind": "image", "type": type, "frames": count]
  out["width"] = props[kCGImagePropertyPixelWidth as String] ?? 0
  out["height"] = props[kCGImagePropertyPixelHeight as String] ?? 0
  out["depth"] = props[kCGImagePropertyDepth as String] ?? 0
  out["orientation"] = props[kCGImagePropertyOrientation as String] ?? 1
  out["alpha"] = props[kCGImagePropertyHasAlpha as String] ?? false
  out["colorModel"] = props[kCGImagePropertyColorModel as String] ?? ""
  out["profile"] = props[kCGImagePropertyProfileName as String] ?? ""
  out["dpi"] = props[kCGImagePropertyDPIWidth as String] ?? 0
  if let tiff = props[tiffKey] as? [String: Any] { out["tiffCompression"] = tiff[kCGImagePropertyTIFFCompression as String] ?? 0 }
  var aux: [String] = []
  let auxTypes: [(String, CFString)] = [("gainmap", kCGImageAuxiliaryDataTypeHDRGainMap), ("isogainmap", kCGImageAuxiliaryDataTypeISOGainMap), ("depth", kCGImageAuxiliaryDataTypeDepth), ("disparity", kCGImageAuxiliaryDataTypeDisparity), ("matte", kCGImageAuxiliaryDataTypePortraitEffectsMatte)]
  for (name, t) in auxTypes where CGImageSourceCopyAuxiliaryDataInfoAtIndex(src, 0, t) != nil { aux.append(name) }
  out["auxiliary"] = aux
  out["metadata"] = imageMetadataFound(src)
  return out
}

// Removes metadata without decoding the picture: ImageIO copies the encoded
// image data as it is and writes only what we give it. Orientation is kept,
// because without it the picture would turn on its side.
func imageClean(_ input: String, _ output: String) -> [String: Any] {
  guard let src = imageSource(input), let type = CGImageSourceGetType(src) else { fail("This image could not be read.") }
  let props = (CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [String: Any]) ?? [:]
  let orientation = (props[kCGImagePropertyOrientation as String] as? Int) ?? 1
  guard let dst = CGImageDestinationCreateWithURL(url(output) as CFURL, type, CGImageSourceGetCount(src), nil) else { fail("macOS cannot write this image type without decoding it.") }
  // Every tag the source carries is set to null (which removes it), except the
  // few that describe how to draw the picture.
  let keep: Set<String> = ["tiff:Orientation", "exif:ColorSpace", "exif:PixelXDimension", "exif:PixelYDimension", "tiff:ResolutionUnit", "tiff:XResolution", "tiff:YResolution", "exif:ComponentsConfiguration", "exif:ExifVersion", "exif:FlashPixVersion"]
  let meta = CGImageMetadataCreateMutable()
  var removed = 0
  if let srcMeta = CGImageSourceCopyMetadataAtIndex(src, 0, nil), let tags = CGImageMetadataCopyTags(srcMeta) as? [CGImageMetadataTag] {
    for t in tags {
      guard let prefix = CGImageMetadataTagCopyPrefix(t) as String?, let name = CGImageMetadataTagCopyName(t) as String? else { continue }
      let path = "\(prefix):\(name)"
      if keep.contains(path) { continue }
      // Gain map descriptions are needed to show HDR photos correctly.
      if prefix == "HDRGainMap" || prefix == "hdrgm" || prefix == "apdi" { continue }
      if let ns = CGImageMetadataTagCopyNamespace(t) as String? { CGImageMetadataRegisterNamespaceForPrefix(meta, ns as CFString, prefix as CFString, nil) }
      if CGImageMetadataSetValueWithPath(meta, nil, path as CFString, kCFNull) { removed += 1 }
    }
  }
  if orientation != 1 {
    CGImageMetadataSetValueMatchingImageProperty(meta, kCGImagePropertyTIFFDictionary, kCGImagePropertyTIFFOrientation, NSNumber(value: orientation))
  }
  let opts: [CFString: Any] = [
    kCGImageDestinationMetadata: meta,
    kCGImageDestinationMergeMetadata: true,
    kCGImageMetadataShouldExcludeGPS: true,
  ]
  var err: Unmanaged<CFError>?
  if !CGImageDestinationCopyImageSource(dst, src, opts as CFDictionary, &err) {
    let why = (err?.takeRetainedValue()).map { CFErrorCopyDescription($0) as String } ?? "unknown reason"
    fail("macOS could not copy this image without re-encoding it (\(why)).")
  }
  return ["ok": true, "removed": removed]
}

// Encodes the picture again (used for TIFF lossless compression, and for the
// optional lossy step of Maximum Squeeze). Colour profile, orientation and
// HDR gain maps travel with it; personal metadata does not.
func imageEncode(_ input: String, _ output: String) -> [String: Any] {
  guard let src = imageSource(input) else { fail("This image could not be read.") }
  let typeArg = arg("--type") ?? (CGImageSourceGetType(src) as String? ?? "public.jpeg")
  let count = CGImageSourceGetCount(src)
  guard let dst = CGImageDestinationCreateWithURL(url(output) as CFURL, typeArg as CFString, count, nil) else { fail("macOS cannot write \(typeArg).") }
  let quality = Double(arg("--quality") ?? "") ?? 0
  for i in 0..<count {
    guard let img = CGImageSourceCreateImageAtIndex(src, i, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else { fail("Picture \(i + 1) could not be decoded.") }
    let props = (CGImageSourceCopyPropertiesAtIndex(src, i, nil) as? [String: Any]) ?? [:]
    var out: [CFString: Any] = [:]
    if let o = props[kCGImagePropertyOrientation as String] { out[kCGImagePropertyOrientation] = o }
    if quality > 0 { out[kCGImageDestinationLossyCompressionQuality] = quality }
    if flag("--lzw") { out[kCGImagePropertyTIFFDictionary] = [kCGImagePropertyTIFFCompression: 5] }
    if let dpi = props[kCGImagePropertyDPIWidth as String] { out[kCGImagePropertyDPIWidth] = dpi; out[kCGImagePropertyDPIHeight] = props[kCGImagePropertyDPIHeight as String] ?? dpi }
    if let gif = props[kCGImagePropertyGIFDictionary as String] as? [String: Any] {
      var g: [CFString: Any] = [:]
      if let d = gif[kCGImagePropertyGIFDelayTime as String] { g[kCGImagePropertyGIFDelayTime] = d }
      if let d = gif[kCGImagePropertyGIFUnclampedDelayTime as String] { g[kCGImagePropertyGIFUnclampedDelayTime] = d }
      if let l = gif[kCGImagePropertyGIFLoopCount as String] { g[kCGImagePropertyGIFLoopCount] = l }
      out[kCGImagePropertyGIFDictionary] = g
    }
    CGImageDestinationAddImage(dst, img, out as CFDictionary)
    for t in [kCGImageAuxiliaryDataTypeHDRGainMap, kCGImageAuxiliaryDataTypeISOGainMap] {
      if let info = CGImageSourceCopyAuxiliaryDataInfoAtIndex(src, i, t) { CGImageDestinationAddAuxiliaryDataInfo(dst, t, info) }
    }
  }
  if !CGImageDestinationFinalize(dst) { fail("macOS could not finish writing the image.") }
  return ["ok": true]
}

// Draws a picture into a plain RGBA buffer, without applying orientation, so
// two files can be compared pixel by pixel.
func pixels(_ img: CGImage, deep: Bool) -> (Data, Int, Int)? {
  let w = img.width, h = img.height
  let space = img.colorSpace ?? CGColorSpaceCreateDeviceRGB()
  let rgbSpace = space.model == .rgb ? space : (CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB())
  let bpc = deep ? 16 : 8
  let bpr = w * 4 * (bpc / 8)
  var data = Data(count: bpr * h)
  let ok = data.withUnsafeMutableBytes { (buf: UnsafeMutableRawBufferPointer) -> Bool in
    let info = CGImageAlphaInfo.premultipliedLast.rawValue | (deep ? CGBitmapInfo.byteOrder16Little.rawValue : 0)
    guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: bpc, bytesPerRow: bpr, space: rgbSpace, bitmapInfo: info) else { return false }
    ctx.interpolationQuality = .none
    ctx.setBlendMode(.copy)
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    return true
  }
  return ok ? (data, w, h) : nil
}

func compareBuffers(_ a: Data, _ b: Data, deep: Bool) -> (Bool, Double, Int) {
  if a == b { return (true, 99, 0) }
  if a.count != b.count { return (false, 0, 255) }
  var sum: Double = 0
  var maxD = 0
  a.withUnsafeBytes { (pa: UnsafeRawBufferPointer) in
    b.withUnsafeBytes { (pb: UnsafeRawBufferPointer) in
      if deep {
        let x = pa.bindMemory(to: UInt16.self), y = pb.bindMemory(to: UInt16.self)
        for i in 0..<x.count { let d = abs(Int(x[i]) - Int(y[i])) >> 8; if d > maxD { maxD = d }; sum += Double(d * d) }
      } else {
        let x = pa.bindMemory(to: UInt8.self), y = pb.bindMemory(to: UInt8.self)
        for i in 0..<x.count { let d = abs(Int(x[i]) - Int(y[i])); if d > maxD { maxD = d }; sum += Double(d * d) }
      }
    }
  }
  let n = Double(deep ? a.count / 2 : a.count)
  let mse = sum / max(n, 1)
  let psnr = mse == 0 ? 99 : 10 * log10(255 * 255 / mse)
  return (false, psnr, maxD)
}

func svgImage(_ p: String) -> CGImage? {
  guard let ns = NSImage(contentsOf: url(p)) else { return nil }
  let size = ns.size
  guard size.width > 0, size.height > 0 else { return nil }
  let scale = min(1, 2048 / max(size.width, size.height)) * 2
  var rect = CGRect(x: 0, y: 0, width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
  return ns.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

func imageCompare(_ a: String, _ b: String) -> [String: Any] {
  var imgsA: [CGImage] = [], imgsB: [CGImage] = []
  var orientA = 1, orientB = 1
  if flag("--svg") {
    guard let x = svgImage(a) else { fail("The original SVG could not be drawn.") }
    guard let y = svgImage(b) else { return ["ok": true, "identical": false, "opens": false, "reason": "The new SVG could not be drawn."] }
    imgsA = [x]; imgsB = [y]
  } else {
    guard let sa = imageSource(a) else { fail("The original could not be read.") }
    guard let sb = imageSource(b), CGImageSourceGetCount(sb) > 0 else { return ["ok": true, "identical": false, "opens": false, "reason": "The new file does not open as an image."] }
    if CGImageSourceGetCount(sa) != CGImageSourceGetCount(sb) { return ["ok": true, "identical": false, "opens": true, "reason": "The number of frames changed."] }
    for i in 0..<CGImageSourceGetCount(sa) {
      guard let x = CGImageSourceCreateImageAtIndex(sa, i, nil) else { fail("The original could not be decoded.") }
      guard let y = CGImageSourceCreateImageAtIndex(sb, i, nil) else { return ["ok": true, "identical": false, "opens": false, "reason": "Frame \(i + 1) of the new file does not decode."] }
      imgsA.append(x); imgsB.append(y)
    }
    orientA = ((CGImageSourceCopyPropertiesAtIndex(sa, 0, nil) as? [String: Any])?[kCGImagePropertyOrientation as String] as? Int) ?? 1
    orientB = ((CGImageSourceCopyPropertiesAtIndex(sb, 0, nil) as? [String: Any])?[kCGImagePropertyOrientation as String] as? Int) ?? 1
  }
  var identical = true
  var worst: Double = 99
  var maxDiff = 0
  for (x, y) in zip(imgsA, imgsB) {
    if x.width != y.width || x.height != y.height {
      return ["ok": true, "identical": false, "opens": true, "reason": "The dimensions changed (\(x.width)×\(x.height) to \(y.width)×\(y.height))."]
    }
    let deep = x.bitsPerComponent > 8 || y.bitsPerComponent > 8
    guard let (pa, _, _) = pixels(x, deep: deep), let (pb, _, _) = pixels(y, deep: deep) else { fail("The pictures could not be compared.") }
    let (same, psnr, md) = compareBuffers(pa, pb, deep: deep)
    if !same { identical = false }
    worst = min(worst, psnr)
    maxDiff = max(maxDiff, md)
  }
  return ["ok": true, "opens": true, "identical": identical, "psnr": (worst * 10).rounded() / 10, "maxDiff": maxDiff, "orientationKept": orientA == orientB, "width": imgsA.first?.width ?? 0, "height": imgsA.first?.height ?? 0, "frames": imgsA.count]
}

func writePNG(_ img: CGImage, _ output: String) {
  guard let dst = CGImageDestinationCreateWithURL(url(output) as CFURL, UTType.png.identifier as CFString, 1, nil) else { fail("Could not write the preview.") }
  CGImageDestinationAddImage(dst, img, nil)
  if !CGImageDestinationFinalize(dst) { fail("Could not write the preview.") }
}

func imagePreview(_ input: String, _ output: String) -> [String: Any] {
  let maxPx = Int(arg("--max") ?? "") ?? 1400
  if flag("--svg") {
    guard let img = svgImage(input) else { fail("This SVG could not be drawn.") }
    writePNG(img, output)
    return ["ok": true]
  }
  guard let src = imageSource(input) else { fail("This image could not be read.") }
  let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: maxPx]
  guard let img = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { fail("No preview could be made.") }
  writePNG(img, output)
  return ["ok": true, "width": img.width, "height": img.height]
}

// MARK: - PDF

func pdfDoc(_ p: String) -> PDFDocument? { PDFDocument(url: url(p)) }

func pdfInfo(_ p: String) -> [String: Any] {
  guard let doc = pdfDoc(p) else { fail("This PDF could not be opened.") }
  var found: [String] = []
  let attrs = doc.documentAttributes ?? [:]
  let map: [(PDFDocumentAttribute, String)] = [(.authorAttribute, "author"), (.creatorAttribute, "software"), (.producerAttribute, "software"), (.titleAttribute, "title"), (.subjectAttribute, "comments"), (.keywordsAttribute, "comments"), (.creationDateAttribute, "timestamps"), (.modificationDateAttribute, "timestamps")]
  for (k, name) in map where attrs[k] != nil { if !found.contains(name) { found.append(name) } }
  var sizes: [[Double]] = []
  for i in 0..<min(doc.pageCount, 400) {
    if let page = doc.page(at: i) { let b = page.bounds(for: .mediaBox); sizes.append([Double(b.width).rounded(), Double(b.height).rounded(), Double(page.rotation)]) }
  }
  return ["ok": true, "kind": "pdf", "pages": doc.pageCount, "encrypted": doc.isEncrypted, "locked": doc.isLocked, "version": "\(doc.majorVersion).\(doc.minorVersion)", "metadata": found, "sizes": sizes]
}

func pdfWrite(_ input: String, _ output: String) -> [String: Any] {
  guard let doc = pdfDoc(input) else { fail("This PDF could not be opened.") }
  if doc.isEncrypted || doc.isLocked { fail("This PDF is encrypted, so it cannot be rewritten without its password.") }
  doc.documentAttributes = [:]
  var opts: [PDFDocumentWriteOption: Any] = [:]
  if flag("--jpeg") { opts[.saveImagesAsJPEGOption] = true }
  if flag("--screen") { opts[.optimizeImagesForScreenOption] = true }
  if !doc.write(to: url(output), withOptions: opts) { fail("macOS could not write the PDF.") }
  return ["ok": true]
}

func renderPage(_ page: PDFPage, maxSide: CGFloat) -> CGImage? {
  let box = page.bounds(for: .mediaBox)
  let rot = page.rotation % 180 != 0
  let pw = rot ? box.height : box.width, ph = rot ? box.width : box.height
  guard pw > 0, ph > 0 else { return nil }
  let s = maxSide / max(pw, ph)
  let w = Int((pw * s).rounded()), h = Int((ph * s).rounded())
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
  ctx.setFillColor(CGColor(gray: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.scaleBy(x: s, y: s)
  page.draw(with: .mediaBox, to: ctx)
  return ctx.makeImage()
}

func pdfCompare(_ a: String, _ b: String) -> [String: Any] {
  guard let da = pdfDoc(a) else { fail("The original PDF could not be opened.") }
  guard let db = pdfDoc(b) else { return ["ok": true, "opens": false, "identical": false, "reason": "The new PDF does not open."] }
  if da.pageCount != db.pageCount { return ["ok": true, "opens": true, "identical": false, "reason": "The number of pages changed (\(da.pageCount) to \(db.pageCount))."] }
  let limit = Int(arg("--pages") ?? "") ?? 60
  let n = da.pageCount
  // Every page when there are few; otherwise an even spread including the first and last.
  var idx: [Int] = n <= limit ? Array(0..<n) : (0..<limit).map { Int((Double($0) / Double(limit - 1) * Double(n - 1)).rounded()) }
  idx = Array(Set(idx)).sorted()
  var identical = true, textSame = true
  var worst: Double = 99
  for i in idx {
    guard let pa = da.page(at: i), let pb = db.page(at: i) else { return ["ok": true, "opens": false, "identical": false, "reason": "Page \(i + 1) is missing."] }
    if pa.bounds(for: .mediaBox) != pb.bounds(for: .mediaBox) || pa.rotation != pb.rotation { return ["ok": true, "opens": true, "identical": false, "reason": "The size or rotation of page \(i + 1) changed."] }
    if (pa.string ?? "") != (pb.string ?? "") { textSame = false }
    guard let ia = renderPage(pa, maxSide: 900), let ib = renderPage(pb, maxSide: 900), let (xa, _, _) = pixels(ia, deep: false), let (xb, _, _) = pixels(ib, deep: false) else { return ["ok": true, "opens": false, "identical": false, "reason": "Page \(i + 1) could not be drawn."] }
    let (same, psnr, _) = compareBuffers(xa, xb, deep: false)
    if !same { identical = false }
    worst = min(worst, psnr)
  }
  return ["ok": true, "opens": true, "identical": identical, "textSame": textSame, "psnr": (worst * 10).rounded() / 10, "pagesChecked": idx.count, "pages": n]
}

func pdfPreview(_ input: String, _ output: String) -> [String: Any] {
  guard let doc = pdfDoc(input) else { fail("This PDF could not be opened.") }
  let pageNo = max(0, min(doc.pageCount - 1, (Int(arg("--page") ?? "") ?? 1) - 1))
  guard let page = doc.page(at: pageNo), let img = renderPage(page, maxSide: CGFloat(Int(arg("--max") ?? "") ?? 1400)) else { fail("This page could not be drawn.") }
  writePNG(img, output)
  return ["ok": true, "pages": doc.pageCount, "page": pageNo + 1]
}

// MARK: - Audio and video

func fourcc(_ v: FourCharCode) -> String {
  let bytes = [UInt8((v >> 24) & 255), UInt8((v >> 16) & 255), UInt8((v >> 8) & 255), UInt8(v & 255)]
  return String(bytes: bytes, encoding: .macOSRoman)?.trimmingCharacters(in: .whitespaces) ?? "\(v)"
}

func avMetadataFound(_ items: [AVMetadataItem]) -> [String] {
  var found = Set<String>()
  for it in items {
    let id = (it.identifier?.rawValue ?? "").lowercased()
    let key = (it.commonKey?.rawValue ?? "").lowercased()
    if id.contains("location") || id.contains("iso6709") || key == "location" { found.insert("location") }
    else if id.contains("make") || id.contains("model") || key == "make" || key == "model" { found.insert("camera") }
    else if id.contains("software") || id.contains("encoder") || id.contains("encodedby") || key == "software" || id.contains("tsse") || id.contains("too") { found.insert("software") }
    else if key == "creator" || key == "author" || id.contains("author") || key == "artist" || key == "publisher" || id.contains("copyright") || key == "copyrights" { found.insert("author") }
    else if id.contains("creationdate") || key == "creationdate" || id.contains("date") || id.contains("day") { found.insert("timestamps") }
    else if key == "description" || id.contains("comment") || id.contains("description") || id.contains("lyrics") { found.insert("comments") }
    else if key == "artwork" || id.contains("covr") || id.contains("apic") { found.insert("artwork") }
    else if key == "title" || key == "albumname" || id.contains("album") || id.contains("track") || id.contains("genre") { found.insert("tags") }
    else { found.insert("other") }
  }
  return Array(found).sorted()
}

func avInfo(_ p: String) -> [String: Any] {
  let asset = AVURLAsset(url: url(p), options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
  let tracks = asset.tracks
  if tracks.isEmpty { fail("macOS cannot read the audio or video in this file.") }
  var list: [[String: Any]] = []
  for t in tracks {
    var d: [String: Any] = ["type": t.mediaType.rawValue, "duration": CMTimeGetSeconds(t.timeRange.duration), "bitrate": Double(t.estimatedDataRate)]
    if let fd = t.formatDescriptions.first {
      let desc = fd as! CMFormatDescription
      d["codec"] = fourcc(CMFormatDescriptionGetMediaSubType(desc))
      if t.mediaType == .audio, let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(desc)?.pointee {
        d["sampleRate"] = asbd.mSampleRate
        d["channels"] = Int(asbd.mChannelsPerFrame)
        d["bitsPerChannel"] = Int(asbd.mBitsPerChannel)
      }
    }
    if t.mediaType == .video {
      let s = t.naturalSize.applying(t.preferredTransform)
      d["width"] = Int(abs(s.width).rounded()); d["height"] = Int(abs(s.height).rounded())
      d["fps"] = (Double(t.nominalFrameRate) * 1000).rounded() / 1000
      d["frames"] = Int((Double(t.nominalFrameRate) * CMTimeGetSeconds(t.timeRange.duration)).rounded())
    }
    list.append(d)
  }
  var meta = asset.metadata
  for t in tracks { meta += t.metadata }
  return ["ok": true, "kind": "av", "duration": CMTimeGetSeconds(asset.duration), "tracks": list, "metadata": avMetadataFound(meta), "exportable": asset.isExportable, "playable": asset.isPlayable, "presets": AVAssetExportSession.exportPresets(compatibleWith: asset)]
}

func keptMetadata(_ asset: AVAsset) -> [AVMetadataItem] {
  let keepTags = flag("--keep-tags"), keepArt = flag("--keep-art")
  if !keepTags && !keepArt { return [] }
  let tagKeys: Set<String> = ["title", "artist", "albumName", "type"]
  return asset.metadata.filter { it in
    let key = it.commonKey?.rawValue ?? ""
    let id = (it.identifier?.rawValue ?? "").lowercased()
    if keepArt && (key == "artwork" || id.hasSuffix("covr")) { return true }
    if keepTags && (tagKeys.contains(key) || id.hasSuffix("trkn") || id.hasSuffix("disk") || id.hasSuffix("gnre") || id.hasSuffix("%a9gen") || id.hasSuffix("%a9day") || id.hasSuffix("aart")) { return true }
    return false
  }
}

func avExport(_ input: String, _ output: String) -> [String: Any] {
  let asset = AVURLAsset(url: url(input), options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
  let preset = arg("--preset") ?? AVAssetExportPresetPassthrough
  // Only the picture and sound tracks are carried over, into a fresh
  // composition: the file's own metadata, and timed metadata tracks (camera
  // motion, location over time), are left behind. With the passthrough preset
  // the encoded samples are copied exactly as they are.
  let comp = AVMutableComposition()
  var carried = 0
  for t in asset.tracks where t.mediaType == .video || t.mediaType == .audio {
    guard let ct = comp.addMutableTrack(withMediaType: t.mediaType, preferredTrackID: kCMPersistentTrackID_Invalid) else { continue }
    do { try ct.insertTimeRange(t.timeRange, of: t, at: t.timeRange.start) } catch { fail("A track could not be copied: \(error.localizedDescription)") }
    ct.preferredTransform = t.preferredTransform
    ct.isEnabled = t.isEnabled
    if let l = t.languageCode { ct.languageCode = l }
    if let l = t.extendedLanguageTag { ct.extendedLanguageTag = l }
    ct.naturalTimeScale = t.naturalTimeScale
    carried += 1
  }
  if carried == 0 { fail("There is no picture or sound in this file to keep.") }
  guard let session = AVAssetExportSession(asset: comp, presetName: preset) else { fail("macOS cannot export this file with \(preset).") }
  let types: [String: AVFileType] = ["mp4": .mp4, "mov": .mov, "m4a": .m4a, "m4v": .m4v]
  guard let type = types[arg("--type") ?? "mp4"], session.supportedFileTypes.contains(type) else { fail("macOS cannot write this container from this file.") }
  session.outputURL = url(output)
  session.outputFileType = type
  session.shouldOptimizeForNetworkUse = true
  session.metadata = keptMetadata(asset)
  if flag("--sharing-filter") { session.metadataItemFilter = AVMetadataItemFilter.forSharing() }
  let done = DispatchSemaphore(value: 0)
  session.exportAsynchronously { done.signal() }
  while done.wait(timeout: .now() + 0.4) == .timedOut {
    FileHandle.standardOutput.write(Data("P \(session.progress)\n".utf8))
  }
  if session.status != .completed {
    fail("The export did not finish: \(session.error?.localizedDescription ?? "unknown reason").")
  }
  return ["ok": true]
}

func avEstimate(_ input: String) -> [String: Any] {
  let asset = AVURLAsset(url: url(input))
  guard let session = AVAssetExportSession(asset: asset, presetName: arg("--preset") ?? AVAssetExportPresetHEVCHighestQuality) else { return ["ok": true, "bytes": 0] }
  session.outputFileType = [.mp4, .mov, .m4a].first { session.supportedFileTypes.contains($0) }
  return ["ok": true, "bytes": session.estimatedOutputFileLength]
}


// Reads every encoded sample of every picture and sound track, without
// decoding, and fingerprints it. Two files whose fingerprints match carry
// exactly the same picture and sound.
func avHash(_ input: String) -> [String: Any] {
  let asset = AVURLAsset(url: url(input), options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
  guard let reader = try? AVAssetReader(asset: asset) else { fail("This file could not be read.") }
  var outs: [(AVAssetTrack, AVAssetReaderTrackOutput)] = []
  // --decode compares decoded sound instead (for lossless conversions such as WAV to FLAC).
  let decode = flag("--decode")
  let pcm: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false]
  for t in asset.tracks where (t.mediaType == .video && !decode) || t.mediaType == .audio {
    let o = AVAssetReaderTrackOutput(track: t, outputSettings: decode ? pcm : nil)
    o.alwaysCopiesSampleData = false
    if reader.canAdd(o) { reader.add(o); outs.append((t, o)) }
  }
  if !reader.startReading() { fail("This file could not be read: \(reader.error?.localizedDescription ?? "unknown reason").") }
  var list: [[String: Any]] = []
  for (t, o) in outs {
    var hasher = SHA256()
    var samples = 0, bytes = 0
    while let sb = o.copyNextSampleBuffer() {
      guard let bb = CMSampleBufferGetDataBuffer(sb) else { continue }
      let len = CMBlockBufferGetDataLength(bb)
      var data = Data(count: len)
      let st = data.withUnsafeMutableBytes { CMBlockBufferCopyDataBytes(bb, atOffset: 0, dataLength: len, destination: $0.baseAddress!) }
      if st != kCMBlockBufferNoErr { fail("A sample could not be read.") }
      hasher.update(data: data)
      samples += CMSampleBufferGetNumSamples(sb); bytes += len
    }
    let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
    list.append(["type": t.mediaType.rawValue, "samples": samples, "bytes": bytes, "sha": digest])
  }
  if reader.status == .failed { fail("Reading stopped part way: \(reader.error?.localizedDescription ?? "unknown reason").") }
  return ["ok": true, "tracks": list]
}

// MARK: - Main

let argv = CommandLine.arguments
guard argv.count >= 3 else { fail("usage: squeeze-helper <command> <input> [output] [options]") }
let cmd = argv[1], input = argv[2]
let output = argv.count >= 4 && !argv[3].hasPrefix("--") ? argv[3] : ""
func needOut() -> String { if output.isEmpty { fail("No output path.") }; return output }

let result: [String: Any]
switch cmd {
case "image-info": result = imageInfo(input)
case "image-clean": result = imageClean(input, needOut())
case "image-encode": result = imageEncode(input, needOut())
case "image-compare": result = imageCompare(input, needOut())
case "image-preview": result = imagePreview(input, needOut())
case "pdf-info": result = pdfInfo(input)
case "pdf-write": result = pdfWrite(input, needOut())
case "pdf-compare": result = pdfCompare(input, needOut())
case "pdf-preview": result = pdfPreview(input, needOut())
case "av-info": result = avInfo(input)
case "av-export": result = avExport(input, needOut())
case "av-estimate": result = avEstimate(input)
case "av-hash": result = avHash(input)
default: fail("Unknown command \(cmd).")
}
emit(result)
