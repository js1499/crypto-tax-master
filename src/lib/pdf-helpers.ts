/**
 * PDF Helpers
 *
 * Shared utility functions for filling IRS XFA/AcroForm PDF fields.
 * Used by both crypto and securities PDF generation routes.
 */

import { PDFForm, PDFTextField, PDFCheckBox, PDFField } from "pdf-lib";

// ---------------------------------------------------------------------------
// Field lookup
// ---------------------------------------------------------------------------

/**
 * Robustly look up a form field by its short name (e.g. "f1_03[0]").
 *
 * IRS fillable PDFs are XFA/AcroForm hybrids. pdf-lib strips XFA on load,
 * leaving AcroForm fields whose fully-qualified names may or may not contain
 * the XFA path prefix. We first try an exact lookup, then fall back to
 * iterating all fields to find one whose name *ends with* the target.
 */
export function findField(form: PDFForm, shortName: string): PDFField | undefined {
  try {
    return form.getField(shortName);
  } catch {
    // Exact name not found -- search by suffix
  }

  const allFields = form.getFields();
  return allFields.find((f) => {
    const n = f.getName();
    return n === shortName || n.endsWith(`.${shortName}`) || n.includes(shortName);
  });
}

// ---------------------------------------------------------------------------
// Field setters
// ---------------------------------------------------------------------------

/**
 * Safely set a text field value. No-ops if the field is not found or is not
 * a text field.
 */
export function setTextField(form: PDFForm, shortName: string, value: string): void {
  const field = findField(form, shortName);
  if (field && field instanceof PDFTextField) {
    field.setText(value);
  }
}

/**
 * Safely check a checkbox. No-ops if the field is not found or is not a
 * checkbox.
 */
export function checkCheckbox(form: PDFForm, shortName: string): void {
  const field = findField(form, shortName);
  if (field && field instanceof PDFCheckBox) {
    field.check();
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a Date as MM/DD/YYYY (IRS standard).
 */
export function formatDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}

/**
 * Format a number for IRS forms: no dollar sign, two decimals, negative in
 * parentheses. e.g. 1234.56 -> "1,234.56", -500 -> "(500.00)"
 */
export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return amount < 0 ? `(${formatted})` : formatted;
}
