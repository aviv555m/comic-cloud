

## Immersive Full-Screen E-Reader with Page-Turn Animations

### Problem
The current reader does not fill the entire phone/tablet screen with the book page. The PDF is rendered at a fixed scale and wrapped in containers with padding. Text is not auto-sized for readability. The page-turn animation only slides the current page off-screen — it does not show the incoming page sliding in underneath (like Kindle) or curling (like Apple Books). Controls should be hidden by default and revealed on tap.

### How popular e-readers work (research summary)
- **Apple Books**: Full-screen page fills the viewport edge-to-edge. Tap center to show/hide controls. Offers both "curl" (paper peel from corner) and "slide" (next page slides in from right). Controls hidden by default.
- **Kindle**: Full-screen. Slide animation where the next page is visible underneath as the current page slides away. Tap center toggles toolbar. Tap left/right edges to turn pages.
- **Google Play Books**: Similar slide mechanic. Page info appears as a brief toast on turn.

### Plan

#### 1. True full-screen page rendering (PDF)
**Reader.tsx changes:**
- Remove `width={window.innerWidth}` approach. Instead use react-pdf's `<Page>` with `width` set to the container's actual width (measured via `ResizeObserver` on the reader content div), ensuring the page canvas fills the screen edge-to-edge with zero margin/padding on mobile.
- Remove outer containers that add `max-w-4xl`, padding, or rounded corners on mobile. The page should touch all four edges.
- Set the reader content div to `100vh` (or `100dvh` for mobile) and `100vw`, with `overflow: hidden`.
- On desktop, keep a max-width constraint and centered layout.

#### 2. Auto-sized readable text
- For PDFs: use `width={containerWidth}` on the `<Page>` component so react-pdf scales the entire page (including text) to fit the viewport width. This makes text larger on phones automatically.
- For EPUBs: set the epub.js rendition to `width: "100%"` and `height: "100%"` of the full-screen container (currently has `max-w-4xl` and `calc(100vh - 180px)` — remove those on mobile). Epub.js reflows text natively.
- For TXT: use responsive font-size (`text-lg` on mobile) inside the full-screen container.

#### 3. Controls hidden by default, tap to toggle
- Set `uiVisible` initial state to `false` (currently `true`).
- On mobile: tapping the center ~40% of the screen toggles UI. Tapping the left 30% goes to previous page, right 30% goes to next page (Kindle-style tap zones), without needing to swipe.
- Show/hide: header bar, bottom chapter bar, reading timer — all with a smooth slide animation (slide up/down with opacity).
- The page info popup (page X of Y, chapter info) still appears briefly on every page turn regardless of UI state.

#### 4. Page-turn animations — Slide and Curl modes
**SwipeablePageReader.tsx rewrite:**

**Slide mode (Kindle-style):**
- Render TWO pages simultaneously: the current page and the next/previous page.
- Accept `renderPage: (pageNum: number) => ReactNode` prop instead of `children`, so the component can render adjacent pages.
- During a swipe, the current page translates with the finger while the next page is positioned just off-screen and follows. Both move together.
- On completion, the next page snaps into place. On release without enough momentum, both snap back.

**Curl mode (Apple Books-style):**
- Use CSS `clip-path` + `transform` to simulate a page corner being peeled.
- The dragged corner follows the finger. Behind the curl, a darkened version of the next page is visible.
- Use `perspective` and `rotateY` on the curling portion for a 3D paper effect.
- This is more complex; implement as a separate animation strategy within the same component.

**User setting:**
- Add a `pageAnimation` setting (`"slide" | "curl"`) persisted in `localStorage`.
- Add a toggle in the reader controls (visible when UI is shown) next to the swipe direction toggle.

#### 5. EPUB full-screen
**EpubReader.tsx changes:**
- Remove `max-w-4xl`, `rounded-lg`, `shadow-2xl` on mobile.
- Set rendition container to `width: 100vw, height: 100dvh` (or 100vh).
- Move chapter navigation and swipe direction toggle into the togglable UI overlay (hidden by default).
- Pass `onTap` through to toggle UI.

#### 6. Comics/CBZ full-screen
**ComicReader.tsx changes:**
- Wrap in `SwipeablePageReader` for swipe navigation.
- Make the image fill the screen (`object-contain` within a full-viewport container).
- Hide navigation buttons by default; show on tap.

#### 7. Page info popup improvements
- Already implemented but refine: show chapter name, pages left in chapter, and a thin progress bar at the bottom of the popup.
- Auto-dismiss after 1.5 seconds with a fade-out animation.

### Files to modify
1. **src/pages/Reader.tsx** — Full-screen layout, tap zones, controls visibility, containerWidth measurement, pass `renderPage` to SwipeablePageReader
2. **src/components/SwipeablePageReader.tsx** — Complete rewrite with slide + curl animation modes, two-page rendering, tap zone logic
3. **src/components/EpubReader.tsx** — Full-screen on mobile, controls as overlay
4. **src/components/ComicReader.tsx** — Wrap in swipeable reader, full-screen image
5. **src/index.css** — Add curl animation keyframes, tap zone styles

### Technical notes
- The slide animation requires rendering the adjacent page. For PDF, this means rendering `<Page pageNumber={currentPage}>` and `<Page pageNumber={currentPage + 1}>` simultaneously in a clipped container.
- The curl animation uses CSS `clip-path: polygon(...)` computed from the touch position, plus a `rotateY` transform on the peeling portion with `backface-visibility: hidden`.
- `100dvh` (dynamic viewport height) is used on mobile to account for browser chrome appearing/disappearing.
- `ResizeObserver` on the reader container provides the exact pixel width for `<Page width={...}>`.

