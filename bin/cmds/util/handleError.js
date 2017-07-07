'use strict'
const util = require('util')

module.exports = (intro) => (e) => {
  console.error(`-- ${intro} --`)
  console.error(`${e.stack || e.message || util.inspect(e, {depth: null})}`)
  process.exit(1)
}
