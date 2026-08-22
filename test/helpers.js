const fs = require("node:fs")
const path = require("node:path")

// plugin.js is written for Seanime's sandbox: a single file of top-level
// declarations with no module system, whose pure functions all live inside
// createCore() because the UI runtime cannot see this file's top level and
// reaches them through $shared instead. Compile that source as a function body
// and hand back the core.
//
// This deliberately does NOT use node:vm. Objects created inside a vm realm
// carry that realm's Object.prototype, which makes assert.deepStrictEqual fail
// on otherwise-identical values. Compiling in the host realm keeps returned
// objects directly comparable.
function loadPlugin() {
    const src = fs.readFileSync(path.join(__dirname, "..", "plugin.js"), "utf8")
    return new Function(src + "\nreturn createCore()")()
}

module.exports = { loadPlugin }
