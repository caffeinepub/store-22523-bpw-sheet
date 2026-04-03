import type { DailySheet, Product, StockEntry } from "../backend";
import { formatLongDate } from "../utils/dateUtils";

function computeRows(
  entries: StockEntry[],
  products: Product[],
): {
  product: Product;
  openingStock: number;
  receivedQty: number;
  soldQty: number;
  expectedClosing: number;
  actualClosing: number;
  difference: number;
}[] {
  return products.map((product) => {
    const entry = entries.find((e) => e.productId === product.id);
    const openingStock = entry?.openingStock ?? 0;
    const receivedQty = entry?.receivedQty ?? 0;
    const soldQty = entry?.soldQty ?? 0;
    const actualClosing = entry?.actualClosing ?? 0;
    const expectedClosing = openingStock + receivedQty - soldQty;
    const difference = expectedClosing - actualClosing;
    return {
      product,
      openingStock,
      receivedQty,
      soldQty,
      expectedClosing,
      actualClosing,
      difference,
    };
  });
}

interface PrintViewProps {
  date: string;
  sheet: DailySheet | null;
  products: Product[];
}

export default function PrintView({ date, sheet, products }: PrintViewProps) {
  const sessions = sheet?.sessions ?? [];
  const amSession = sessions.find((s) => s.sessionType === "AM");
  const pmSession = sessions.find((s) => s.sessionType === "PM");

  const printDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const sessionList = [
    amSession ? { session: amSession, key: "AM" } : null,
    pmSession ? { session: pmSession, key: "PM" } : null,
  ].filter(Boolean) as {
    session: NonNullable<typeof amSession>;
    key: string;
  }[];

  return (
    <div className="print-only print-container p-6">
      {/* Print Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Store 22523 — BPW Daily Sheet
        </h1>
        <p className="text-base text-muted-foreground mt-1">
          {formatLongDate(date)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Printed: {printDate}
        </p>
        {sheet?.isClosed && (
          <p className="text-sm font-semibold text-primary mt-2">
            &#10003; Sheet Closed
          </p>
        )}
      </div>

      {/* Print each session */}
      {sessionList.map(({ session, key }, idx) => {
        const rows = computeRows(session.entries, products);
        const totals = rows.reduce(
          (acc, r) => ({
            openingStock: acc.openingStock + r.openingStock,
            receivedQty: acc.receivedQty + r.receivedQty,
            soldQty: acc.soldQty + r.soldQty,
            expectedClosing: acc.expectedClosing + r.expectedClosing,
            actualClosing: acc.actualClosing + r.actualClosing,
            difference: acc.difference + r.difference,
          }),
          {
            openingStock: 0,
            receivedQty: 0,
            soldQty: 0,
            expectedClosing: 0,
            actualClosing: 0,
            difference: 0,
          },
        );

        return (
          <div key={key} className={idx > 0 ? "mt-8" : ""}>
            <h2 className="text-lg font-bold mb-3">
              {session.sessionType} Session
            </h2>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "11px",
              }}
            >
              <thead>
                <tr style={{ background: "#EEF2F7" }}>
                  {[
                    "Product",
                    "Unit",
                    "Opening",
                    "Received",
                    "Sold/Issued",
                    "Exp. Closing",
                    "Act. Closing",
                    "Difference",
                  ].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        border: "1px solid #D1D5DB",
                        fontWeight: 700,
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.product.id.toString()}>
                    <td
                      style={{
                        padding: "5px 8px",
                        border: "1px solid #D1D5DB",
                        fontWeight: 500,
                      }}
                    >
                      {row.product.name}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        border: "1px solid #D1D5DB",
                        color: "#6B7280",
                      }}
                    >
                      {row.product.unit}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        border: "1px solid #D1D5DB",
                      }}
                    >
                      {row.openingStock}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        border: "1px solid #D1D5DB",
                      }}
                    >
                      {row.receivedQty}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        border: "1px solid #D1D5DB",
                      }}
                    >
                      {row.soldQty}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        border: "1px solid #D1D5DB",
                      }}
                    >
                      {row.expectedClosing}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        border: "1px solid #D1D5DB",
                      }}
                    >
                      {row.actualClosing}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        border: "1px solid #D1D5DB",
                        color: row.difference < 0 ? "#B91C1C" : "inherit",
                        fontWeight: 600,
                      }}
                    >
                      {row.difference < 0
                        ? `(${Math.abs(row.difference)})`
                        : row.difference}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "#EEF2F7", fontWeight: 700 }}>
                  <td
                    colSpan={2}
                    style={{ padding: "6px 8px", border: "1px solid #D1D5DB" }}
                  >
                    TOTALS
                  </td>
                  <td
                    style={{ padding: "6px 8px", border: "1px solid #D1D5DB" }}
                  >
                    {totals.openingStock}
                  </td>
                  <td
                    style={{ padding: "6px 8px", border: "1px solid #D1D5DB" }}
                  >
                    {totals.receivedQty}
                  </td>
                  <td
                    style={{ padding: "6px 8px", border: "1px solid #D1D5DB" }}
                  >
                    {totals.soldQty}
                  </td>
                  <td
                    style={{ padding: "6px 8px", border: "1px solid #D1D5DB" }}
                  >
                    {totals.expectedClosing}
                  </td>
                  <td
                    style={{ padding: "6px 8px", border: "1px solid #D1D5DB" }}
                  >
                    {totals.actualClosing}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      border: "1px solid #D1D5DB",
                      color: totals.difference < 0 ? "#B91C1C" : "inherit",
                    }}
                  >
                    {totals.difference < 0
                      ? `(${Math.abs(totals.difference)})`
                      : totals.difference}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="mt-8 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Store 22523 — BPW Daily Sheet — Confidential
        </p>
      </div>
    </div>
  );
}
