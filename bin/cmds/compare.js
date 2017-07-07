'use strict'
const runWithDB = require('../..')
const streamJSON = require('./util/streamJSON')
const handleError = require('./util/handleError')

module.exports = {
  command: 'compare',
  describe: 'Compare a scaphold database to the local schema folder.',
  handler (options) {
    runWithDB(options, db =>
      db.structure
        .compareToFolder(options.schemaFolder)
        .then(data => {
          console.log(streamJSON(data))
        })
    ).catch(handleError('Error while comparing to server'))
  }
}
