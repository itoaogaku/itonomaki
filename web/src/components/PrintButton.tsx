"use client";

/** Triggers the browser's print dialog; print.css (globals.css) hides the
 *  sidebar/header/nav and forces print-safe colors so "Save as PDF" from
 *  that dialog produces a clean, single-column document. No server-side
 *  PDF rendering needed. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="PDFとして保存(印刷)"
      className="print:hidden flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
    >
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 13h10v8H7z"
        />
      </svg>
    </button>
  );
}
