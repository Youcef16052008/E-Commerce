#!/usr/bin/env python3
"""
Validation stricte des e-books de démonstration (./books).

- EPUB : `mimetype` = PREMIÈRE entrée, NON compressée (stored), contenu exact
  `application/epub+zip` ; intégrité ZIP (`testzip`) ; `META-INF/container.xml`
  ; `OEBPS/content.xhtml` ; le titre attendu (manifest.json) est présent dans
  `content.xhtml`.
- PDF  : signature `%PDF-`, fin `%%EOF`, contenu texte présent.

Usage : python3 scripts/validate-books.py
"""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS = ROOT / "books"
MANIFEST = BOOKS / "manifest.json"

FAILURES: list[str] = []


def check(condition: bool, message: str) -> None:
    if condition:
        print(f"  ✓ {message}")
    else:
        print(f"  ✗ {message}")
        FAILURES.append(message)


def validate_epub(file: Path, expected_title: str) -> None:
    print(f"EPUB {file.name}")
    with zipfile.ZipFile(file) as zf:
        bad = zf.testzip()
        check(bad is None, f"intégrité ZIP (aucune entrée corrompue) [{'>' + str(bad) if bad else ''}]")

        infos = zf.infolist()
        check(len(infos) > 0 and infos[0].filename == "mimetype", "mimetype est la PREMIÈRE entrée")
        if infos and infos[0].filename == "mimetype":
            check(infos[0].compress_type == zipfile.ZIP_STORED, "mimetype NON compressée (stored)")
            check(zf.read("mimetype") == b"application/epub+zip", "mimetype = application/epub+zip")

        names = set(zf.namelist())
        check("META-INF/container.xml" in names, "META-INF/container.xml présente")

        container = zf.read("META-INF/container.xml").decode("utf-8")
        check('full-path="OEBPS/content.opf"' in container, "container.xml → OEBPS/content.opf")

        check("OEBPS/content.xhtml" in names, "OEBPS/content.xhtml présente")
        content = zf.read("OEBPS/content.xhtml").decode("utf-8")
        check(expected_title in content, f"titre attendu présent dans content.xhtml (« {expected_title} »)")

        check("OEBPS/content.opf" in names, "OEBPS/content.opf présente")


def validate_pdf(file: Path, expected_title: str) -> None:
    print(f"PDF  {file.name}")
    data = file.read_bytes()
    check(data.startswith(b"%PDF-"), "signature %PDF-")
    check(data.rstrip().endswith(b"%%EOF"), "fin %%EOF")
    check(expected_title.encode("latin-1") in data, f"titre attendu présent dans le flux (« {expected_title} »)")


def main() -> int:
    if not MANIFEST.exists():
        print(f"✗ {MANIFEST} introuvable — lancez d'abord : npm run books:generate")
        return 1

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    print(f"Validation de {len(manifest)} fichiers…\n")

    for item in manifest:
        slug, fmt, title = item["slug"], item["format"], item["title"]
        file = BOOKS / f"{slug}.{fmt}"
        if not file.exists():
            check(False, f"{file.name} manquant")
            continue
        if fmt == "epub":
            validate_epub(file, title)
        else:
            validate_pdf(file, title)
        print()

    if FAILURES:
        print(f"✗ {len(FAILURES)} échec(s) de validation.")
        return 1
    print("✓ Tous les fichiers e-books sont valides.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
