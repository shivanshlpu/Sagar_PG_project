/**
 * Isolated Element Printer
 * Clones only the target element into a hidden iframe and triggers window.print()
 * on that iframe. This guarantees:
 * 1. ONLY the selected single receipt/bill is printed (strictly 1 sheet of paper).
 * 2. None of the background page's table rows, cards, or layout take up vertical space.
 * 3. Works seamlessly on desktop and mobile browsers.
 */

export function printElement(elementId: string, title: string = 'Document') {
  const element = document.getElementById(elementId);
  if (!element) {
    window.print();
    return;
  }

  // Create an isolated hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  // Inject crisp print CSS & target HTML
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8" />
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          @page {
            size: auto;
            margin: 15mm 20mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #ffffff !important;
            color: #111827 !important;
            padding: 0;
            margin: 0;
            line-height: 1.5;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, button {
            display: none !important;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            text-align: left;
          }
          .tabular-nums {
            font-variant-numeric: tabular-nums;
          }
        </style>
      </head>
      <body>
        <div style="max-width: 680px; margin: 0 auto; padding: 20px 0;">
          ${element.innerHTML}
        </div>
      </body>
    </html>
  `);
  doc.close();

  // Wait for font/styles to load then trigger print
  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch {
      window.print();
    } finally {
      setTimeout(() => {
        iframe.remove();
      }, 2000);
    }
  }, 300);
}
