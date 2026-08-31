/**
 * Générateur de fichiers e-books de démonstration (`books/`).
 *
 * - EPUB 3 valides construits avec `yazl` : l'entrée `mimetype` est ajoutée EN
 *   PREMIER et SANS compression (exigence du format EPUB), puis
 *   `META-INF/container.xml` et `OEBPS/content.opf` / `content.xhtml`.
 * - PDF 1.4 minimaux (une page, titre en texte) pour les produits `pdf`.
 *
 * Les données proviennent de `scripts/seed-data.ts` (source unique du catalogue).
 *
 * Usage : npm run books:generate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ZipFile } from "yazl";
import { SEED_PRODUCTS } from "./seed-data";

const BOOKS_DIR = path.resolve(process.cwd(), "books");
const MANIFEST_FILE = path.join(BOOKS_DIR, "manifest.json");

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapePdfString(value: string): string {
  // WinAnsi : on conserve les octets Latin-1 (é, è, ç… sont bien mappés).
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function escapePdfText(value: string): Buffer {
  return Buffer.from(escapePdfString(value), "latin1");
}

/** Construit un EPUB 3 minimal mais VALIDE (mimetype en premier, non compressé). */
function buildEpub(input: {
  slug: string;
  title: string;
  author: string;
  language: string;
}): Promise<Buffer> {
  const zip = new ZipFile();
  const result: Buffer[] = [];

  zip.addBuffer(Buffer.from("application/epub+zip", "utf8"), "mimetype", { compress: false });
  zip.addBuffer(
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
      "utf8",
    ),
    "META-INF/container.xml",
  );
  zip.addBuffer(
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${input.slug}</dc:identifier>
    <dc:title>${escapeXml(input.title)}</dc:title>
    <dc:creator>${escapeXml(input.author)}</dc:creator>
    <dc:language>${escapeXml(input.language)}</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>`,
      "utf8",
    ),
    "OEBPS/content.opf",
  );
  zip.addBuffer(
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(input.language)}">
  <head>
    <title>${escapeXml(input.title)}</title>
  </head>
  <body>
    <h1>${escapeXml(input.title)}</h1>
    <p>${escapeXml(input.author)}</p>
    <p>Exemplaire de démonstration — Biblio.</p>
  </body>
</html>`,
      "utf8",
    ),
    "OEBPS/content.xhtml",
  );

  zip.outputStream.on("data", (chunk: Buffer) => result.push(Buffer.from(chunk)));
  zip.end();

  return new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("end", () => resolve(Buffer.concat(result)));
    zip.outputStream.on("error", reject);
  });
}

/** Construit un PDF 1.4 minimal (une page, titre affiché). */
function buildPdf(input: { title: string; author: string }): Buffer {
  const text = escapePdfText(input.title);
  const content = [
    "BT",
    "/F1 24 Tf",
    "72 720 Td",
    `(${text.toString("latin1")}) Tj`,
    "/F1 12 Tf",
    "0 -30 Td",
    `(${escapePdfText(input.author).toString("latin1")}) Tj`,
    "ET",
  ].join("\n");
  const stream = Buffer.from(content, "latin1");

  const objects: Buffer[] = [];
  objects.push(Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1")); // 1
  objects.push(Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "latin1")); // 2
  objects.push(
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>",
      "latin1",
    ),
  ); // 3
  objects.push(
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "latin1",
    ),
  ); // 4
  objects.push(
    Buffer.from(`<< /Length ${stream.length} >>\nstream\n${content}\nendstream`, "latin1"),
  ); // 5

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${obj.toString("latin1")}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) {
    body += `${String(o).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, "latin1");
}

async function main() {
  mkdirSync(BOOKS_DIR, { recursive: true });
  let epubCount = 0;
  let pdfCount = 0;

  for (const p of SEED_PRODUCTS) {
    const file = path.join(BOOKS_DIR, `${p.slug}.${p.format}`);
    const data = p.format === "epub" ? await buildEpub(p) : buildPdf(p);
    writeFileSync(file, data);
    if (p.format === "epub") epubCount += 1;
    else pdfCount += 1;
    console.log(`✓ ${p.slug}.${p.format} (${data.length} octets)`);
  }

  console.log(`\n✓ ${epubCount} EPUB + ${pdfCount} PDF générés dans ./books.`);

  // Manifeste (slug → titre/format) consommé par scripts/validate-books.py.
  writeFileSync(
    MANIFEST_FILE,
    JSON.stringify(
      SEED_PRODUCTS.map((p) => ({
        slug: p.slug,
        title: p.title,
        author: p.author,
        format: p.format,
      })),
      null,
      2,
    ),
  );
  console.log(`✓ ${path.basename(MANIFEST_FILE)} écrit pour la validation.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
