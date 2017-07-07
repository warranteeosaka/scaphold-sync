'use strict'
const JSONStream = require('jsonstream')
const runWithDB = require('../..')
const handleError = require('./util/handleError')

module.exports = {
  command: 'stream',
  describe: 'Like exec but processes input as JSON stream rather than JSON Object, potentially faster, potentially more dangerous.',
  handler (options) {
    runWithDB(options, (db) => {
      process.stdin
        .pipe(JSONStream.parse('*'))
        .pipe(db.createStream(options.defaultType, options.concurrency))
        .pipe(JSONStream.stringify())
        .pipe(process.stdout)
        .on('error', handleError('Error during execution'))
    }).catch(handleError('Error while processing the input stream'))
  }
}
