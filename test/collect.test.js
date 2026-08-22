const test = require("node:test")
const assert = require("node:assert")
const { loadPlugin } = require("./helpers")

const plugin = loadPlugin()

const entryA = {
    media: { id: 21, title: { userPreferred: "One Piece", romaji: "One Piece" } },
    score: 9,
    status: "CURRENT",
}
const entryB = {
    media: { id: 11061, title: { userPreferred: "Hunter x Hunter" } },
    score: 10,
    status: "COMPLETED",
}

test("reads the MediaListCollection wrapper shape", () => {
    const info = plugin.collectMediaInfo({
        MediaListCollection: { lists: [{ status: "CURRENT", entries: [entryA] }] },
    })
    assert.deepStrictEqual(info[21], {
        title: "One Piece", status: "CURRENT", score: 9,
    })
})

test("reads the lowercase wrapper shape", () => {
    const info = plugin.collectMediaInfo({
        mediaListCollection: { lists: [{ status: "COMPLETED", entries: [entryB] }] },
    })
    assert.strictEqual(info[11061].title, "Hunter x Hunter")
    assert.strictEqual(info[11061].status, "COMPLETED")
})

test("reads a bare lists shape", () => {
    const info = plugin.collectMediaInfo({
        lists: [{ status: "COMPLETED", entries: [entryB] }],
    })
    assert.strictEqual(info[11061].score, 10)
})

test("falls back to the list status when the entry has none", () => {
    const info = plugin.collectMediaInfo({
        lists: [{
            status: "DROPPED",
            entries: [{ media: { id: 1, title: { romaji: "Test" } } }],
        }],
    })
    assert.strictEqual(info[1].status, "DROPPED")
    assert.strictEqual(info[1].title, "Test")
    assert.strictEqual(info[1].score, null)
})

test("reads the score from a getter when the field is not a number", () => {
    // Seanime's entries come from Go structs: a nullable score arrives as a
    // pointer that is not a JS number, with the value behind getScore().
    // Reading only the plain field left every entry unscored.
    const info = plugin.collectMediaInfo({
        lists: [{
            status: "COMPLETED",
            entries: [{
                media: { id: 42, title: { romaji: "Pointer Score" } },
                score: {},
                getScore: function () { return 8 },
            }],
        }],
    })
    assert.strictEqual(info[42].score, 8)
})

test("a getter reporting 0 still counts as unscored", () => {
    const info = plugin.collectMediaInfo({
        lists: [{
            entries: [{
                media: { id: 43, title: { romaji: "Unrated" } },
                score: {},
                getScore: function () { return 0 },
            }],
        }],
    })
    assert.strictEqual(info[43].score, null)
})

test("a throwing getter does not break the collection", () => {
    const info = plugin.collectMediaInfo({
        lists: [{
            entries: [{
                media: { id: 44, title: { romaji: "Broken" } },
                getScore: function () { throw new Error("nope") },
            }],
        }],
    })
    assert.strictEqual(info[44].score, null)
    assert.strictEqual(info[44].title, "Broken")
})

test("reads score and status from listData when the entry has none", () => {
    // Seanime normalizes collections so the user's own list data can sit under
    // listData. Missing this left every anime unscored and statusless, which
    // silently disabled the score sort and the status filter.
    const info = plugin.collectMediaInfo({
        lists: [{
            entries: [{
                media: { id: 5, title: { romaji: "Listed" } },
                listData: { score: 7, status: "COMPLETED" },
            }],
        }],
    })
    assert.strictEqual(info[5].score, 7)
    assert.strictEqual(info[5].status, "COMPLETED")
})

test("reads score and status from media.mediaListEntry", () => {
    const info = plugin.collectMediaInfo({
        lists: [{
            entries: [{
                media: {
                    id: 6,
                    title: { romaji: "Nested" },
                    mediaListEntry: { score: 9, status: "DROPPED" },
                },
            }],
        }],
    })
    assert.strictEqual(info[6].score, 9)
    assert.strictEqual(info[6].status, "DROPPED")
})

test("prefers the entry's own score over listData", () => {
    const info = plugin.collectMediaInfo({
        lists: [{
            entries: [{
                media: { id: 7, title: { romaji: "Both" } },
                score: 8,
                listData: { score: 3 },
            }],
        }],
    })
    assert.strictEqual(info[7].score, 8)
})

test("treats an AniList score of 0 as unscored", () => {
    // AniList reports 0 for entries the user never rated. Keeping that as a real
    // score would put every unrated show at the top of "score lowest first",
    // which is the view used to decide what to delete.
    const info = plugin.collectMediaInfo({
        lists: [{
            status: "COMPLETED",
            entries: [{ media: { id: 7, title: { romaji: "Unrated" } }, score: 0 }],
        }],
    })
    assert.strictEqual(info[7].score, null)
})

test("keeps a genuine low score", () => {
    const info = plugin.collectMediaInfo({
        lists: [{
            status: "COMPLETED",
            entries: [{ media: { id: 8, title: { romaji: "Rated One" } }, score: 1 }],
        }],
    })
    assert.strictEqual(info[8].score, 1)
})

test("returns an empty map for null or unrecognized input", () => {
    assert.deepStrictEqual(plugin.collectMediaInfo(null), {})
    assert.deepStrictEqual(plugin.collectMediaInfo({}), {})
    assert.deepStrictEqual(plugin.collectMediaInfo({ lists: [] }), {})
})

// Cutting these four candidates as "unevidenced" shipped 0.1.1, where every
// anime read as unscored. One of them is the shape a live Seanime returns, so
// each gets a test of its own now.
test("reads scoreRaw on the entry", () => {
    const info = plugin.collectMediaInfo({
        lists: [{ entries: [{ media: { id: 51, title: { romaji: "Raw" } }, scoreRaw: 85 }] }],
    })
    assert.strictEqual(info[51].score, 8.5)
})

test("reads scoreRaw from listData", () => {
    const info = plugin.collectMediaInfo({
        lists: [{ entries: [{ media: { id: 52, title: { romaji: "Listed raw" } }, listData: { scoreRaw: 70 } }] }],
    })
    assert.strictEqual(info[52].score, 7)
})

test("reads getScoreSafe when getScore is absent", () => {
    const info = plugin.collectMediaInfo({
        lists: [{
            entries: [{
                media: { id: 53, title: { romaji: "Safe getter" } },
                getScoreSafe: function () { return 9 },
            }],
        }],
    })
    assert.strictEqual(info[53].score, 9)
})

test("reads getScore on media.mediaListEntry", () => {
    const info = plugin.collectMediaInfo({
        lists: [{
            entries: [{
                media: {
                    id: 54,
                    title: { romaji: "Nested getter" },
                    mediaListEntry: { getScore: function () { return 6 } },
                },
            }],
        }],
    })
    assert.strictEqual(info[54].score, 6)
})
