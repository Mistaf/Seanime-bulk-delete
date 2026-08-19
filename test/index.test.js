const test = require("node:test")
const assert = require("node:assert")
const { loadPlugin } = require("./helpers")

const plugin = loadPlugin()

const info = {
    21: { title: "One Piece", status: "CURRENT", score: 9 },
    30: { title: "Bleach", status: "COMPLETED", score: 8 },
}

// statSize returns a byte count, or null when the file is gone.
function fakeStat(sizes) {
    return (p) => (Object.prototype.hasOwnProperty.call(sizes, p) ? sizes[p] : null)
}

test("groups files by mediaId and sums sizes", () => {
    const files = [
        { path: "/a/op1.mkv", mediaId: 21 },
        { path: "/a/op2.mkv", mediaId: 21 },
        { path: "/b/bl1.mkv", mediaId: 30 },
    ]
    const stat = fakeStat({ "/a/op1.mkv": 100, "/a/op2.mkv": 200, "/b/bl1.mkv": 50 })
    const groups = plugin.buildIndexFrom(files, info, stat)

    assert.strictEqual(groups.length, 2)
    const op = groups.find((g) => g.mediaId === 21)
    assert.strictEqual(op.title, "One Piece")
    assert.strictEqual(op.status, "CURRENT")
    assert.strictEqual(op.score, 9)
    assert.strictEqual(op.files.length, 2)
    assert.strictEqual(op.totalBytes, 300)
    assert.strictEqual(op.allMissing, false)
})

test("excludes unmatched files", () => {
    const files = [
        { path: "/x/unknown.mkv", mediaId: 0 },
        { path: "/y/unknown.mkv", mediaId: -1 },
        { path: "/z/none.mkv" },
        { path: "/a/op1.mkv", mediaId: 21 },
    ]
    const groups = plugin.buildIndexFrom(files, info, fakeStat({ "/a/op1.mkv": 10 }))
    assert.strictEqual(groups.length, 1)
    assert.strictEqual(groups[0].mediaId, 21)
})

test("marks files that no longer exist as missing", () => {
    const files = [
        { path: "/a/op1.mkv", mediaId: 21 },
        { path: "/a/op2.mkv", mediaId: 21 },
    ]
    const groups = plugin.buildIndexFrom(files, info, fakeStat({ "/a/op1.mkv": 100 }))
    const op = groups[0]
    assert.strictEqual(op.files[0].missing, false)
    assert.strictEqual(op.files[1].missing, true)
    assert.strictEqual(op.files[1].size, 0)
    assert.strictEqual(op.totalBytes, 100)
    assert.strictEqual(op.allMissing, false)
})

test("flags a group whose files are all gone", () => {
    const files = [{ path: "/a/op1.mkv", mediaId: 21 }]
    const groups = plugin.buildIndexFrom(files, info, fakeStat({}))
    assert.strictEqual(groups[0].allMissing, true)
    assert.strictEqual(groups[0].totalBytes, 0)
})

test("falls back to a placeholder title for unknown media", () => {
    const files = [{ path: "/a/x.mkv", mediaId: 999 }]
    const groups = plugin.buildIndexFrom(files, info, fakeStat({ "/a/x.mkv": 1 }))
    assert.strictEqual(groups[0].title, "Media #999")
    assert.strictEqual(groups[0].status, null)
    assert.strictEqual(groups[0].score, null)
})

test("accepts capitalized local file fields", () => {
    const files = [{ Path: "/a/op1.mkv", MediaId: 21 }]
    const groups = plugin.buildIndexFrom(files, info, fakeStat({ "/a/op1.mkv": 5 }))
    assert.strictEqual(groups[0].mediaId, 21)
    assert.strictEqual(groups[0].files[0].path, "/a/op1.mkv")
})

test("looksAbsent distinguishes a missing file from a denied one", () => {
    // Only a genuine absence may mark a file missing. Missing files are skipped
    // by deleteGroups, so misreading a permission error as absence would make a
    // delete silently do nothing while claiming the files were already gone.
    assert.strictEqual(plugin.looksAbsent("stat E:/x.mkv: no such file or directory"), true)
    assert.strictEqual(plugin.looksAbsent("CreateFile E:/x.mkv: The system cannot find the file specified."), true)
    assert.strictEqual(plugin.looksAbsent("ENOENT: no such file"), true)

    assert.strictEqual(plugin.looksAbsent("permission denied"), false)
    assert.strictEqual(plugin.looksAbsent("path not allowed by plugin permissions"), false)
    assert.strictEqual(plugin.looksAbsent("access is denied"), false)
    assert.strictEqual(plugin.looksAbsent(""), false)
    assert.strictEqual(plugin.looksAbsent(null), false)
})

test("returns an empty array for no input", () => {
    assert.deepStrictEqual(plugin.buildIndexFrom(null, info, fakeStat({})), [])
    assert.deepStrictEqual(plugin.buildIndexFrom([], info, fakeStat({})), [])
})
