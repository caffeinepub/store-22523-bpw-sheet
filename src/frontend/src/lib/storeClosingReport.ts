/**
 * Generates the Store Closing Report as a CSV file.
 * The structure exactly matches the uploaded template:
 * BRANCH NAME | BRANCH CODE | SKU | BARCODE | TYPE | CATEGORY | SUB CATEGORY
 * | NAME | PERISHABLE | SIZE | SUPPLIER MEASURING UNIT | SIZE DEFINITION
 * | SUPPLIER ITEM NAME | QUANTITY | BATCH NUMBER | EXPIRY DATE | EXPIRY TIME
 * | OPERATIONAL ACTIVITY STATUS | AUDIT STATUS
 *
 * QUANTITY is filled from the Store Closing column of the daily sheet.
 * Mango Smoothie is NOT included.
 *
 * If a CSV template is provided (uploaded by user), its column structure and
 * static data are used instead of the built-in defaults.
 */
import type { ComputedRow } from "./calculations";

// Static product data exactly matching the template (Mango Smoothie excluded)
const PRODUCT_STATIC: Record<
  string,
  {
    sku: string;
    barcode: string;
    type: string;
    category: string;
    subCategory: string;
    perishable: string;
    size: string;
    supplierMeasuringUnit: string;
    sizeDefinition: string;
    supplierItemName: string;
  }
> = {
  "Salad Bowl - Baggase 750 ML": {
    sku: "D11287",
    barcode: "",
    type: "Material",
    category: "Packaging",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Frozen Italian White Dough": {
    sku: "F11001",
    barcode: "",
    type: "Material",
    category: "Bakery",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Frozen Multi Grain Dough": {
    sku: "F11002",
    barcode: "",
    type: "Material",
    category: "Bakery",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Iced Green Tea - Mint Mojito 245Ml": {
    sku: "D11267",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Iced Green Tea - Peach 245Ml": {
    sku: "D11268",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Multigrain Tortilla 11.5 Inch": {
    sku: "F11080",
    barcode: "",
    type: "Material",
    category: "Bakery",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Spinach Tortilla 11.5 Inch": {
    sku: "F11079",
    barcode: "",
    type: "Material",
    category: "Bakery",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Dark Chunk Cookie": {
    sku: "F11003",
    barcode: "",
    type: "Material",
    category: "Bakery",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Double Chunk Cookie": {
    sku: "F11004",
    barcode: "",
    type: "Material",
    category: "Bakery",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Oatmeal Cookie": {
    sku: "F11005",
    barcode: "",
    type: "Material",
    category: "Bakery",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Opera Chips - Salt & Black Pepper": {
    sku: "D11299",
    barcode: "",
    type: "Material",
    category: "Snacks",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Assorted Nachos": {
    sku: "D11184",
    barcode: "",
    type: "Material",
    category: "Snacks",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Coca-Cola - 330ml Can": {
    sku: "D11233",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Coke Zero - 330ml Can": {
    sku: "D11234",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Fanta - 330ml Can": {
    sku: "D11236",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Thums up - 330ml Can": {
    sku: "D11237",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Sprite - 330ml Can": {
    sku: "D11235",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Schweppes - 500ml PET Water": {
    sku: "D11242",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Maaza - 300ml Juice": {
    sku: "D11243",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Minute Maid Pulpy Orange - 300ml Juice": {
    sku: "D11244",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Tender Coconut Water 200 ml": {
    sku: "D11202",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
  "Choco Mint 17 gm Protein Milkshake": {
    sku: "D11201",
    barcode: "",
    type: "Material",
    category: "Beverages",
    subCategory: "",
    perishable: "No",
    size: "1 Nos",
    supplierMeasuringUnit: "",
    sizeDefinition: "",
    supplierItemName: "",
  },
};

// Branch-level static data
const BRANCH_NAME = "38517";
const BRANCH_CODE = "38517";

// ---------- CSV helpers ----------

function escapeCSVCell(value: string | number): string {
  const str = String(value ?? "");
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCSV(cells: (string | number)[]): string {
  return cells.map(escapeCSVCell).join(",");
}

// ---------- Template types ----------

export type CSVTemplateRow = Record<string, string>;

export type ParsedCSVTemplate = {
  headers: string[]; // exact column names from the template
  rows: CSVTemplateRow[]; // all data rows keyed by header
  nameColumn: string; // which column contains the product name
  quantityColumn: string; // which column should receive Store Closing qty
};

/**
 * Parse a raw CSV string uploaded by the user.
 * Returns the column headers and all data rows.
 */
export function parseCSVTemplate(csvText: string): ParsedCSVTemplate | null {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return null;

  // Simple CSV parse (handles quoted fields)
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === "," && !inQuote) {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows: CSVTemplateRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row: CSVTemplateRow = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }

  // Detect name column: look for "NAME" in headers (case-insensitive)
  const nameColumn =
    headers.find((h) => h.trim().toUpperCase() === "NAME") ??
    headers.find((h) => h.trim().toUpperCase().includes("NAME")) ??
    headers[7] ?? // fallback to column 8 (index 7) per template
    headers[0];

  // Detect quantity column
  const quantityColumn =
    headers.find((h) => h.trim().toUpperCase() === "QUANTITY") ??
    headers.find((h) => h.trim().toUpperCase().includes("QUANT")) ??
    headers[13] ?? // fallback to column 14 per template
    "";

  return { headers, rows, nameColumn, quantityColumn };
}

// ---------- Main export ----------

export function downloadStoreClosingReport(
  computedRows: ComputedRow[],
  dateStr: string,
  csvTemplate?: ParsedCSVTemplate | null,
): void {
  let csvLines: string[];

  if (csvTemplate && csvTemplate.rows.length > 0) {
    // ── Template-driven mode ──────────────────────────────────────────────
    // Build a lookup: product name (lowercase) → store closing qty
    const qtyMap: Record<string, number> = {};
    for (const row of computedRows) {
      qtyMap[row.productName.toLowerCase()] = row.storeClosing;
    }

    // Header row from the template
    csvLines = [rowToCSV(csvTemplate.headers)];

    // Data rows: iterate template rows, inject QUANTITY from live data
    for (const tRow of csvTemplate.rows) {
      const productName = tRow[csvTemplate.nameColumn] ?? "";
      // Skip Mango Smoothie
      if (productName.toLowerCase().includes("mango smoothie")) continue;

      const cells = csvTemplate.headers.map((h) => {
        if (h === csvTemplate.quantityColumn) {
          // Inject quantity from live Store Closing
          const qty = qtyMap[productName.toLowerCase()];
          return qty !== undefined ? String(qty) : (tRow[h] ?? "");
        }
        return tRow[h] ?? "";
      });
      csvLines.push(rowToCSV(cells));
    }
  } else {
    // ── Built-in mode ────────────────────────────────────────────────────
    const headers = [
      "BRANCH NAME",
      "BRANCH CODE",
      "SKU",
      "BARCODE",
      "TYPE",
      "CATEGORY",
      "SUB CATEGORY",
      "NAME",
      "PERISHABLE",
      "SIZE",
      "SUPPLIER MEASURING UNIT",
      "SIZE DEFINITION",
      "SUPPLIER ITEM NAME",
      "QUANTITY",
      "BATCH NUMBER",
      "EXPIRY DATE",
      "EXPIRY TIME",
      "OPERATIONAL ACTIVITY STATUS",
      "AUDIT STATUS",
    ];

    csvLines = [rowToCSV(headers)];

    for (const row of computedRows) {
      if (row.productName.toLowerCase().includes("mango smoothie")) continue;
      const s = PRODUCT_STATIC[row.productName];
      const cells = [
        BRANCH_NAME,
        BRANCH_CODE,
        s?.sku ?? "",
        s?.barcode ?? "",
        s?.type ?? "",
        s?.category ?? "",
        s?.subCategory ?? "",
        row.productName,
        s?.perishable ?? "",
        s?.size ?? "",
        s?.supplierMeasuringUnit ?? "",
        s?.sizeDefinition ?? "",
        s?.supplierItemName ?? "",
        String(row.storeClosing),
        "", // BATCH NUMBER
        "", // EXPIRY DATE
        "", // EXPIRY TIME
        "", // OPERATIONAL ACTIVITY STATUS
        "", // AUDIT STATUS
      ];
      csvLines.push(rowToCSV(cells));
    }
  }

  const csvContent = csvLines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `store_closing_report_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
