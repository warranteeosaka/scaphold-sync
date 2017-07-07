'use strict'
const fs = require('fs')
const path = require('path')

module.exports = (folder, name) =>
  fs.readFileSync(
    path.resolve(folder, `${name}.graphql`),
    'utf8'
  )
