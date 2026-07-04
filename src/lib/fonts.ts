// Fonts for the Multiple Choice question runner, per DESIGN_STYLE.md:
//  - Sora: display / headings / question prompt (geometric sans, used with restraint)
//  - IBM Plex Mono: scores, percentages, "Question X of Y" — tabular numerals as a
//    quiet signature detail.
// Scoped to the runner via .className so the rest of the app's existing type is
// untouched.
import { Sora, IBM_Plex_Mono } from "next/font/google";

export const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600"],
});
