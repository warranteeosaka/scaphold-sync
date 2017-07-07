'use strict'
const parallel = require('parallel-stream')

module.exports = (exec, defaultType, concurrency) =>
  parallel.transform((chunk, encoding, cb) => {
    if (defaultType) {
      if (chunk.type && chunk.type !== defaultType) {
        chunk.error = new Error(`Unexpected type ${chunk.type} in ${defaultType}-typed stream.`)
        return cb(null, chunk)
      } else {
        chunk.type = defaultType
      }
    }
    if (!chunk.type) {
      chunk.error = new Error('No type specified')
      return cb(null, chunk)
    }
    exec(chunk).then(result => {
      cb(null, result)
    })
  }, {objectMode: true, concurrency})
