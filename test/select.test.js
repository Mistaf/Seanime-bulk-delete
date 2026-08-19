const test = require("node:test")
const assert = require("node:assert")
const { loadPlugin } = require("./helpers")

const plugin = loadPlugin()

const groups = [
    {
        mediaId: 1, title: "Bleach", totalBytes: 300, allMissing: false,
        files: [
            { path: "/a/1.mkv", size: 100, missing: false },
            { path: "/a/2.mkv", size: 200, missing: false },
        ],
    },
    {
        mediaId: 2, title: "SAO", totalBytes: 50, allMissing: false,
        files: [{ path: "/b/1.mkv", size: 50, missing: false }],
    },
    {
        mediaId: 3, title: "Ghost", totalBytes: 0, allMissing: true,
        files: [{ path: "/c/gone.mkv", size: 0, missing: true }],
    },
]

test("selectGroups resolves ids to their groups", () => {
    const out = plugin.selectGroups(groups, [1, 2])
    assert.deepStrictEqual(out.map((g) => g.title), ["Bleach", "SAO"])
})

test("selectGroups ignores ids that are not in the index", () => {
    const out = plugin.selectGroups(groups, [1, 999])
    assert.deepStrictEqual(out.map((g) => g.mediaId), [1])
})

test("selectGroups returns index order, not selection order", () => {
    const out = plugin.selectGroups(groups, [2, 1])
    assert.deepStrictEqual(out.map((g) => g.mediaId), [1, 2])
})

test("selectGroups tolerates missing arguments", () => {
    assert.deepStrictEqual(plugin.selectGroups(null, [1]), [])
    assert.deepStrictEqual(plugin.selectGroups(groups, null), [])
    assert.deepStrictEqual(plugin.selectGroups(groups, []), [])
})

// The safety property: what the confirm screen lists and what deleteGroups
// attempts must be the same set of paths, for the same selection.
test("paths shown for a selection match the paths deleteGroups attempts", () => {
    const ids = [1, 2, 3]
    const chosen = plugin.selectGroups(groups, ids)

    const shown = []
    for (const g of chosen) {
        for (const f of g.files) {
            if (!f.missing) shown.push(f.path)
        }
    }

    const removed = []
    const fakeFs = { remove: (p) => removed.push(p) }
    const res = plugin.deleteGroups(chosen, fakeFs)

    assert.deepStrictEqual(removed, shown)
    assert.deepStrictEqual(res.paths, shown)
})

test("deletableCount counts only files a delete would attempt", () => {
    assert.strictEqual(plugin.deletableCount(groups[0]), 2)
    assert.strictEqual(plugin.deletableCount(groups[2]), 0)
    assert.strictEqual(plugin.deletableCount({
        files: [
            { path: "/d/1.mkv", missing: false },
            { path: "/d/2.mkv", missing: true },
        ],
    }), 1)
})

test("deletableCount tolerates junk input", () => {
    assert.strictEqual(plugin.deletableCount(null), 0)
    assert.strictEqual(plugin.deletableCount({}), 0)
    assert.strictEqual(plugin.deletableCount({ files: [] }), 0)
})
