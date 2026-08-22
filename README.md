# Seanime Bulk Delete

Tray panel for selecting many anime at once and deleting their downloaded files.

## Install

In Seanime, open **Extensions**, choose **Add extension**, and paste this URL:

    https://raw.githubusercontent.com/Mistaf/Seanime-bulk-delete/refs/heads/main/seanime-bulk-delete.json

Grant the permissions it asks for, then open the new tray icon. Nothing to
build, clone or copy: the manifest points `payloadURI` at `plugin.js` in this
repo, and Seanime fetches the code from there.

The same URL is in `manifestURI`, so Seanime can check it for updates.

If you would rather install by hand, drop `seanime-bulk-delete.json` into the
`extensions` folder of Seanime's data directory - on Windows that is
`%APPDATA%\Seanime\extensions\`. The filename has to match the plugin `id`.

## Permissions

The plugin asks for the `anilist` and `system` scopes, and for read and write
access to your anime library:

```json
"readPaths":  ["$SEANIME_ANIME_LIBRARY/**/*"],
"writePaths": ["$SEANIME_ANIME_LIBRARY/**/*"]
```

`$SEANIME_ANIME_LIBRARY` is Seanime's own variable and expands to your
configured library roots, so there is nothing machine-specific to fill in.

`writePaths` is the hard safety boundary. The plugin cannot delete anything
outside it - the sandbox denies the call regardless of what the plugin asks for.

Granted permissions are keyed to a hash of the permissions block, so a version
that changes `readPaths` or `writePaths` has to be granted again.

### Your library path setting must match the casing on disk

`$SEANIME_ANIME_LIBRARY` does expand on Windows, and Seanime converts the value
to forward slashes before matching, so `$SEANIME_ANIME_LIBRARY/**/*` is the
right pattern on every platform. What is not portable is the casing.

The matcher is `doublestar.Match`, which is case sensitive, while Windows
itself is not. So a library path typed as `E:/downloads/anime` scans and plays a
library that really lives in `E:\Downloads\Anime`, and only the permission check
fails, silently.

Symptom: every file reads as `0 B` and the panel shows `not authorized for
read`.

Fix: correct the casing in Seanime's library path setting, then restart the
server.

If you would rather not touch that setting, edit the installed manifest and add
your own root as a literal entry next to the variable, using forward slashes and
the on-disk casing:

```json
"readPaths":  ["$SEANIME_ANIME_LIBRARY/**/*", "E:/Downloads/Anime/**/*"],
"writePaths": ["$SEANIME_ANIME_LIBRARY/**/*", "E:/Downloads/Anime/**/*"]
```

Use forward slashes even though Seanime reports paths with backslashes; the
matcher normalizes the path it checks, not the pattern. Add one entry per
library root, otherwise files under it are silently unreadable and undeletable.

**You do not have to work the path out yourself.** Open the tray, and if the
library is unreadable the warning banner names the exact entry to paste,
derived from your own file paths.

## What it does and does not do

Deletes the video files Seanime has scanned for the anime you select.

It does **not** remove empty folders, does **not** remove entries from Seanime's
database, and does **not** touch AniList. Deleted anime therefore remain in your
library as missing files until you run a scan - the panel greys those out and
labels them `already deleted - rescan to clear`.

Files Seanime has not matched to an anime (`mediaId <= 0`) never appear.

## Hacking on it

Clone the repo, then point the installed manifest at your working copy instead
of GitHub:

```json
"payloadURI": "C:/path/to/bulk-delete/plugin.js",
"isDevelopment": true
```

`isDevelopment` is what lets you reload the plugin from Seanime's UI after an
edit instead of restarting the server. Remove both again before sharing.

### Tests

Pure functions only - no Seanime required:

    node --test "test/*.test.js"

The quoted glob matters: `node --test test/` errors on Node 24, and a bare
`node --test` miscounts `test/helpers.js` as a test file.

### Manual test checklist

- [ ] Plugin loads with no permission error
- [ ] Tray file total matches the library's own count
- [ ] Status filter, score sort, size sort and title search each work
- [ ] Selection survives changing filters; footer count stays correct
- [ ] The confirm screen lists the right paths for one anime
- [ ] Delete on a throwaway anime removes exactly those files
- [ ] The deleted anime shows as `already deleted` after Refresh
- [ ] A library rescan clears it

## Troubleshooting

**Right after installing, the plugin crashes.** Fixed in 0.1.1. On 0.1.0 the
first library load called `.catch` on a value the UI runtime returns as
`undefined` on a fresh install, which killed the handler before the tray was
registered. Restarting the Seanime server fully was the workaround.

**The extension never appears in the list.** The manifest is invalid and was
dropped silently. Most likely a path in `readPaths`/`writePaths` is not real.
Use `$SEANIME_ANIME_LIBRARY/**/*` rather than a hand-written path.

**The extension is listed but there is no tray icon.** The payload never
loaded, so `payloadURI` did not resolve: an unreachable URL, or a local path
that is not there. Raw GitHub caches for a few minutes, so a fresh push is not
visible instantly.

**`TypeError: Object has no member 'x'`.** The UI runtime exposes a smaller API
than the general plugin docs suggest. Verified available inside `$ui.register`:
`$anilist`, `$os`, `$storage`, and `ctx.*`. NOT available: `$database` - use
`ctx.anime.getAnimeEntry(mediaId).localFiles` for local files. `ctx.toast` has
`info`, `success` and `warning`, but no `alert`, despite what the docs show.

**Deletions fail with a permissions error.** The path is outside `writePaths`.
Check for a drive-letter or slash-direction mismatch against the paths shown in
the confirm screen.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md). Free to use, copy, modify and
share for any noncommercial purpose, including personal use and hobby
projects. Selling it, or using it as part of a commercial product or service,
is not permitted. The software comes with no warranty and no liability.
