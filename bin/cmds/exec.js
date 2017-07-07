'use strict'
const util = require('util')
const last = require('lodash.last')
const runWithDB = require('../..')
const streamJSON = require('./util/streamJSON')
const handleError = require('./util/handleError')

module.exports = {
  command: 'exec',
  describe: 'Execute a set of commands on scaphold that are piped in as JSON.',
  handler (options) {
    runWithDB(options, db => new Promise((resolve, reject) => {
      var data
      const stdin = process.stdin
      stdin.on('readable', () => {
        var chunk = process.stdin.read()
        if (chunk === null && data === undefined) {
          return reject(new Error(`Exec expects that you pipe in the commands!`))
        }
        if (chunk !== null) {
          if (data === undefined) {
            data = chunk
          } else {
            data = Buffer.concat([data, chunk])
          }
        }
      })
      stdin.on('error', reject)
      stdin.on('end', () => {
        if (data === undefined) {
          return reject(new Error(`Exec expects that you pipe in the commands!`))
        }
        var input
        try {
          input = JSON.parse(data.toString())
        } catch (e) {
          return reject(new Error(`Couldn't parse JSON read from stdin: ${e.stack || e.message || util.inspect(e, {depth: null})}`))
        }
        if (!Array.isArray(input)) {
          return reject(new Error(`Expected input read from stdin to be an Array of operations`))
        }
        // Do not show regular error messages from the start of the execution
        // To make sure that the output stays processable
        db.execAll(options.concurrency, input)
          .then((data) => {
            console.log(streamJSON(data))
            var lastEntry = data
            while (Array.isArray(lastEntry)) {
              lastEntry = last(lastEntry)
            }
            if (lastEntry && lastEntry.logType === 'error') {
              return process.exit(1)
            }
            resolve()
          })
          .catch(() => process.exit(1))
      })
    })).catch(handleError('Error while processing all commands'))
  }
}
