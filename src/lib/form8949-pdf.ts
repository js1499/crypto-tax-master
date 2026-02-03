import PDFDocument from "pdfkit";
import { Form8949Entry } from "./tax-calculator";

/**
 * Generate IRS Form 8949 PDF
 * Form 8949 is used to report sales and exchanges of capital assets
 */
export function generateForm8949PDF(
  entries: Form8949Entry[],
  taxYear: number,
  taxpayerName?: string,
  ssn?: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 36, bottom: 36, left: 36, right: 36 },
      });

      const buffers: Buffer[] = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on("error", reject);

      // Page dimensions
      const pageWidth = 612; // Letter width in points
      const pageHeight = 792; // Letter height in points
      const margin = 36;
      const contentWidth = pageWidth - 2 * margin;

      // Separate short-term and long-term transactions
      const shortTerm = entries.filter((e) => e.holdingPeriod === "short");
      const longTerm = entries.filter((e) => e.holdingPeriod === "long");

      // Helper function to draw a page
      const drawFormPage = (
        part: "I" | "II",
        transactions: Form8949Entry[]
      ) => {
        // Form title
        doc.fontSize(14).font("Helvetica-Bold");
        doc.text("Form 8949", margin, margin, { align: "center" });
        doc.moveDown(0.5);

        // Tax year and taxpayer info
        doc.fontSize(10).font("Helvetica");
        doc.text(`Tax Year: ${taxYear}`, margin, doc.y);
        if (taxpayerName) {
          doc.text(`Taxpayer Name: ${taxpayerName}`, margin + 200, doc.y - 10);
        }
        if (ssn) {
          doc.text(`SSN: ${ssn}`, margin + 400, doc.y - 10);
        }
        doc.moveDown(1);

        // Part header
        doc.fontSize(12).font("Helvetica-Bold");
        doc.text(
          `Part ${part}: ${part === "I" ? "Short-term" : "Long-term"} Capital Gains and Losses`,
          margin,
          doc.y
        );
        doc.moveDown(0.5);

        // Column headers
        const startY = doc.y;
        const rowHeight = 15;
        const colWidths = {
          description: 120,
          dateAcquired: 60,
          dateSold: 60,
          proceeds: 70,
          costBasis: 70,
          adjustments: 60,
          gainLoss: 70,
        };

        doc.fontSize(8).font("Helvetica-Bold");
        let x = margin;
        doc.text("Description", x, startY, { width: colWidths.description });
        x += colWidths.description + 5;
        doc.text("Date Acquired", x, startY, { width: colWidths.dateAcquired });
        x += colWidths.dateAcquired + 5;
        doc.text("Date Sold", x, startY, { width: colWidths.dateSold });
        x += colWidths.dateSold + 5;
        doc.text("Proceeds", x, startY, { width: colWidths.proceeds });
        x += colWidths.proceeds + 5;
        doc.text("Cost Basis", x, startY, { width: colWidths.costBasis });
        x += colWidths.costBasis + 5;
        doc.text("Adjustments", x, startY, { width: colWidths.adjustments });
        x += colWidths.adjustments + 5;
        doc.text("Gain/(Loss)", x, startY, { width: colWidths.gainLoss });

        // Draw header underline
        doc.moveTo(margin, startY + 12).lineTo(pageWidth - margin, startY + 12).stroke();

        // Transaction rows
        let currentY = startY + rowHeight;
        let totalProceeds = 0;
        let totalCostBasis = 0;
        let totalGainLoss = 0;
        let rowCount = 0;

        for (const entry of transactions) {
          // Check if we need a new page
          if (currentY > pageHeight - 100 && rowCount > 0) {
            // Draw subtotals before new page
            doc.fontSize(9).font("Helvetica-Bold");
            doc.text("Subtotals:", margin, currentY + 5);
            x = margin + colWidths.description + colWidths.dateAcquired + colWidths.dateSold + 15;
            doc.text(formatCurrency(totalProceeds), x, currentY + 5, {
              width: colWidths.proceeds,
              align: "right",
            });
            x += colWidths.proceeds + 5;
            doc.text(formatCurrency(totalCostBasis), x, currentY + 5, {
              width: colWidths.costBasis,
              align: "right",
            });
            x += colWidths.costBasis + colWidths.adjustments + 10;
            doc.text(formatCurrency(totalGainLoss), x, currentY + 5, {
              width: colWidths.gainLoss,
              align: "right",
            });

            doc.addPage();
            currentY = margin + 60;
            rowCount = 0;

            // Redraw headers on new page
            doc.fontSize(8).font("Helvetica-Bold");
            x = margin;
            doc.text("Description", x, currentY - rowHeight, {
              width: colWidths.description,
            });
            x += colWidths.description + 5;
            doc.text("Date Acquired", x, currentY - rowHeight, {
              width: colWidths.dateAcquired,
            });
            x += colWidths.dateAcquired + 5;
            doc.text("Date Sold", x, currentY - rowHeight, {
              width: colWidths.dateSold,
            });
            x += colWidths.dateSold + 5;
            doc.text("Proceeds", x, currentY - rowHeight, {
              width: colWidths.proceeds,
            });
            x += colWidths.proceeds + 5;
            doc.text("Cost Basis", x, currentY - rowHeight, {
              width: colWidths.costBasis,
            });
            x += colWidths.costBasis + 5;
            doc.text("Adjustments", x, currentY - rowHeight, {
              width: colWidths.adjustments,
            });
            x += colWidths.adjustments + 5;
            doc.text("Gain/(Loss)", x, currentY - rowHeight, {
              width: colWidths.gainLoss,
            });
            doc.moveTo(margin, currentY - rowHeight + 12)
              .lineTo(pageWidth - margin, currentY - rowHeight + 12)
              .stroke();
          }

          // Draw row
          doc.fontSize(7).font("Helvetica");
          x = margin;

          // Description (truncate if too long)
          const description = entry.description.length > 30
            ? entry.description.substring(0, 27) + "..."
            : entry.description;
          doc.text(description, x, currentY, { width: colWidths.description });
          x += colWidths.description + 5;

          // Date Acquired
          const dateAcquired = formatDate(entry.dateAcquired);
          doc.text(dateAcquired, x, currentY, { width: colWidths.dateAcquired });
          x += colWidths.dateAcquired + 5;

          // Date Sold
          const dateSold = formatDate(entry.dateSold);
          doc.text(dateSold, x, currentY, { width: colWidths.dateSold });
          x += colWidths.dateSold + 5;

          // Proceeds
          doc.text(formatCurrency(entry.proceeds), x, currentY, {
            width: colWidths.proceeds,
            align: "right",
          });
          x += colWidths.proceeds + 5;

          // Cost Basis
          doc.text(formatCurrency(entry.costBasis), x, currentY, {
            width: colWidths.costBasis,
            align: "right",
          });
          x += colWidths.costBasis + 5;

          // Adjustments (code)
          doc.text(entry.code || "", x, currentY, {
            width: colWidths.adjustments,
          });
          x += colWidths.adjustments + 5;

          // Gain/(Loss)
          const gainLossStr = formatCurrency(entry.gainLoss);
          doc.text(gainLossStr, x, currentY, {
            width: colWidths.gainLoss,
            align: "right",
          });

          // Accumulate totals
          totalProceeds += entry.proceeds;
          totalCostBasis += entry.costBasis;
          totalGainLoss += entry.gainLoss;

          currentY += rowHeight;
          rowCount++;
        }

        // Draw final totals
        doc.fontSize(9).font("Helvetica-Bold");
        doc.text("Totals:", margin, currentY + 5);
        x = margin + colWidths.description + colWidths.dateAcquired + colWidths.dateSold + 15;
        doc.text(formatCurrency(totalProceeds), x, currentY + 5, {
          width: colWidths.proceeds,
          align: "right",
        });
        x += colWidths.proceeds + 5;
        doc.text(formatCurrency(totalCostBasis), x, currentY + 5, {
          width: colWidths.costBasis,
          align: "right",
        });
        x += colWidths.costBasis + colWidths.adjustments + 10;
        doc.text(formatCurrency(totalGainLoss), x, currentY + 5, {
          width: colWidths.gainLoss,
          align: "right",
        });

        // Summary section
        currentY += 30;
        doc.fontSize(10).font("Helvetica-Bold");
        doc.text("Summary:", margin, currentY);
        currentY += 15;
        doc.fontSize(9).font("Helvetica");
        doc.text(`Total Proceeds: ${formatCurrency(totalProceeds)}`, margin + 20, currentY);
        currentY += 12;
        doc.text(`Total Cost Basis: ${formatCurrency(totalCostBasis)}`, margin + 20, currentY);
        currentY += 12;
        doc.text(
          `Net Gain/(Loss): ${formatCurrency(totalGainLoss)}`,
          margin + 20,
          currentY
        );
      };

      // Generate Part I (Short-term) if there are short-term transactions
      if (shortTerm.length > 0) {
        drawFormPage("I", shortTerm);
        if (longTerm.length > 0) {
          doc.addPage();
        }
      }

      // Generate Part II (Long-term) if there are long-term transactions
      if (longTerm.length > 0) {
        drawFormPage("II", longTerm);
      }

      // If no transactions, create a page with message
      if (entries.length === 0) {
        doc.fontSize(12).font("Helvetica");
        doc.text("No taxable events for this tax year.", margin, margin + 100);
        doc.text(
          "Form 8949 is not required if you have no capital gains or losses.",
          margin,
          margin + 130
        );
      }

      // Add footer to all pages
      const addFooter = () => {
        try {
          const pages = doc.bufferedPageRange();
          if (pages && pages.count > 0) {
            for (let i = pages.start; i <= pages.count; i++) {
              doc.switchToPage(i);
              doc.fontSize(8).font("Helvetica");
              doc.text(
                `Page ${i + 1} of ${pages.count} | Generated by Crypto Tax Calculator`,
                margin,
                pageHeight - 20,
                { align: "center", width: contentWidth }
              );
            }
          }
        } catch (error) {
          // Footer addition failed, but don't fail the whole PDF
          console.error("Error adding footer:", error);
        }
      };

      // BUG-012 fix: Add footer BEFORE doc.end() since "end" event fires after finalization
      addFooter();

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Format date as MM/DD/YYYY for Form 8949
 */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount);

  if (amount < 0) {
    return `(${formatted})`;
  }
  return formatted;
}
