// OCR cu Apple Vision (VNRecognizeTextRequest, în română), pentru expunerile de motive și ordonanțe: rulează pe Neural
// Engine, cam 0,3 s pe pagină, și nu ține GPU-ul ocupat ca MinerU. Compilat de scripts/install-ocr.sh în
// $LASTRAJA_OCR_HOME/bin/vision-ocr; îl folosește scripts/lib/pdf-text.mjs.
//
//   vision-ocr <fișier.pdf> <număr maxim de pagini> <ieșire.json>
//
// Scrie JSON: { "pages": [ { "lines": [ { "t": text, "x", "y", "w", "h": cutia, între 0 și 1, cu y de sus } ] } ] }.
// Rândurile rămân în ordinea dată de Vision; le așază pe pagină pdf-text.mjs.
import Foundation
import PDFKit
import Vision

struct Line: Encodable { let t: String; let x, y, w, h: Double }
struct Page: Encodable { let lines: [Line] }
struct Output: Encodable { let pages: [Page] }

func fail(_ message: String) -> Never {
  FileHandle.standardError.write("vision-ocr: \(message)\n".data(using: .utf8)!)
  exit(1)
}

let args = CommandLine.arguments
guard args.count == 4, let limit = Int(args[2]) else { fail("folosire: vision-ocr <fișier.pdf> <pagini> <ieșire.json>") }
guard let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else { fail("nu pot deschide \(args[1])") }

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.automaticallyDetectsLanguage = false
guard (try? request.supportedRecognitionLanguages())?.contains("ro-RO") == true else { fail("Vision nu are limba ro-RO") }
request.recognitionLanguages = ["ro-RO"]

/** Pagina randată la 300 dpi, în tonuri de gri, pe fundal alb. */
func render(_ page: PDFPage) -> CGImage? {
  let box = page.bounds(for: .mediaBox)
  let scale: CGFloat = 300.0 / 72.0
  let w = Int(box.width * scale), h = Int(box.height * scale)
  guard w > 0, h > 0, let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
  ctx.setFillColor(gray: 1, alpha: 1)
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: ctx)
  return ctx.makeImage()
}

var pages: [Page] = []
for i in 0..<min(limit, doc.pageCount) {
  guard let page = doc.page(at: i), let image = render(page) else {
    pages.append(Page(lines: []))
    continue
  }
  do {
    try VNImageRequestHandler(cgImage: image).perform([request])
  } catch {
    fail("pagina \(i + 1): \(error.localizedDescription)")
  }
  let lines = (request.results ?? []).compactMap { obs -> Line? in
    guard let text = obs.topCandidates(1).first?.string else { return nil }
    let b = obs.boundingBox
    let r = { (v: CGFloat) in (Double(v) * 10_000).rounded() / 10_000 }
    return Line(t: text, x: r(b.minX), y: r(1 - b.maxY), w: r(b.width), h: r(b.height))
  }
  pages.append(Page(lines: lines))
}

do {
  try JSONEncoder().encode(Output(pages: pages)).write(to: URL(fileURLWithPath: args[3]))
} catch {
  fail("nu pot scrie \(args[3]): \(error.localizedDescription)")
}
