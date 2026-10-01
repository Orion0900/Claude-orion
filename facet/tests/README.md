# Browser checks

Scripts that drive the built app in headless Chromium on an iPhone-sized,
touch-enabled screen. Each serves `dist/` itself under the same sub-path
GitHub Pages uses (`/Claude-orion/facet/`).

```bash
npm run build
node tests/e2e.mjs          # intro, an analysis from a photo, the points, the report,
                            # comparison switch, side profile, history, compare, settings
node tests/camera.mjs       # the live camera guide lines up the demo face (played through
                            # Chromium's fake webcam) and takes the photo by itself
node tests/screenshots.mjs  # the README screenshots, from the built-in demo face
node tests/calibrate.mjs [photo…]   # every measurement for a set of photos, in the terminal
node tests/hairline-debug.mjs <dir> # the hairline search drawn over each photo
```

The photos are MediaPipe's own test images, downloaded once into
`tests/.cache`. `calibrate.mjs` and `hairline-debug.mjs` run the analysis
straight from the sources through `harness.html` on the Vite dev server, so
they need no build. Set `SHOTS=<dir>` on `e2e.mjs` or `camera.mjs` to save
screenshots along the way; `PHOTO=<name>` picks the front photo for `e2e.mjs`.
