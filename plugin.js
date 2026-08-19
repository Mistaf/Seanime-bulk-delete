// Seanime Bulk Delete
// Required Notice: Copyright 2026 Mistaf (https://github.com/Mistaf)
// Licensed under the PolyForm Noncommercial License 1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

// Seanime re-evaluates this factory inside each runtime, so it must be
// self-contained and reference nothing from the outer scope. $shared.define/use
// is how it crosses over.
function createCore() {
    function formatBytes(n) {
        const bytes = typeof n === "number" && isFinite(n) && n > 0 ? n : 0
        if (bytes < 1024) return bytes + " B"
        const units = ["KB", "MB", "GB", "TB"]
        let value = bytes / 1024
        let i = 0
        while (value >= 1024 && i < units.length - 1) {
            value = value / 1024
            i++
        }
        return value.toFixed(1) + " " + units[i]
    }

    // On Windows $SEANIME_ANIME_LIBRARY expands to a backslash path and never
    // matches, so the root has to be added by hand. Derive it from the file
    // paths instead: longest common directory prefix, one entry per drive.
    function suggestAllowPaths(paths) {
        const byDrive = {}

        for (const raw of paths || []) {
            if (!raw) continue
            const segments = String(raw).split(/[\\/]+/)
            segments.pop() // drop the filename
            if (!segments.length) continue

            const drive = segments[0] || "/"
            if (!byDrive[drive]) {
                byDrive[drive] = segments.slice()
                continue
            }

            const current = byDrive[drive]
            let i = 0
            while (i < current.length && i < segments.length && current[i] === segments[i]) i++
            byDrive[drive] = current.slice(0, i)
        }

        const out = []
        for (const drive in byDrive) {
            const prefix = byDrive[drive].join("/")
            if (prefix) out.push(prefix + "/**/*")
        }
        return out
    }

    function firstNumber(candidates) {
        for (const value of candidates || []) {
            if (typeof value === "number" && isFinite(value)) return value
        }
        return null
    }

    // Blank or junk means "no bound", so a half-typed value does not filter
    // everything away.
    function toNumberOrNull(value) {
        if (value == null) return null
        const text = String(value).trim().replace(",", ".")
        if (text === "") return null
        const n = parseFloat(text)
        return isFinite(n) ? n : null
    }

    // AniList stores scores out of 100 whatever display format the user picked,
    // so 8.5 arrives as 85. Anything above 10 is a 100-point value.
    function toTenScale(score) {
        if (typeof score !== "number" || !isFinite(score)) return null
        const value = score > 10 ? score / 10 : score
        return Math.round(value * 10) / 10
    }

    function formatScore(score) {
        if (score == null) return "unscored"
        return String(Math.round(score * 10) / 10)
    }

    // Collection entries come from Go structs: a nullable number like score
    // arrives as a pointer, not a JS number, and only the generated getter
    // (getScore) reaches the value.
    function callNumber(obj, name) {
        if (!obj) return null
        const fn = obj[name]
        if (typeof fn !== "function") return null
        try {
            const value = fn.call(obj)
            return typeof value === "number" && isFinite(value) ? value : null
        } catch (e) {
            return null
        }
    }

    // -> { [mediaId]: {title, status, score} }. The wrapper key casing of
    // $anilist.getAnimeCollection() is not pinned down in the docs.
    function collectMediaInfo(collection) {
        const out = {}
        if (!collection) return out

        const wrapper = collection.MediaListCollection
            || collection.mediaListCollection
            || collection
        const lists = wrapper && wrapper.lists
        if (!lists || !lists.length) return out

        for (const list of lists) {
            const entries = (list && list.entries) || []
            for (const entry of entries) {
                const media = entry && entry.media
                const id = media && (media.id != null ? media.id : media.ID)
                if (id == null) continue

                const title = media.title || {}

                // The user's own list data can sit under listData rather than on
                // the entry, so read every shape.
                const listData = entry.listData || entry.ListData || {}
                const mediaListEntry = media.mediaListEntry || {}

                const rawScore = firstNumber([
                    entry.score, listData.score, mediaListEntry.score,
                    entry.scoreRaw, listData.scoreRaw,
                    callNumber(entry, "getScore"),
                    callNumber(entry, "getScoreSafe"),
                    callNumber(mediaListEntry, "getScore"),
                ])

                out[id] = {
                    title: title.userPreferred || title.romaji || title.english
                        || ("Media #" + id),
                    status: entry.status || listData.status
                        || mediaListEntry.status || list.status || null,
                    // AniList reports 0 for entries the user never rated.
                    score: rawScore != null && rawScore > 0 ? toTenScale(rawScore) : null,
                }
            }
        }
        return out
    }

    // statSize: (path) => byteCount, or null when the file is gone.
    function buildIndexFrom(localFiles, mediaInfo, statSize) {
        const files = localFiles || []
        const info = mediaInfo || {}
        const byId = {}

        for (const lf of files) {
            if (!lf) continue
            const path = lf.path || lf.Path
            const rawId = lf.mediaId != null ? lf.mediaId : lf.MediaId
            const mediaId = typeof rawId === "number" ? rawId : parseInt(rawId, 10)
            if (!path || !mediaId || isNaN(mediaId) || mediaId <= 0) continue

            if (!byId[mediaId]) {
                const meta = info[mediaId] || {}
                byId[mediaId] = {
                    mediaId: mediaId,
                    title: meta.title || ("Media #" + mediaId),
                    status: meta.status != null ? meta.status : null,
                    score: meta.score != null ? meta.score : null,
                    files: [],
                    totalBytes: 0,
                    allMissing: false,
                }
            }

            const size = statSize(path)
            const missing = size == null
            byId[mediaId].files.push({
                path: path,
                size: missing ? 0 : size,
                missing: missing,
            })
            if (!missing) byId[mediaId].totalBytes += size
        }

        const groups = []
        for (const key in byId) {
            const g = byId[key]
            g.allMissing = g.files.length > 0 && g.files.every((f) => f.missing)
            groups.push(g)
        }
        return groups
    }

    // The join that keeps what the confirm screen showed and what gets deleted
    // the same set. Here rather than in the UI so a test can pin it.
    function selectGroups(groups, ids) {
        const all = groups || []
        const wanted = ids || []
        return all.filter((g) => wanted.indexOf(g.mediaId) !== -1)
    }

    // deleteGroups skips missing files, so they must not be counted here or the
    // confirm screen overstates what it is about to do.
    function deletableCount(group) {
        if (!group || !group.files) return 0
        let n = 0
        for (const f of group.files) {
            if (!f.missing) n++
        }
        return n
    }

    // Missing files are skipped and labelled "already deleted", so a permission
    // error must not read as absence - that turns a delete into a silent no-op.
    function looksAbsent(message) {
        const m = String(message || "").toLowerCase()
        return m.indexOf("no such file") !== -1
            || m.indexOf("cannot find") !== -1
            || m.indexOf("does not exist") !== -1
            || m.indexOf("not exist") !== -1
            || m.indexOf("enoent") !== -1
    }

    // AniList sends CURRENT, Seanime may send "Watching", and a select may send
    // the label instead of the value. Raw string comparison matches nothing.
    function normalizeStatus(value) {
        if (value == null) return null
        const key = String(value).trim().toUpperCase().replace(/[\s-]+/g, "_")
        const aliases = {
            ALL: "ALL",
            ALL_STATUSES: "ALL",
            COMPLETED: "COMPLETED",
            DROPPED: "DROPPED",
            CURRENT: "CURRENT",
            WATCHING: "CURRENT",
            PLANNING: "PLANNING",
            PLAN_TO_WATCH: "PLANNING",
            PLANNED: "PLANNING",
            PAUSED: "PAUSED",
            ON_HOLD: "PAUSED",
            REPEATING: "REPEATING",
            REWATCHING: "REPEATING",
        }
        return aliases[key] || key
    }

    function applyView(groups, filters) {
        const all = groups || []
        const f = filters || {}
        const status = normalizeStatus(f.status) || "ALL"
        const sort = f.sort || "size-desc"
        const search = (f.search || "").trim().toLowerCase()

        let out = all.slice()

        if (status !== "ALL") {
            out = out.filter((g) => normalizeStatus(g.status) === status)
        }
        if (search) {
            out = out.filter((g) => (g.title || "").toLowerCase().indexOf(search) !== -1)
        }

        // Bounds are independent, so a maximum alone answers "everything I
        // rated below 7". Unscored anime drop out once either bound is set,
        // and stay when both are blank.
        const min = toNumberOrNull(f.scoreMin)
        const max = toNumberOrNull(f.scoreMax)
        if (min != null || max != null) {
            out = out.filter((g) => {
                if (g.score == null) return false
                if (min != null && g.score < min) return false
                if (max != null && g.score > max) return false
                return true
            })
        }

        // Unscored sorts last in either direction.
        function byScore(dir) {
            return (a, b) => {
                const as = a.score, bs = b.score
                if (as == null && bs == null) return a.title.localeCompare(b.title)
                if (as == null) return 1
                if (bs == null) return -1
                return as === bs ? a.title.localeCompare(b.title) : (as - bs) * dir
            }
        }

        if (sort === "title") {
            out.sort((a, b) => a.title.localeCompare(b.title))
        } else if (sort === "size-asc") {
            out.sort((a, b) => a.totalBytes - b.totalBytes)
        } else if (sort === "score-asc") {
            out.sort(byScore(1))
        } else if (sort === "score-desc") {
            out.sort(byScore(-1))
        } else {
            out.sort((a, b) => b.totalBytes - a.totalBytes)
        }

        return out
    }

    // The only function here that removes files. fsApi is $os at runtime, a fake
    // in tests. Missing files are skipped, and one failure does not stop the batch.
    function deleteGroups(groups, fsApi) {
        const result = {
            attempted: 0,
            deleted: 0,
            bytes: 0,
            failed: [],
            paths: [],
        }

        for (const group of groups || []) {
            for (const file of (group && group.files) || []) {
                if (!file || !file.path || file.missing) continue

                result.attempted++
                result.paths.push(file.path)

                try {
                    fsApi.remove(file.path)
                    result.deleted++
                    result.bytes += file.size || 0
                } catch (e) {
                    result.failed.push({
                        path: file.path,
                        error: (e && e.message) ? e.message : String(e),
                    })
                }
            }
        }

        return result
    }

    const STATUS_OPTIONS = [
        { label: "All statuses", value: "ALL" },
        { label: "Completed", value: "COMPLETED" },
        { label: "Dropped", value: "DROPPED" },
        { label: "Watching", value: "CURRENT" },
        { label: "Planning", value: "PLANNING" },
        { label: "Paused", value: "PAUSED" },
        { label: "Rewatching", value: "REPEATING" },
    ]

    const SORT_OPTIONS = [
        { label: "Size (largest first)", value: "size-desc" },
        { label: "Size (smallest first)", value: "size-asc" },
        { label: "Score (lowest first)", value: "score-asc" },
        { label: "Score (highest first)", value: "score-desc" },
        { label: "Title (A-Z)", value: "title" },
    ]


    return {
        formatBytes: formatBytes,
        collectMediaInfo: collectMediaInfo,
        buildIndexFrom: buildIndexFrom,
        selectGroups: selectGroups,
        deletableCount: deletableCount,
        suggestAllowPaths: suggestAllowPaths,
        firstNumber: firstNumber,
        formatScore: formatScore,
        toTenScale: toTenScale,
        toNumberOrNull: toNumberOrNull,
        looksAbsent: looksAbsent,
        normalizeStatus: normalizeStatus,
        applyView: applyView,
        deleteGroups: deleteGroups,
        STATUS_OPTIONS: STATUS_OPTIONS,
        SORT_OPTIONS: SORT_OPTIONS,
    }
}

function init() {
    // Must come before the UI registers: $shared.use resolves it by name.
    $shared.define("core", createCore)

    $ui.register((ctx) => {
        const core = $shared.use("core")

        // Inlined as a data URI so it cannot 404. Without an iconUrl the tray
        // button renders empty and the plugin looks like it never loaded.
        const iconSvg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'"
            + " fill='none' stroke='currentColor' stroke-width='2'"
            + " stroke-linecap='round' stroke-linejoin='round'>"
            + "<polyline points='3 6 5 6 21 6'/>"
            + "<path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/>"
            + "<line x1='10' y1='11' x2='10' y2='17'/>"
            + "<line x1='14' y1='11' x2='14' y2='17'/>"
            + "</svg>"

        const tray = ctx.newTray({
            tooltipText: "Bulk Delete",
            iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(iconSvg),
            withContent: true,
            width: "480px",
            minHeight: "300px",
        })

        const index = ctx.state([])
        const selected = ctx.state([])
        const mode = ctx.state("list")      // "list" | "confirm" | "result"
        const result = ctx.state(null)
        const warning = ctx.state("")
        const busy = ctx.state(false)

        const searchRef = ctx.fieldRef("")
        const scoreMinRef = ctx.fieldRef("")
        const scoreMaxRef = ctx.fieldRef("")
        const statusRef = ctx.fieldRef("ALL")
        const sortRef = ctx.fieldRef("size-desc")

        const handlersRegistered = {}

        // The allowlist entries this library needs, ready to paste.
        function suggestionText(localFiles) {
            const paths = []
            for (const lf of localFiles || []) {
                const path = lf && (lf.path || lf.Path)
                if (path) paths.push(path)
            }
            const suggestions = core.suggestAllowPaths(paths)
            if (!suggestions.length) return "(no paths available to suggest from)"

            // With only a handful of files this can land deeper than the real
            // root, so say that widening it is safe.
            return suggestions.map((s) => '"' + s + '"').join(", ")
                + " (use a parent folder if that looks too specific)"
        }

        // Warnings accumulate: a filesystem failure must not hide an AniList one.
        function addWarning(message) {
            const current = warning.get()
            warning.set(current ? current + "  " + message : message)
        }

        // Reset on every rebuild.
        let statAttempts = 0
        let statFailures = 0
        let statUnknownSize = 0
        let statErrorSample = ""
        let statShapeSample = ""

        function statSize(path) {
            statAttempts++
            try {
                const st = $os.stat(path)
                if (!st) return null

                const candidates = [st.size, st.Size, st.length, st.Length]
                for (const value of candidates) {
                    if (typeof value === "function") {
                        const called = value.call(st)
                        if (typeof called === "number") return called
                    }
                    if (typeof value === "number") return value
                }

                // stat worked but hides the size under some other name. Record
                // the shape once so the next run can name the field instead of
                // showing every file as 0 B.
                if (!statShapeSample) {
                    let keys = []
                    try {
                        keys = Object.keys(st)
                    } catch (inner) {
                        keys = []
                    }
                    statShapeSample = keys.length
                        ? keys.slice(0, 12).join(",")
                        : "(no enumerable keys)"
                }
                statUnknownSize++
                return 0
            } catch (e) {
                statFailures++
                const message = (e && e.message) ? e.message : String(e)
                if (!statErrorSample) statErrorSample = message

                // Only call a file gone when the error says so. Unknown errors
                // keep it present at size 0.
                return core.looksAbsent(message) ? null : 0
            }
        }

        function currentFilters() {
            return {
                status: statusRef.current || "ALL",
                sort: sortRef.current || "size-desc",
                search: searchRef.current || "",
                scoreMin: scoreMinRef.current,
                scoreMax: scoreMaxRef.current,
            }
        }

        function visibleGroups() {
            return core.applyView(index.get(), currentFilters())
        }

        function selectedGroups() {
            return core.selectGroups(index.get(), selected.get())
        }

        function selectionTotals() {
            let files = 0
            let bytes = 0
            for (const g of selectedGroups()) {
                for (const f of g.files) {
                    if (f.missing) continue
                    files++
                    bytes += f.size || 0
                }
            }
            return { anime: selected.get().length, files: files, bytes: bytes }
        }

        function ensureHandlers(groups) {
            for (const g of groups) {
                const id = g.mediaId
                if (handlersRegistered[id]) continue
                handlersRegistered[id] = true
                ctx.registerEventHandler("toggle-" + id, () => {
                    const ids = selected.get().slice()
                    const at = ids.indexOf(id)
                    if (at === -1) ids.push(id)
                    else ids.splice(at, 1)
                    selected.set(ids)
                })
            }
        }

        // $database.localFiles.getAll() would be one call, but $database is not
        // exposed in the UI runtime. ctx.anime.getAnimeEntry is the way in and
        // reads through a cache. Batched: sequential is slow over a few hundred
        // entries, unbounded hammers the server.
        async function collectLocalFiles(mediaIds) {
            const files = []
            const BATCH = 8

            for (let i = 0; i < mediaIds.length; i += BATCH) {
                const batch = mediaIds.slice(i, i + BATCH)
                const entries = await Promise.all(batch.map(async (id) => {
                    try {
                        return await ctx.anime.getAnimeEntry(id)
                    } catch (e) {
                        // One unreadable entry must not empty the panel.
                        return null
                    }
                }))

                for (const entry of entries) {
                    if (entry && entry.localFiles) {
                        for (const lf of entry.localFiles) files.push(lf)
                    }
                }
            }

            return files
        }

        async function rebuild() {
            busy.set(true)
            try {
                let info = {}
                warning.set("")
                try {
                    const collection = $anilist.getAnimeCollection(false)
                    info = core.collectMediaInfo(collection)

                    // A control that quietly does nothing looks broken, so say it.
                    const ids = Object.keys(info)
                    const scored = ids.filter((k) => info[k].score != null).length
                    const withStatus = ids.filter((k) => info[k].status != null).length
                    if (ids.length > 0 && scored === 0) {
                        addWarning("No scores found, so sorting by score will not reorder anything.")
                    }
                    if (ids.length > 0 && withStatus === 0) {
                        addWarning("No list statuses found, so the status filter will match nothing.")
                    }
                } catch (e) {
                    addWarning("AniList data unavailable, so titles, status filter"
                        + " and score sort are limited: "
                        + ((e && e.message) ? e.message : e))
                }

                const mediaIds = Object.keys(info).map((k) => parseInt(k, 10))
                const files = await collectLocalFiles(mediaIds)

                statAttempts = 0
                statFailures = 0
                statUnknownSize = 0
                statErrorSample = ""
                statShapeSample = ""

                const groups = core.buildIndexFrom(files, info, statSize)
                ensureHandlers(groups)
                index.set(groups)

                // All of them failing is a permissions problem, not a library
                // that vanished.
                if (statAttempts > 0 && statFailures === statAttempts) {
                    addWarning("Could not read any file on disk. Sizes are unknown"
                        + " and these files are probably NOT missing."
                        + " Add this to readPaths AND writePaths in"
                        + " seanime-bulk-delete.json, then restart Seanime: "
                        + suggestionText(files)
                        + "  First error: " + statErrorSample)
                } else if (statFailures > 0) {
                    addWarning(statFailures + " of " + statAttempts
                        + " files could not be read, so their sizes are unknown."
                        + " If a whole library is affected, add it to readPaths"
                        + " and writePaths: " + suggestionText(files)
                        + "  First error: " + statErrorSample)
                }

                if (statUnknownSize > 0) {
                    addWarning("Sizes unavailable for " + statUnknownSize + " files:"
                        + " stat succeeded but exposes no known size field."
                        + " Fields seen: " + statShapeSample)
                }

                // Drop selections with nothing left to delete, otherwise the
                // panel offers "delete 0 files from 1 anime".
                const live = {}
                for (const g of groups) {
                    if (!g.allMissing) live[g.mediaId] = true
                }
                selected.set(selected.get().filter((id) => live[id]))
            } catch (e) {
                ctx.toast.warning("Could not read the library: " + (e && e.message ? e.message : e))
            }
            busy.set(false)
        }

        ctx.registerEventHandler("refresh", async () => {
            await rebuild()
            ctx.toast.info("Library reloaded")
        })

        ctx.registerEventHandler("apply-filters", () => {
            // Rendering reads the field refs directly, so a self-set re-renders
            // with the new filter values.
            selected.set(selected.get().slice())
        })

        ctx.registerEventHandler("select-shown", () => {
            const ids = selected.get().slice()
            for (const g of visibleGroups()) {
                if (g.allMissing) continue
                if (ids.indexOf(g.mediaId) === -1) ids.push(g.mediaId)
            }
            selected.set(ids)
        })

        ctx.registerEventHandler("clear-selection", () => {
            selected.set([])
        })

        function rowLabel(group, isSelected) {
            const box = isSelected ? "☑" : "☐"
            return box + "  " + group.title
        }

        function fileCountLabel(group) {
            const deletable = core.deletableCount(group)
            const total = group.files.length
            // Both numbers when some files are already gone, so the row never
            // claims more than a delete would touch.
            return deletable === total
                ? total + " files"
                : deletable + " of " + total + " files"
        }

        function rowDetail(group) {
            const parts = [
                fileCountLabel(group),
                core.formatBytes(group.totalBytes),
            ]
            parts.push(group.score != null
                ? "score " + core.formatScore(group.score) + "/10"
                : "unscored")
            if (group.status) parts.push(group.status)
            if (group.allMissing) parts.push("already deleted - rescan to clear")
            return parts.join("  ·  ")
        }

        function renderList() {
            const groups = visibleGroups()
            const ids = selected.get()
            const totals = selectionTotals()

            const rows = []
            for (const g of groups) {
                const isSelected = ids.indexOf(g.mediaId) !== -1
                rows.push(tray.stack([
                    g.allMissing
                        ? tray.text(rowLabel(g, false), { style: { opacity: "0.5" } })
                        : tray.button(rowLabel(g, isSelected), {
                            onClick: "toggle-" + g.mediaId,
                            intent: isSelected ? "primary" : "gray-subtle",
                        }),
                    tray.text(rowDetail(g), {
                        style: { fontSize: "0.8rem", opacity: g.allMissing ? "0.5" : "0.7" },
                    }),
                ]))
            }

            if (!rows.length) {
                rows.push(tray.text("No anime match these filters."))
            }

            const items = []
            if (warning.get()) {
                // Plain text, not tray.alert: that renders an empty box here, it
                // does not take the message as its first positional argument.
                items.push(tray.text("! " + warning.get(), {
                    style: {
                        fontSize: "0.8rem",
                        color: "#fca5a5",
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                    },
                }))
            }
            items.push(tray.input("Search titles", { fieldRef: searchRef }))
            items.push(tray.select("Status", { fieldRef: statusRef, options: core.STATUS_OPTIONS }))
            items.push(tray.select("Sort by", { fieldRef: sortRef, options: core.SORT_OPTIONS }))
            items.push(tray.flex([
                tray.input("Min score", { fieldRef: scoreMinRef }),
                tray.input("Max score", { fieldRef: scoreMaxRef }),
            ]))
            items.push(tray.text(
                "Scores are 0-10. Leave blank for no limit. Setting either one"
                + " hides unscored anime.",
                { style: { fontSize: "0.7rem", opacity: "0.6", whiteSpace: "normal" } },
            ))
            items.push(tray.flex([
                tray.button("Apply", { onClick: "apply-filters", intent: "primary-subtle" }),
                tray.button("Refresh library", { onClick: "refresh", intent: "gray-subtle" }),
            ]))
            items.push(tray.flex([
                tray.button("Select all shown", { onClick: "select-shown", intent: "gray-subtle" }),
                tray.button("Clear", { onClick: "clear-selection", intent: "gray-subtle" }),
            ]))
            items.push(tray.text(
                busy.get()
                    ? "Reading library…"
                    : groups.length + " of " + index.get().length + " anime shown",
                { style: { fontSize: "0.8rem", opacity: "0.7" } },
            ))
            items.push(tray.stack(rows))
            items.push(tray.text(
                totals.anime + " selected  ·  " + totals.files + " files  ·  " + core.formatBytes(totals.bytes),
                { style: { fontWeight: "bold" } },
            ))
            items.push(tray.button(
                totals.anime === 0 ? "Select anime to delete" : "Delete selected",
                { onClick: "open-confirm", intent: "alert", disabled: totals.anime === 0 },
            ))

            return tray.stack(items)
        }

        ctx.registerEventHandler("open-confirm", () => {
            if (!selected.get().length) return
            mode.set("confirm")
        })

        ctx.registerEventHandler("cancel-confirm", () => {
            mode.set("list")
        })

        ctx.registerEventHandler("dismiss-result", () => {
            result.set(null)
            mode.set("list")
        })

        ctx.registerEventHandler("do-delete", async () => {
            const groups = selectedGroups()

            const res = core.deleteGroups(groups, $os)

            if (res.failed.length) {
                ctx.toast.warning("Deleted " + res.deleted + ", failed " + res.failed.length)
            } else {
                ctx.toast.success("Deleted " + res.deleted + " files (" + core.formatBytes(res.bytes) + ")")
            }

            result.set(res)
            mode.set("result")

            selected.set([])
            await rebuild()
        })

        function renderConfirm() {
            const groups = selectedGroups()
            const totals = selectionTotals()

            const paths = []
            for (const g of groups) {
                for (const f of g.files) {
                    if (!f.missing) paths.push(f.path)
                }
            }

            const items = []
            // Plain text for the same reason as renderList, and this is the one
            // line that must never go unread.
            items.push(tray.text(
                "! This permanently deletes files from disk. It cannot be undone.",
                {
                    style: {
                        fontWeight: "bold",
                        color: "#fca5a5",
                        whiteSpace: "normal",
                    },
                },
            ))
            items.push(tray.text(
                "Delete " + totals.files + " files (" + core.formatBytes(totals.bytes) + ") from "
                + totals.anime + " anime?",
                { style: { fontWeight: "bold" } },
            ))

            for (const g of groups.slice(0, 10)) {
                items.push(tray.text("• " + g.title + " - " + core.deletableCount(g) + " files, "
                    + core.formatBytes(g.totalBytes), { style: { fontSize: "0.85rem" } }))
            }
            if (groups.length > 10) {
                items.push(tray.text("(+" + (groups.length - 10) + " more anime)",
                    { style: { fontSize: "0.85rem", opacity: "0.7" } }))
            }

            items.push(tray.text("Files:", { style: { fontWeight: "bold", marginTop: "8px" } }))
            for (const p of paths.slice(0, 10)) {
                items.push(tray.text(p, { style: { fontSize: "0.75rem", opacity: "0.8" } }))
            }
            if (paths.length > 10) {
                items.push(tray.text("(+" + (paths.length - 10) + " more files)",
                    { style: { fontSize: "0.75rem", opacity: "0.7" } }))
            }

            items.push(tray.flex([
                tray.button("Cancel", { onClick: "cancel-confirm", intent: "gray-subtle" }),
                tray.button(
                    "Yes, delete " + totals.files + " files",
                    { onClick: "do-delete", intent: "alert" },
                ),
            ]))

            return tray.stack(items)
        }

        function renderResult() {
            const res = result.get()
            if (!res) return tray.text("No result.")

            const items = []
            items.push(tray.text(
                "Deleted " + res.deleted + " · Failed " + res.failed.length,
                { style: { fontWeight: "bold" } },
            ))
            items.push(tray.text("Freed " + core.formatBytes(res.bytes)))
            if (res.failed.length) {
                items.push(tray.text(
                    "! Some files could not be deleted. A path outside the manifest's writePaths "
                    + "is denied by the sandbox; a file in use is locked by another program.",
                    { style: { color: "#fca5a5", whiteSpace: "normal" } },
                ))
                for (const f of res.failed) {
                    items.push(tray.text(f.path + " - " + f.error,
                        { style: { fontSize: "0.75rem" } }))
                }
            }
            items.push(tray.text(
                "Deleted anime stay in your library as missing files until you run a scan.",
                { style: { fontSize: "0.8rem", opacity: "0.7" } },
            ))

            items.push(tray.button("Back", { onClick: "dismiss-result", intent: "primary" }))
            return tray.stack(items)
        }

        tray.render(() => {
            if (mode.get() === "confirm") return renderConfirm()
            if (mode.get() === "result") return renderResult()
            return renderList()
        })

        // Nothing awaits the first load, so catch here rather than leave an
        // unhandled rejection.
        rebuild().catch((e) => {
            ctx.toast.warning("Could not load the library: " + (e && e.message ? e.message : e))
        })
    })
}
