const test = require("node:test")
const assert = require("node:assert")
const { loadPlugin } = require("./helpers")

const plugin = loadPlugin()

function fakeFs(failOn) {
    const removed = []
    return {
        removed: removed,
        remove: (p) => {
            if (failOn && failOn[p]) throw new Error(failOn[p])
            removed.push(p)
        },
    }
}

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
]

test("deletes every file of every group", () => {
    const fs = fakeFs()
    const res = plugin.deleteGroups(groups, fs)
    assert.deepStrictEqual(fs.removed, ["/a/1.mkv", "/a/2.mkv", "/b/1.mkv"])
    assert.strictEqual(res.attempted, 3)
    assert.strictEqual(res.deleted, 3)
    assert.strictEqual(res.bytes, 350)
    assert.deepStrictEqual(res.failed, [])
    assert.deepStrictEqual(res.paths, ["/a/1.mkv", "/a/2.mkv", "/b/1.mkv"])
})

test("a failing file does not stop the batch", () => {
    const fs = fakeFs({ "/a/1.mkv": "permission denied" })
    const res = plugin.deleteGroups(groups, fs)
    assert.deepStrictEqual(fs.removed, ["/a/2.mkv", "/b/1.mkv"])
    assert.strictEqual(res.deleted, 2)
    assert.strictEqual(res.bytes, 250)
    assert.strictEqual(res.failed.length, 1)
    assert.strictEqual(res.failed[0].path, "/a/1.mkv")
    assert.match(res.failed[0].error, /permission denied/)
})

test("skips files already marked missing", () => {
    const withMissing = [{
        mediaId: 3, title: "Ghost", totalBytes: 0, allMissing: false,
        files: [
            { path: "/c/gone.mkv", size: 0, missing: true },
            { path: "/c/here.mkv", size: 10, missing: false },
        ],
    }]
    const fs = fakeFs()
    const res = plugin.deleteGroups(withMissing, fs)
    assert.deepStrictEqual(fs.removed, ["/c/here.mkv"])
    assert.strictEqual(res.attempted, 1)
})

test("empty selection is a no-op", () => {
    const fs = fakeFs()
    const res = plugin.deleteGroups([], fs)
    assert.strictEqual(res.attempted, 0)
    assert.strictEqual(res.deleted, 0)
    assert.deepStrictEqual(fs.removed, [])
})
