'use strict'
const Promise = require('bluebird')

module.exports = (diff, exec) => {
  return (newEntries, createHash, concurrency) => {
    if (!concurrency) {
      concurrency = 10
    }
    return diff(newEntries, createHash)
      .then(chunks => Promise.map(chunks, exec, {concurrency}))
  }
}
