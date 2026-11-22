import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export interface TicketData {
  bookingId: string;
  pnr: string;
  bookedBy: string;
  busName: string;
  busType: string;
  from: string;
  to: string;
  departureTime: Date;
  arrivalTime: Date;
  totalFare: string; // e.g. "2400.00"
  passengers: { seatNumber: string; passengerName: string; fare: string }[];
}

const BRAND = "#4F46E5";
const INK = "#111827";
const MUTED = "#6B7280";

function formatIst(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export async function buildTicketPdf(t: TicketData): Promise<Buffer> {
  const qr = await QRCode.toBuffer(t.bookingId, { width: 220, margin: 1 });

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;

  // Header bar
  doc.rect(0, 0, doc.page.width, 90).fill(BRAND);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(28).text("BusGo", left, 28);
  doc.font("Helvetica").fontSize(12).text("E-TICKET", left, 36, { width, align: "right" });

  // PNR + QR
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text("PNR", left, 115);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text(t.pnr, left, 130);
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text("Booked by", left, 165);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(13).text(t.bookedBy, left, 180);
  doc.image(qr, right - 110, 105, { width: 110 });

  // Journey
  doc.moveTo(left, 235).lineTo(right, 235).strokeColor("#E5E7EB").stroke();
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text(`${t.from}  >  ${t.to}`, left, 250);
  doc.fillColor(MUTED).font("Helvetica").fontSize(11).text(`${t.busName}  |  ${t.busType.replace("_", " ")}`, left, 282);

  doc.fillColor(MUTED).fontSize(10).text("DEPARTURE", left, 315);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(13).text(formatIst(t.departureTime), left, 330);
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text("ARRIVAL", left + 270, 315);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(13).text(formatIst(t.arrivalTime), left + 270, 330);

  // Passenger table
  let y = 380;
  doc.rect(left, y, width, 24).fill("#F3F4F6");
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(10);
  doc.text("SEAT", left + 10, y + 7);
  doc.text("PASSENGER", left + 90, y + 7);
  doc.text("FARE", left, y + 7, { width: width - 10, align: "right" });
  y += 32;

  doc.font("Helvetica").fontSize(12).fillColor(INK);
  for (const p of t.passengers) {
    doc.text(p.seatNumber, left + 10, y);
    doc.text(p.passengerName, left + 90, y);
    doc.text(`Rs. ${p.fare}`, left, y, { width: width - 10, align: "right" });
    y += 24;
  }

  // Total
  doc.moveTo(left, y + 4).lineTo(right, y + 4).strokeColor("#E5E7EB").stroke();
  doc.font("Helvetica-Bold").fontSize(13).text("Total paid", left + 10, y + 16);
  doc.text(`Rs. ${t.totalFare}`, left, y + 16, { width: width - 10, align: "right" });

  // Footer
  doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(
    "Please carry a valid photo ID. Show this ticket (printed or on your phone) at boarding.",
    left,
    doc.page.height - 70,
    { width, align: "center" }
  );

  doc.end();
  return finished;
}