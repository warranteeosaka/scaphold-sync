'use strict'
var deleteType = require('./delete')

module.exports = (appData, chunk, nextChanges, log) => {
  deleteType(appData, chunk.name, nextChanges, log)
  nextChanges.push({createType: chunk})
}
