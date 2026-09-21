import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

export interface BillItem {
  description: string;
  amountPaise: number;
}

export interface BillData {
  invoiceNumber: string;
  month: string;
  tenantName: string;
  roomNumber: string;
  dueDate: string;
  items: BillItem[];
  totalPaise: number;
  pgName?: string;
  pgAddress?: string;
}

export function formatInr(paise: number): string {
  return `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export async function generateBillPdf(bill: BillData): Promise<Buffer> {
  const printer = new PdfPrinter(fonts);

  const docDefinition: TDocumentDefinitions = {
    content: [
      { text: bill.pgName || 'PG Management Platform', style: 'header' },
      { text: bill.pgAddress || '123 Main Street, City', style: 'subheader' },
      { text: '\n' },
      {
        columns: [
          {
            width: '*',
            text: [
              { text: 'Bill To:\n', style: 'bold' },
              `${bill.tenantName}\n`,
              `Room: ${bill.roomNumber}\n`,
            ],
          },
          {
            width: 'auto',
            alignment: 'right',
            text: [
              { text: `Invoice #: ${bill.invoiceNumber}\n`, style: 'bold' },
              `Month: ${bill.month}\n`,
              `Due Date: ${bill.dueDate}\n`,
            ],
          },
        ],
      },
      { text: '\n' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 120],
          body: [
            [
              { text: 'Description', style: 'tableHeader' },
              { text: 'Amount', style: 'tableHeader', alignment: 'right' },
            ],
            ...bill.items.map(item => [
              item.description,
              { text: formatInr(item.amountPaise), alignment: 'right' },
            ]),
            [
              { text: 'Total Due', style: 'tableTotal' },
              { text: formatInr(bill.totalPaise), style: 'tableTotal', alignment: 'right' },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
      { text: '\n\n' },
      {
        text: 'Payment Instructions: Please complete payment via UPI / Bank Transfer and submit screenshot in the tenant portal.',
        style: 'notes',
      },
    ],
    styles: {
      header: { fontSize: 20, bold: true, color: '#0F766E' },
      subheader: { fontSize: 10, color: '#5C6370' },
      bold: { bold: true },
      tableHeader: { bold: true, fontSize: 11, color: '#1A1D23', fillColor: '#F1F3F6' },
      tableTotal: { bold: true, fontSize: 12, color: '#0F766E' },
      notes: { fontSize: 9, italics: true, color: '#5C6370' },
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: '#1A1D23',
    },
  };

  return new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', (err: Error) => reject(err));
    pdfDoc.end();
  });
}
