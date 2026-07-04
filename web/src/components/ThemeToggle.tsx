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
      <svg viewBox="0 0 24 24" className="theme-icon-light-visible h-4 w-4" fill="currentColor">
        <path d="M20.742 13.045a8.088 8.088 0 0 1-2.077.273c-4.492 0-8.13-3.639-8.13-8.13 0-1.276.297-2.517.856-3.629a.5.5 0 0 0-.62-.68A10.098 10.098 0 0 0 3.5 11.9C3.5 17.47 8.03 22 13.6 22a10.098 10.098 0 0 0 8.021-3.925.5.5 0 0 0-.879-.53c-.007.01-.014.02-.02.03Z" />
      </svg>
    </button>
  );
}
