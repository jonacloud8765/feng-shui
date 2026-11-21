# Morrow

Glass desktop widgets for macOS: clocks, countdowns, weather, world clocks, an
app launcher, sticky notes, photos and a few small toys, each floating on the
desktop with real macOS blur. Free and open source under the MIT license.

Requires macOS and Node.js. No Xcode needed.

## Overview

Each widget is its own native window with real
macOS blur behind it. You can move, resize and restyle every widget, and save
different arrangements as layouts.

Built with Electron (HTML, CSS and JavaScript) plus a tiny optional AppKit
helper. **No Xcode needed.** The Command Line Tools that come with macOS are
enough to build the helper.

## Run it

```sh
git clone https://github.com/jonacloud8765/morrow.git
cd morrow
npm install      # first time only; also builds the native helper
npm start
```

To build a double-clickable app instead:

```sh
npm run package  # creates dist/Morrow.app (signed ad hoc for this Mac)
```

Drag `dist/Morrow.app` into Applications if you want. "Open at login" only
works from the packaged app.

Morrow lives in the menu bar (the sun on the horizon icon). From there you can
show or hide all widgets (⌥⌘W), add widgets, switch layouts and open settings.

## Using widgets

- **Move:** drag a widget by its background. It snaps to screen edges and lines
  up with other widgets. You can turn snapping off in General.
- **Resize:** drag any edge, or the corner grip that appears on hover.
- **Customize:** double-click a widget, or right-click and choose Customize….
- **Right-click** a widget to duplicate, hide or remove it, plus actions for
  that widget (flip, generate, lap, refresh).
- **Gallery:** add as many of each widget as you like.
- **Layouts:** each layout keeps its own widgets, positions, sizes and styles.

Widgets: Clock, Countdown, Random Number, Stopwatch, App Launcher,
Weather, World Clock, Sticky Note, Photo, Films, Films Watched, Custom Widget, Corkboard.

## Where things are saved

`~/Library/Application Support/Morrow/morrow-config.json`. Changes are written
within a moment. If the file is damaged, Morrow keeps the damaged copy next to
it (`morrow-config.corrupt-<time>.json`), starts fresh and tells you.

## Films

The Films widget shows the videos in a folder (your Movies folder unless you
choose another) under **Already downloaded**, then the rest of a public
Letterboxd watchlist. Episodes are grouped into one entry per season.

- **Play:** click a downloaded film to open it in [VLC](https://www.videolan.org/vlc/).
  A season opens as a playlist. If VLC isn't installed, the widget says so.
- **Downloads:** films on the left, a divider, then shows.
- **Sections:** show downloads, the watchlist, or both, with an optional heading,
  so one widget can be a "Ready to watch" panel and another a watchlist shelf.
- **Watchlist:** enter your Letterboxd username in the widget's settings. The
  watchlist is read from your public watchlist page, kept for 12 hours, and
  refreshed with the refresh button. If Letterboxd can't be reached, the last
  copy stays on screen with the reason. Click a watchlist film to open its
  Letterboxd page, or the "On your watchlist" heading to open the whole
  watchlist in Chrome (or your default browser).
- **Finding films:** filter the watchlist by decade and genre, sort it (when
  added, name, popularity, shuffle, release date, average rating, length) or
  search by title, actor or director in the same box. The total running time of the films shown appears
  under the filters. Genres, ratings and lengths come from each film's public
  Letterboxd page, read slowly in the background once and then kept.
- **Artwork:** a poster or thumbnail image next to a video (`<name>.jpg`,
  `poster.jpg`, `folder.jpg`, `cover.jpg`) is used first. Otherwise the poster
  comes from Letterboxd, or for shows from [TVmaze](https://www.tvmaze.com/)
  (the season's poster when there is one). Posters are saved in Morrow's data folder under `films/`.
- **Settings:** watch folder, username, layout (poster grid, shelves or list),
  poster size, whether to show the rest of the watchlist, and a size limit that
  skips small clips.

## Films Watched

A single number: how many films a Letterboxd member has logged as watched,
read from their public Films page and checked hourly. Set a goal to add a
progress bar. Click the number to open that page.

## Sticky Note

A note with an optional title and a body, each with its own font. Select text
and press ⌘U, ⌘B or ⌘I, or use the small bar that appears over a selection, to
underline, bold or italicize it.
Start a line with "- " for a bulleted list or "[] " for a checklist (or press
⌘⇧7 / ⌘⇧L), and click a box to tick it. Pin the note with washi tape, a
pushpin (six colors), or nothing. Paper notes are drawn as real paper with a
lifted-corner shadow; the Glass paper keeps the glass look. Double-clicking a
note selects text; use Customize… in the right-click menu for its settings.
Hover the top-left corner for close (hide), fold and zoom buttons; drag the
top-right corner to resize. Text scales with the note without changing its
saved size. Three handwriting fonts are bundled: Homemade
Apple (Apache 2.0), Nothing You Could Do and Caveat Brush (SIL Open Font
License). Their licenses are in `src/renderer/fonts`.

## Corkboard

A framed cork board. Right-click to pin a note or a photo. Drag an item by its
paper to move it and click its text to write. Click a pushpin to change its
color, drag from a pushpin to another item to run a red string between them,
and click a string to cut it. Hover the top-right corner to switch between
portrait and landscape; everything on the board moves with it. Resizing the
board scales everything pinned to it, so a smaller board keeps the whole case.

## Styles

Weather, App Launcher, World Clock, Photo, Films Watched and Stopwatch come
with a few curated looks instead of a wall of options: pick one under Style in
the widget's settings. The Photo looks are frames: Glass, Polaroid, Gallery
Frame, Film Poster (the caption becomes the title) and Borderless.

## Feng Shui

The yin-yang in the lower-right corner of the desktop rebalances the current
layout: the widget nearest the middle stays the heart, wide low widgets rest
beneath it, small wide ones crown it, and the rest are shared between the
left and right so both sides carry the same weight, with even spacing and
nothing overlapping. Right-click it for settings. In General settings you can
hide it, or swap the yin-yang for an ink dragon. The tray menu has the same
action as Feng Shui This Layout.

## Custom Widget

Turns any self-contained HTML file into a widget. Morrow copies the file into
its own data folder, so the original can move or be deleted. The page keeps
its own scripts, storage and web notifications. Drag the handle that appears
at the top on hover to move it, or right-click the handle for the widget menu.

## Weather

Weather comes from [Open-Meteo](https://open-meteo.com), which needs no
account or API key, so there are no secrets to configure. Widgets show a clear
"Weather unavailable" message with the reason when the service can't be
reached, and never make up data. To use a different service, implement
`forecast()` and `searchCities()` as described in `src/main/weather.js` and pass
your provider to `createWeatherService()`.

"Use my location" asks macOS for location permission only when you click it.
You can always search for a city instead.

## Desktop behaviour and its trade-offs

Window handling lives in `src/main/windows.js`. Choose a placement under
**General › Widget placement**:

| Mode | What it does | Trade-offs |
| --- | --- | --- |
| **Beside your windows** (default) | Normal window level. Widgets sit on the desktop and your apps cover them as usual. Clicking a widget brings it forward. | Widgets count as Morrow windows, so Stage Manager may group them, and ⌘-Tab to Morrow raises them. |
| **On the desktop layer** | The native helper places widgets just above desktop icons and below every app (`kCGDesktopIconWindowLevel + 1`). Widgets stay clickable and stay put during Mission Control. | Any app window covers them. Without the native helper, Morrow falls back to Electron's `desktop` window type, which macOS doesn't send clicks to, so you edit via **Arrange Widgets** in the menu bar. |
| **Always on top** | Floating level. | Covers other apps. It's opt-in. |

With **Show on all Spaces** on, widgets follow you to every desktop Space. They
never appear over full-screen apps, because macOS gives each full-screen app its
own Space. If a display is disconnected, widgets on it move back onto a visible
screen.

## The native helper

`native/morrow_native.mm` is about 150 lines of Objective-C++ that does three
things Electron can't:

1. Rounds the native blur to each widget's own corner radius. Electron fixes
   that radius at about 9 points.
2. Places windows at the desktop-icon level for "On the desktop layer".
3. Renders real app icons at full resolution for the launcher. Electron's icon
   API stops at 32 pixels on macOS.

`npm install` builds it with the Command Line Tools (`npm run native` rebuilds
it). If it's missing, Morrow still runs with the fallbacks described above.

## Tests

```sh
npm test         # storage, time zones and DST, random distribution
npm run selftest # opens every widget, clicks its buttons, captures test/out/*.png
```

## Adding a widget type

1. Add an entry to `src/shared/registry.js` with its default size, size limits,
   default config and settings fields.
2. Create `src/renderer/widgets/<type>.js` exporting
   `mount(root, ctx) → { update, resume, menu, menuAction }`.

The settings form is generated from `fields`, so most widgets need no settings
code at all.

## License

MIT. See [LICENSE](LICENSE).
