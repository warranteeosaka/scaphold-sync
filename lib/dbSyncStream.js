'use strict'
const streamArray = require('stream-array')

module.exports = (createStream, diff) => {
  return (newEntries, createHash, concurrency) => {
    const stream = createStream(concurrency)
    diff(newEntries, createHash).then(data => {
      streamArray(data).pipe(stream)
    })
    return stream
  }
}
