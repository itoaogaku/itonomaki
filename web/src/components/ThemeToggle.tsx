"use client";

// Both icons are always in the DOM; CSS (see globals.css) shows only the one
// matching the current [data-theme] attribute. That attribute is set
// synchronously by the inline script in layout.tsx before hydration, so
// there's no client-only state/effect needed here and no hydration mismatch.
function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  window.localStorage.setItem("theme", next);
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="ライト/ダークモードを切り替え"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)]"
    >
      {/* sun (circle + rays): shown while dark, as the "switch to light" target icon */}
      <svg
        viewBox="0 0 24 24"
        className="theme-icon-dark-visible h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path
          strokeLinecap="round"
          d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
        />
      </svg>
      {/* crescent moon: shown while light, as the "switch to dark" target icon */}
      <svg
        viewBox="0 0 24 24"
        className="theme-icon-light-visible h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    </button>
  );
}
