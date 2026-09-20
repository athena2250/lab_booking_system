"use client";

import { useEffect, useState } from "react";
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  type Theme,
  themeAttribute,
} from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    // Drawn inline rather than pulled from an icon package: three 16px glyphs
    // are not worth a dependency, and `currentColor` lets them inherit the
    // same active/idle treatment as the nav pills beside them.
    icon: (
      <>
        <circle cx="8" cy="8" r="3.25" />
        <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: <path d="M13.5 9.6A6 6 0 0 1 6.4 2.5a6 6 0 1 0 7.1 7.1Z" />,
  },
  {
    value: "system",
    label: "System",
    icon: (
      <>
        <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.25" />
        <path d="M5.5 13.75h5" />
      </>
    ),
  },
];

/**
 * Light / dark / follow-the-device, as a segmented control in the header.
 *
 * The palette itself is pure CSS (see `globals.css`), so this only has to move
 * one attribute and remember the choice. It writes the cookie directly instead
 * of posting to a route: the repaint is instant and local, and a round trip
 * would re-render every page in the tree to change nothing but a colour.
 *
 * `current` comes from the cookie on the server, so the highlighted segment is
 * already right in the first HTML — no post-hydration flicker onto the correct
 * one, and no flash of the wrong palette, since the same cookie put
 * `data-theme` on `<html>` before this ever ran.
 */
export function ThemeToggle({ current }: { current: Theme }) {
  const [theme, setTheme] = useState(current);

  // `<html>` and the cookie both live outside React's tree, so the click only
  // moves state and this reconciles the two — which is also what keeps the
  // control honest if the state is ever set from somewhere other than a click.
  // On the first render it writes back what the server already sent, which
  // costs a no-op attribute set and refreshes the cookie's year.
  useEffect(() => {
    const attribute = themeAttribute(theme);
    if (attribute) document.documentElement.dataset.theme = attribute;
    else delete document.documentElement.dataset.theme;

    // Lax rather than Strict so the choice survives arriving from a link in a
    // staff email; there is nothing here worth protecting from a cross-site
    // read, but there is no reason to send it on subresource requests either.
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }, [theme]);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="border-edge bg-tray flex items-center gap-0.5 rounded-[10px] border p-1"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={active}
            // The glyphs alone are ambiguous — a sun could mean "brightness" —
            // so each carries its name for screen readers and on hover.
            title={`${option.label} theme`}
            className={`grid size-[30px] cursor-pointer place-items-center rounded-[7px] ${
              active ? "bg-tray-active text-fg" : "text-muted-3 hover:text-fg"
            }`}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {option.icon}
            </svg>
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
