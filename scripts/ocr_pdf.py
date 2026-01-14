#!/usr/bin/env python3
"""
OCR PDF Script - Extract text from scanned PDFs using Tesseract OCR
Usage: python ocr_pdf.py <pdf_path> [--lang <language>]
Output: JSON with text and metadata
"""

import sys
import json
import os
import tempfile
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "No PDF path provided"
        }))
        sys.exit(1)

    pdf_path = sys.argv[1]
    lang = "ind+eng"  # Indonesian + English
    
    # Parse optional language argument
    if "--lang" in sys.argv:
        lang_idx = sys.argv.index("--lang")
        if lang_idx + 1 < len(sys.argv):
            lang = sys.argv[lang_idx + 1]

    if not os.path.exists(pdf_path):
        print(json.dumps({
            "success": False,
            "error": f"File not found: {pdf_path}"
        }))
        sys.exit(1)

    try:
        from pdf2image import convert_from_path
        import pytesseract
        from PIL import Image
        
        # On Windows, set tesseract path explicitly
        tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        if os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
        
        # Detect poppler path (for pdf2image)
        script_dir = Path(__file__).parent.parent  # Go up from scripts/ to project root
        poppler_path = None
        
        # Check for local poppler installation
        for poppler_dir in script_dir.glob("poppler-*/Library/bin"):
            if poppler_dir.exists():
                poppler_path = str(poppler_dir)
                break
        
        # Convert PDF pages to images
        # Higher DPI = better OCR but slower
        images = convert_from_path(
            pdf_path,
            dpi=200,
            fmt='jpeg',
            thread_count=4,
            poppler_path=poppler_path
        )
        
        total_pages = len(images)
        all_text = []
        
        for i, image in enumerate(images):
            # OCR the page
            page_text = pytesseract.image_to_string(
                image, 
                lang=lang,
                config='--psm 1'  # Automatic page segmentation with OSD
            )
            all_text.append(f"--- Page {i+1} ---\n{page_text}")
        
        full_text = "\n\n".join(all_text)
        
        # Calculate quality metrics
        words = full_text.split()
        word_count = len(words)
        char_count = len(full_text)
        avg_word_len = sum(len(w) for w in words) / max(1, word_count)
        
        # Quality score based on:
        # - Having reasonable content
        # - Average word length between 3-12 (normal range)
        # - Not too many very long "words" (OCR errors)
        long_words = sum(1 for w in words if len(w) > 25)
        long_word_ratio = long_words / max(1, word_count)
        
        if avg_word_len < 3 or avg_word_len > 15:
            quality = 0.3
        elif long_word_ratio > 0.1:
            quality = 0.5
        else:
            quality = 0.8
        
        print(json.dumps({
            "success": True,
            "text": full_text,
            "pages": total_pages,
            "chars": char_count,
            "words": word_count,
            "avgWordLen": round(avg_word_len, 2),
            "quality": quality,
            "method": "tesseract_ocr"
        }))
        
    except ImportError as e:
        print(json.dumps({
            "success": False,
            "error": f"Missing dependency: {str(e)}. Install with: pip install pdf2image pytesseract Pillow"
        }))
        sys.exit(1)
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    # Force UTF-8 output on Windows to avoid UnicodeEncodeError
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    main()
