# assets

TrueType copies of the two site fonts, read by `lib/og.tsx` to draw the Open Graph card. They are
here because satori (behind `next/og`) cannot read the woff2 files `next/font/google` downloads, and
this machine has no font tooling to convert one.

- `JetBrainsMono-Regular.ttf`, `JetBrainsMono-Bold.ttf` — JetBrains Mono, SIL Open Font License 1.1,
  <https://github.com/JetBrains/JetBrainsMono>
- `SpaceGrotesk-Bold.ttf` — Space Grotesk, SIL Open Font License 1.1,
  <https://github.com/floriankarsten/space-grotesk>

Both licences allow redistribution with this notice. Downloaded from the Google Fonts CDN.

Images:
- `readme-board.png` — capture of `/demo` (generated data) at 1280 wide, 2x, cropped to the board; the README screenshot.
- `social-preview.png` — 1280×640 in the Open Graph card look, uploaded as the GitHub repo's social preview.
