# Manual checks on real sites

The e2e suites run against local pages. Some behaviour only shows up on the real
sites people use Holdpad beside, and cannot be tested offline or without signing in.
Run through this before a release, with the built extension loaded unpacked.

For each site: open Holdpad from the toolbar icon, then from **Alt+Shift+N**; type a
line and save it with **Ctrl/Cmd+Enter**; select text on the page and save it from the
right-click menu; close with **Escape**; check the page is still usable.

| Site | What to look for |
| --- | --- |
| Google Docs | Overlay opens over the editor; typing goes to Holdpad, not the document; Escape returns focus to the document |
| Gmail (compose open) | Same as above; the compose window keeps its text |
| GitHub (issue or PR) | Overlay renders (strict page policy); selection capture keeps code blocks |
| A page with a cookie banner or full-screen modal | Panel sits above it; clicking the page does not close the panel |
| A single-page app that changes the address without reloading | Panel stays open; saved notes carry the right page address |
| A PDF opened in Chrome | Falls back to the popup; saving a note works |
| `chrome://extensions` and the New Tab page | Falls back to the popup; nothing breaks |
| A page inside a frame-heavy layout (an embedded dashboard) | Only one panel appears; the right frame's selection is captured |
| A dark-mode site and a light-mode site | Panel palette follows Holdpad's setting, not the site's |

Record the Chrome version and anything that fails, with the page address.
