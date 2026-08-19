const test = require("node:test")
const assert = require("node:assert")
const { loadPlugin } = require("./helpers")

const plugin = loadPlugin()

const groups = [
    { mediaId: 1, title: "Bleach", status: "COMPLETED", score: 8, totalBytes: 300, files: [], allMissing: false },
    { mediaId: 2, title: "Naruto", status: "COMPLETED", score: 6, totalBytes: 900, files: [], allMissing: false },
    { mediaId: 3, title: "Sword Art Online", status: "DROPPED", score: 4, totalBytes: 100, files: [], allMissing: false },
    { mediaId: 4, title: "Unscored Show", status: null, score: null, totalBytes: 500, files: [], allMissing: false },
]

const titles = (list) => list.map((g) => g.title)

test("ALL keeps every group", () => {
    const out = plugin.applyView(groups, { status: "ALL", sort: "title", search: "" })
    assert.strictEqual(out.length, 4)
})

test("filters by status", () => {
    const out = plugin.applyView(groups, { status: "COMPLETED", sort: "title", search: "" })
    assert.deepStrictEqual(titles(out), ["Bleach", "Naruto"])
})

test("filters when the control returns the option label instead of its value", () => {
    // "Completed" (label) must still match COMPLETED (AniList enum).
    const out = plugin.applyView(groups, { status: "Completed", sort: "title", search: "" })
    assert.deepStrictEqual(titles(out), ["Bleach", "Naruto"])
})

test("filters across the Watching/CURRENT naming difference", () => {
    const watching = [
        { mediaId: 9, title: "Airing Show", status: "CURRENT", score: 7, totalBytes: 10, files: [], allMissing: false },
    ]
    assert.strictEqual(plugin.applyView(watching, { status: "Watching" }).length, 1)
    assert.strictEqual(plugin.applyView(watching, { status: "CURRENT" }).length, 1)
})

test("treats the All label as no filter", () => {
    assert.strictEqual(plugin.applyView(groups, { status: "All statuses" }).length, 4)
})

test("normalizeStatus canonicalizes the known aliases", () => {
    assert.strictEqual(plugin.normalizeStatus("Watching"), "CURRENT")
    assert.strictEqual(plugin.normalizeStatus("plan to watch"), "PLANNING")
    assert.strictEqual(plugin.normalizeStatus("On Hold"), "PAUSED")
    assert.strictEqual(plugin.normalizeStatus("Rewatching"), "REPEATING")
    assert.strictEqual(plugin.normalizeStatus("COMPLETED"), "COMPLETED")
    assert.strictEqual(plugin.normalizeStatus(null), null)
})

test("searches titles case-insensitively", () => {
    const out = plugin.applyView(groups, { status: "ALL", sort: "title", search: "sword" })
    assert.deepStrictEqual(titles(out), ["Sword Art Online"])
})

test("combines search and status filter", () => {
    const out = plugin.applyView(groups, { status: "DROPPED", sort: "title", search: "naruto" })
    assert.deepStrictEqual(titles(out), [])
})

test("sorts by size descending and ascending", () => {
    const desc = plugin.applyView(groups, { status: "ALL", sort: "size-desc", search: "" })
    assert.deepStrictEqual(titles(desc), ["Naruto", "Unscored Show", "Bleach", "Sword Art Online"])
    const asc = plugin.applyView(groups, { status: "ALL", sort: "size-asc", search: "" })
    assert.deepStrictEqual(titles(asc), ["Sword Art Online", "Bleach", "Unscored Show", "Naruto"])
})

test("sorts by score ascending with unscored entries last", () => {
    const out = plugin.applyView(groups, { status: "ALL", sort: "score-asc", search: "" })
    assert.deepStrictEqual(titles(out), ["Sword Art Online", "Naruto", "Bleach", "Unscored Show"])
})

test("sorts by score descending with unscored entries last", () => {
    const out = plugin.applyView(groups, { status: "ALL", sort: "score-desc", search: "" })
    assert.deepStrictEqual(titles(out), ["Bleach", "Naruto", "Sword Art Online", "Unscored Show"])
})

test("filters by a maximum score", () => {
    const out = plugin.applyView(groups, { status: "ALL", sort: "title", scoreMax: 7 })
    assert.deepStrictEqual(titles(out), ["Naruto", "Sword Art Online"])
})

test("filters by a minimum score", () => {
    const out = plugin.applyView(groups, { status: "ALL", sort: "title", scoreMin: 7 })
    assert.deepStrictEqual(titles(out), ["Bleach"])
})

test("filters by a score range", () => {
    const out = plugin.applyView(groups, {
        status: "ALL", sort: "title", scoreMin: 5, scoreMax: 8,
    })
    assert.deepStrictEqual(titles(out), ["Bleach", "Naruto"])
})

test("a score bound hides unscored anime", () => {
    const out = plugin.applyView(groups, { status: "ALL", sort: "title", scoreMax: 10 })
    assert.strictEqual(out.indexOf("Unscored Show"), -1)
    assert.strictEqual(out.length, 3)
})

test("unscored anime stay when no score bound is set", () => {
    const out = plugin.applyView(groups, { status: "ALL", sort: "title" })
    assert.strictEqual(out.length, 4)
})

test("blank or junk score bounds are ignored", () => {
    assert.strictEqual(plugin.applyView(groups, { scoreMin: "", scoreMax: "" }).length, 4)
    assert.strictEqual(plugin.applyView(groups, { scoreMin: "abc" }).length, 4)
})

test("score filter composes with status, search and sort", () => {
    // The whole point of the request: low-rated completed anime, biggest first.
    const out = plugin.applyView(groups, {
        status: "COMPLETED", sort: "size-desc", search: "", scoreMax: 7,
    })
    assert.deepStrictEqual(titles(out), ["Naruto"])
})

test("toTenScale converts a 100-point score and leaves a 10-point one", () => {
    assert.strictEqual(plugin.toTenScale(85), 8.5)
    assert.strictEqual(plugin.toTenScale(100), 10)
    assert.strictEqual(plugin.toTenScale(70), 7)
    assert.strictEqual(plugin.toTenScale(8), 8)
    assert.strictEqual(plugin.toTenScale(8.5), 8.5)
    assert.strictEqual(plugin.toTenScale(null), null)
})

test("formatScore drops a pointless trailing zero", () => {
    assert.strictEqual(plugin.formatScore(8), "8")
    assert.strictEqual(plugin.formatScore(8.5), "8.5")
    assert.strictEqual(plugin.formatScore(null), "unscored")
})

test("does not mutate the input array", () => {
    const before = titles(groups)
    plugin.applyView(groups, { status: "ALL", sort: "size-desc", search: "" })
    assert.deepStrictEqual(titles(groups), before)
})

test("tolerates missing arguments", () => {
    assert.deepStrictEqual(plugin.applyView(null, null), [])
    assert.strictEqual(plugin.applyView(groups, {}).length, 4)
})
