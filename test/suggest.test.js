const test = require("node:test")
const assert = require("node:assert")
const { loadPlugin } = require("./helpers")

const plugin = loadPlugin()

test("derives the library root from Windows paths", () => {
    const paths = [
        "E:\\Downloads\\Anime\\Torbox\\[SubsPlease] One Piece - 1144\\ep.mkv",
        "E:\\Downloads\\Anime\\Torbox\\[SubsPlease] Bleach - 12\\ep.mkv",
        "E:\\Downloads\\Anime\\Seeded\\Naruto\\ep.mkv",
    ]
    assert.deepStrictEqual(plugin.suggestAllowPaths(paths), ["E:/Downloads/Anime/**/*"])
})

test("always emits forward slashes, whatever the input used", () => {
    // The matcher normalizes the path it checks but not the pattern, so a
    // suggestion containing backslashes would never match anything.
    const out = plugin.suggestAllowPaths(["E:\\anime\\show\\ep.mkv", "E:\\anime\\other\\ep.mkv"])
    assert.deepStrictEqual(out, ["E:/anime/**/*"])
    assert.strictEqual(out[0].indexOf("\\"), -1)
})

test("handles POSIX paths", () => {
    const paths = [
        "/mnt/media/anime/One Piece/ep.mkv",
        "/mnt/media/anime/Bleach/ep.mkv",
    ]
    assert.deepStrictEqual(plugin.suggestAllowPaths(paths), ["/mnt/media/anime/**/*"])
})

test("emits one entry per drive", () => {
    const paths = [
        "E:\\Downloads\\Anime\\A\\ep.mkv",
        "E:\\Downloads\\Anime\\B\\ep.mkv",
        "D:\\Media\\Anime\\C\\ep.mkv",
        "D:\\Media\\Anime\\D\\ep.mkv",
    ]
    const out = plugin.suggestAllowPaths(paths).sort()
    assert.deepStrictEqual(out, ["D:/Media/Anime/**/*", "E:/Downloads/Anime/**/*"])
})

test("a drive holding one anime yields that folder, not a guessed parent", () => {
    // A single path carries no evidence of where the library root sits, so the
    // suggestion stays as deep as the evidence supports. Too narrow only denies
    // access; guessing a shallower parent would widen the allowlist on no basis.
    const out = plugin.suggestAllowPaths(["D:\\Media\\Anime\\Solo\\ep.mkv"])
    assert.deepStrictEqual(out, ["D:/Media/Anime/Solo/**/*"])
})

test("falls back to the shared prefix when libraries diverge", () => {
    const paths = [
        "E:\\Downloads\\Anime\\A\\ep.mkv",
        "E:\\Seeding\\Anime\\B\\ep.mkv",
    ]
    assert.deepStrictEqual(plugin.suggestAllowPaths(paths), ["E:/**/*"])
})

test("a single file suggests its own directory", () => {
    const out = plugin.suggestAllowPaths(["E:\\anime\\show\\ep.mkv"])
    assert.deepStrictEqual(out, ["E:/anime/show/**/*"])
})

test("tolerates empty and junk input", () => {
    assert.deepStrictEqual(plugin.suggestAllowPaths(null), [])
    assert.deepStrictEqual(plugin.suggestAllowPaths([]), [])
    assert.deepStrictEqual(plugin.suggestAllowPaths([null, "", undefined]), [])
})
