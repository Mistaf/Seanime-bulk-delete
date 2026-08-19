const fs = require("node:fs")
const path = require("node:path")

// Loads plugin.js and returns its top-level functions.
//
// plugin.js is written for Seanime's sandbox: a single file of top-level
// declarations with no module system, whose init() Seanime calls itself. To test
// it we compile that same source as a function body and collect the declarations
// it defines. Nothing runs on load beyond the declarations themselves.
//
// This deliberately does NOT use node:vm. Objects created inside a vm realm carry
// that realm's Object.prototype, which makes assert.deepStrictEqual fail on
// otherwise-identical values. Compiling in the host realm keeps returned objects
// directly comparable.
//
// `globals` supplies Seanime globals ($os, $database, ...) as injected parameters
// for any test that needs them.
function loadPlugin(globals) {
    const src = fs.readFileSync(path.join(__dirname, "..", "plugin.js"), "utf8")
    const names = []
    const declaration = /^function\s+([A-Za-z0-9_$]+)/gm
    let match
    while ((match = declaration.exec(src)) !== null) {
        names.push(match[1])
    }

    const injected = globals || {}
    const paramNames = Object.keys(injected)
    const body = src + "\nreturn { " + names.join(", ") + " };"
    const factory = new Function(...paramNames, body)

    const api = factory(...paramNames.map((name) => injected[name]))

    // The pure functions live inside createCore() because Seanime's UI runtime
    // cannot see this file's top-level declarations and reaches them through
    // $shared instead. Flatten them so tests call them directly.
    if (typeof api.createCore === "function") {
        Object.assign(api, api.createCore())
    }

    return api
}

module.exports = { loadPlugin }
