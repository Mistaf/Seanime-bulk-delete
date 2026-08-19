const test = require("node:test")
const assert = require("node:assert")
const { loadPlugin } = require("./helpers")

const plugin = loadPlugin()

test("formatBytes renders human-readable sizes", () => {
    assert.strictEqual(plugin.formatBytes(0), "0 B")
    assert.strictEqual(plugin.formatBytes(512), "512 B")
    assert.strictEqual(plugin.formatBytes(1024), "1.0 KB")
    assert.strictEqual(plugin.formatBytes(1536), "1.5 KB")
    assert.strictEqual(plugin.formatBytes(1024 * 1024), "1.0 MB")
    assert.strictEqual(plugin.formatBytes(3.5 * 1024 * 1024 * 1024), "3.5 GB")
})

test("formatBytes tolerates junk input", () => {
    assert.strictEqual(plugin.formatBytes(null), "0 B")
    assert.strictEqual(plugin.formatBytes(undefined), "0 B")
    assert.strictEqual(plugin.formatBytes(-5), "0 B")
})
