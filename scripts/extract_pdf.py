#!/usr/bin/env python3
"""
PDF text extraction using pdfplumber
Better quality than pdf-parse for complex layouts
"""

import sys
import json
import pdfplumber

def extract_text(pdf_path: str) -> dict:
    """Extract text from PDF with layout preservation"""
    try:
        text_parts = []
        total_pages = 0
        
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            
            for page in pdf.pages:
                # Extract text with layout preservation
                page_text = page.extract_text(
                    x_tolerance=3,
                    y_tolerance=3,
                    layout=True,  # Preserve layout structure
                    x_density=7.25,
                    y_density=13
                )
                
                if page_text:
                    text_parts.append(page_text)
        
        full_text = '\n\n'.join(text_parts)
        
        # Calculate quality metrics
        words = full_text.split()
        avg_word_length = sum(len(w) for w in words) / len(words) if words else 0
        long_words = [w for w in words if len(w) > 20]
        
        return {
            "success": True,
            "text": full_text,
            "pages": total_pages,
            "chars": len(full_text),
            "quality": {
                "avgWordLength": round(avg_word_length, 2),
                "longWordCount": len(long_words),
                "wordCount": len(words)
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "text": ""
        }

if __name__ == "__main__":
    # Force UTF-8 output on Windows to avoid UnicodeEncodeError
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No file path provided"}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    result = extract_text(pdf_path)
    print(json.dumps(result, ensure_ascii=False))

