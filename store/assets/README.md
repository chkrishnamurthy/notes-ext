# Store assets — Holdpad

Everything the Chrome Web Store listing needs, in one place.

| File | Size | Upload to |
|---|---|---|
| `screenshots/light/1-…` to `5-…` | 1280×800 PNG | Store listing → Screenshots, in number order |
| `screenshots/dark/…` | 1280×800 PNG | Optional: swap one in to show dark mode |
| `store-icon-128.png` | 128×128 PNG, artwork in the middle 96px | Store listing → Store icon. A copy of `src/public/icons/icon-128.png`, drawn by `scripts/make-icons.mjs` |
| `promo-tile-440x280.png` | 440×280 PNG | Store listing → Small promo tile (required) |
| `marquee-1400x560.png` | 1400×560 PNG | Store listing → Marquee promo tile (optional; used only if Google features Holdpad) |
| `demo-video.mp4` | 1280×800, 31 s, H.264 | Upload to YouTube (public or unlisted), paste the link in Store listing → Promo video |
| `demo-video-dark.mp4` | 1280×800, 31 s, H.264 | The same demo, page and extension both dark |
| `demo-video-dark-extension-on-light-page.mp4` | 1280×800, 31 s, H.264 | The same demo, dark extension on a light page |

The Store takes one promo video, so pick one; use the others on the website or in social posts.

The video has no sound. Its five captions walk through: open the panel, write
a note, save a selection from the page, search, and Clear unpinned → Undo, then
an end card.

## Regenerating

After a UI change, rebuild and re-capture everything:

```sh
npm run build
npm run e2e -- store promo               # screenshots + promo tile + marquee
FORNOW_HEADFUL=1 npm run e2e -- demo     # video; needs a visible Chrome window
FORNOW_HEADFUL=1 FORNOW_DEMO_THEME=dark npm run e2e -- demo   # dark video
FORNOW_HEADFUL=1 FORNOW_DEMO_THEME=dark FORNOW_DEMO_PAGE_THEME=light npm run e2e -- demo   # dark extension, light page
```

`store` writes the raw screenshots to `e2e/screenshots/store/`. Copy the five
chosen ones here, renamed in upload order (1 notes beside page, 2 rich text
editor, 3 search, 4 clear with undo, 5 card view).

In the video, the pointer and the right-click menu are drawn in, because Chrome
does not include either in a page recording. Everything else is the real
extension; choosing the menu item runs the same capture the real menu does.
