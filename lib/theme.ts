/**
 * Which palette the app paints in.
 *
 * `"system"` is not a third palette — it means "don't pin one", and lets the
 * `color-scheme: light dark` in `globals.css` defer to the device. It is also
 * the default, so a teacher who never finds the control still gets a light app
 * on a light laptop.
 *
 * Kept free of `next/headers` so the client toggle can import it too; the
 * cookie is read in `app/layout.tsx`, which is the only place that needs to.
 */
export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/** Chosen to be legible in devtools next to the session cookie. */
export const THEME_COOKIE = "theme";

/** A year. The preference is a display nicety, so it is worth remembering for
 *  longer than a login — but not forever, and losing it costs nothing. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * A cookie value is whatever the browser sends, so treat an unknown one as no
 * preference rather than writing it onto `<html>` unchecked.
 */
export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "system";
}

/**
 * What belongs in `<html data-theme>`. `undefined` for `"system"`: the absence
 * of the attribute is what hands the decision back to the device, so writing
 * `data-theme="system"` there would pin nothing and match no CSS rule.
 */
export function themeAttribute(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
