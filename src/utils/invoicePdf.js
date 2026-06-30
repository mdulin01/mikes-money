// Builds a clean, activity-itemized consulting invoice PDF in the browser (jsPDF).
// Used by the Business tab to (a) download the invoice and (b) hand the bytes to
// /api/invoice-draft, which attaches it to a Gmail draft.
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

applyPlugin(jsPDF); // adds doc.autoTable(); robust across the lib's CJS/ESM builds

const INK = [17, 17, 17];
const MUTED = [102, 102, 102];
const ACCENT = [15, 118, 110];
const ACCENT_BG = [240, 253, 250];

const dollars = (n) => '$' + Number(n || 0).toLocaleString('en-US');

// data: { invoiceNo, period, issued, billTo:{name,attn}, weeks:[{label,items:[{desc,hours}]}], rate }
// Returns the jsPDF doc plus computed totals.
export function buildInvoiceDoc(data) {
  const rate = Number(data.rate) || 0;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const M = 64; // left/right margin

  // ── Header ──
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...INK);
  doc.text('Michael Dulin, MD', M, 64);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED);
  doc.text('Consulting Services', M, 80);
  doc.text('704-641-2157  ·  mdulin@gmail.com', M, 94);

  // ── Meta (right) + Bill-to (left) ──
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK);
  doc.text('Bill to:', M, 126);
  doc.setFont('helvetica', 'normal').setFontSize(11);
  doc.text(data.billTo?.name || '', M, 142);
  if (data.billTo?.attn) doc.text(data.billTo.attn, M, 156);

  const RX = 612 - M; // right edge
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
  doc.text(`INVOICE #${data.invoiceNo}`, RX, 126, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...MUTED);
  doc.text(`Period: ${data.period}`, RX, 140, { align: 'right' });
  doc.text(`Issued: ${data.issued}`, RX, 153, { align: 'right' });
  doc.text('Terms: Net 30', RX, 166, { align: 'right' });

  // ── Line items ──
  const body = [];
  let totalHours = 0, totalAmt = 0;
  for (const wk of data.weeks || []) {
    body.push([{ content: wk.label, colSpan: 4, _kind: 'week' }]);
    let wkHours = 0, wkAmt = 0;
    for (const it of wk.items || []) {
      const override = it.amtOverride != null;
      const hrs = Number(it.hours) || 0;
      const amt = override ? Number(it.amtOverride) : hrs * rate;
      wkHours += hrs; wkAmt += amt; totalHours += hrs; totalAmt += amt;
      body.push([it.desc, override ? '—' : String(hrs), override ? '—' : dollars(rate), dollars(amt)]);
    }
    body.push([
      { content: 'Subtotal', _kind: 'sub' },
      { content: String(wkHours), _kind: 'sub' },
      { content: '', _kind: 'sub' },
      { content: dollars(wkAmt), _kind: 'sub' },
    ]);
  }
  body.push([
    { content: 'Total', _kind: 'total' },
    { content: `${totalHours} hrs`, _kind: 'total' },
    { content: '', _kind: 'total' },
    { content: dollars(totalAmt), _kind: 'total' },
  ]);

  doc.autoTable({
    startY: 190,
    margin: { left: M, right: M },
    head: [['Description', 'Hours', 'Rate', 'Amount']],
    body,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 5, textColor: INK, lineColor: [221, 221, 221], lineWidth: 0 },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5, halign: 'left' },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right', cellWidth: 70 },
      2: { halign: 'right', cellWidth: 64 },
      3: { halign: 'right', cellWidth: 84 },
    },
    didParseCell: (h) => {
      const k = h.cell.raw && h.cell.raw._kind;
      if (k === 'week') {
        h.cell.styles.fillColor = ACCENT_BG;
        h.cell.styles.textColor = ACCENT;
        h.cell.styles.fontStyle = 'bold';
      } else if (k === 'sub') {
        h.cell.styles.textColor = MUTED;
        h.cell.styles.fontStyle = 'italic';
        h.cell.styles.lineWidth = { top: 0.4, bottom: 0, left: 0, right: 0 };
      } else if (k === 'total') {
        h.cell.styles.fontStyle = 'bold';
        h.cell.styles.fontSize = 12;
        h.cell.styles.lineWidth = { top: 1, bottom: 0, left: 0, right: 0 };
        h.cell.styles.lineColor = INK;
      }
    },
  });

  let y = doc.lastAutoTable.finalY + 24;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED);
  doc.text(`Rate: ${dollars(rate)}/hr. Contract minimum 10 hr/week; billed at actual hours worked.`, M, y);
  doc.text('Payment due within 30 days. Thank you for the opportunity.', M, y + 14);

  return { doc, totalHours, totalAmt };
}

export function invoiceFilename(data) {
  const slug = String(data.period || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Dulin-Invoice-${data.invoiceNo}-${slug}.pdf`;
}

// Trigger a browser download.
export function downloadInvoice(data) {
  const { doc } = buildInvoiceDoc(data);
  doc.save(invoiceFilename(data));
}

// Base64 (no data: prefix) for emailing as an attachment.
export function invoiceBase64(data) {
  const { doc, totalHours, totalAmt } = buildInvoiceDoc(data);
  const uri = doc.output('datauristring'); // data:application/pdf;filename=..;base64,XXXX
  return { base64: uri.split('base64,')[1], totalHours, totalAmt, filename: invoiceFilename(data) };
}
