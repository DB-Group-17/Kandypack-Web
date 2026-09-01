/**
 * @file lib/export.ts
 * @description Synchronous report export service for Kandypack Logistics Platform.
 * Generates direct CSV and on-demand PDF downloads for management reports.
 *
 * Owned by Member 5. Follows Docs/03_architecture.md §11 and Docs/05_api-and-pages.md §A9.
 * Version 1 exports are synchronous and returned directly to the requester without persistence.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Validated report types supported across the system.
 */
export type ReportType =
  | "quarterly-sales"
  | "most-ordered-items"
  | "city-route-sales"
  | "driver-assistant-hours"
  | "truck-usage"
  | "customer-history";

/**
 * Human-readable titles mapped to each report type.
 */
export const REPORT_TITLES: Record<ReportType, string> = {
  "quarterly-sales": "Quarterly Sales Report",
  "most-ordered-items": "Most Ordered Items Report",
  "city-route-sales": "City & Route Sales Breakdown",
  "driver-assistant-hours": "Driver & Assistant Working Hours",
  "truck-usage": "Monthly Truck Usage Analysis",
  "customer-history": "Customer Order & Delivery History",
};

/**
 * Table structure definition for exporting reports.
 */
export interface ReportTableData {
  /** Array of column header labels */
  headers: string[];
  /** 2D array of row cells formatted as strings/numbers */
  rows: (string | number | null | undefined)[][];
  /** Optional summary/footer row values (e.g. totals) */
  footer?: (string | number | null | undefined)[];
}

/**
 * Options for configuring PDF generation.
 */
export interface PdfExportOptions {
  /** Report title shown in the document header */
  title: string;
  /** Subtitle or filter description (e.g., "Year: 2026, Quarter: Q3") */
  subtitle?: string;
  /** Name or ID of the user requesting the report */
  generatedBy?: string;
  /** Orientation of the document ('portrait' | 'landscape') */
  orientation?: "portrait" | "landscape";
}

/* =========================================================================
   1. SYNCHRONOUS CSV FORMATTER
   Converts tabular report data into standard RFC 4180 CSV strings.
   ========================================================================= */

/**
 * Escapes a single cell value for CSV formatting.
 * Quotes values containing commas, double quotes, or newlines.
 *
 * @param {string | number | null | undefined} value - Raw cell value.
 * @returns {string} Escaped CSV string.
 */
function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  if (stringValue.includes('"') || stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes("\r")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Converts report table data into a formatted CSV string.
 *
 * @param {ReportTableData} data - Column headers, row values, and optional footer.
 * @returns {string} Formatted CSV text.
 */
export function formatAsCsv(data: ReportTableData): string {
  const lines: string[] = [];

  // Header row
  lines.push(data.headers.map(escapeCsvCell).join(","));

  // Data rows
  for (const row of data.rows) {
    lines.push(row.map(escapeCsvCell).join(","));
  }

  // Footer row if present
  if (data.footer && data.footer.length > 0) {
    lines.push(data.footer.map(escapeCsvCell).join(","));
  }

  return lines.join("\r\n");
}

/* =========================================================================
   2. SYNCHRONOUS PDF GENERATOR
   Renders report data into PDF bytes matching Kandypack's visual standards.
   ========================================================================= */

/**
 * Generates an on-demand PDF report buffer synchronously using jsPDF and autoTable.
 *
 * @param {ReportTableData} tableData - Table headers, rows, and footer.
 * @param {PdfExportOptions} options - PDF layout and metadata options.
 * @returns {Buffer} Raw binary PDF buffer ready for HTTP streaming.
 */
export function generatePdfReport(
  tableData: ReportTableData,
  options: PdfExportOptions
): Buffer {
  const doc = new jsPDF({
    orientation: options.orientation || "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryColor = [65, 50, 199] as [number, number, number]; // #4132C7
  const darkTextColor = [18, 28, 44] as [number, number, number]; // #121C2C
  const mutedTextColor = [71, 69, 84] as [number, number, number]; // #474554

  // --- Document Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...primaryColor);
  doc.text("KANDYPACK LOGISTICS", 14, 18);

  doc.setFontSize(14);
  doc.setTextColor(...darkTextColor);
  doc.text(options.title, 14, 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...mutedTextColor);

  let headerY = 32;
  if (options.subtitle) {
    doc.text(options.subtitle, 14, headerY);
    headerY += 5;
  }

  const generatedDateStr = `Generated: ${new Date().toISOString().replace("T", " ").substring(0, 19)} UTC`;
  const generatedByStr = options.generatedBy ? ` | By: ${options.generatedBy}` : "";
  doc.text(`${generatedDateStr}${generatedByStr}`, 14, headerY);

  // Divider line
  doc.setDrawColor(200, 196, 215); // #C8C4D7 outline-variant
  doc.setLineWidth(0.5);
  doc.line(14, headerY + 4, pageWidth - 14, headerY + 4);

  // --- Table Generation via autoTable ---
  const bodyRows = tableData.rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? "-" : String(cell)))
  );

  const footRows = tableData.footer
    ? [tableData.footer.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))]
    : undefined;

  autoTable(doc, {
    startY: headerY + 8,
    head: [tableData.headers],
    body: bodyRows,
    foot: footRows,
    theme: "striped",
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      textColor: darkTextColor,
      fontSize: 8.5,
      cellPadding: 2.5,
    },
    footStyles: {
      fillColor: [240, 243, 255], // #F0F3FF
      textColor: darkTextColor,
      fontSize: 9,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [249, 249, 255], // #F9F9FF
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      // Footer page numbering
      const totalPages = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(...mutedTextColor);
      doc.text(
        `Page ${data.pageNumber} of ${totalPages}`,
        pageWidth - 14,
        doc.internal.pageSize.getHeight() - 10,
        { align: "right" }
      );
    },
  });

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

/* =========================================================================
   3. HTTP RESPONSE HELPERS
   Constructs standard Next.js Response objects with download headers.
   ========================================================================= */

/**
 * Creates a standard HTTP response for CSV file downloads.
 *
 * @param {string} csvContent - Formatted CSV string.
 * @param {string} filename - Desired download filename (e.g. `quarterly-sales.csv`).
 * @returns {Response} Next.js / Fetch API Response with text/csv content type.
 */
export function createCsvResponse(csvContent: string, filename: string): Response {
  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

/**
 * Creates a standard HTTP response for PDF file downloads.
 *
 * @param {Buffer} pdfBuffer - Binary PDF buffer.
 * @param {string} filename - Desired download filename (e.g. `quarterly-sales.pdf`).
 * @returns {Response} Next.js / Fetch API Response with application/pdf content type.
 */
export function createPdfResponse(pdfBuffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length.toString(),
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
