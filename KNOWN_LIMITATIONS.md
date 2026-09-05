# Known Limitations — V1.0.0

- Chrome-protected pages, including `chrome://` pages and the Chrome Web Store, do not allow normal content-script capture.
- OCR accuracy depends on image clarity, contrast, subtitle styling, and scaling. Small amounts of editable OCR noise may remain.
- AI analysis requires internet access, a valid user-provided DeepSeek API key, and availability of the configured DeepSeek endpoint and model.
- All saved records and settings are local to the current Chrome profile. V1 has no account, cloud sync, backup service, or cross-device transfer.
- HTML is the only export format. PDF is produced through the browser's Print / Save as PDF flow; direct PDF generation is not included.
- Export pagination uses browser print layout behavior and simple local content-length rules rather than a dedicated pagination engine.
- Library search is local text matching. V1 does not provide embedding or semantic search.
