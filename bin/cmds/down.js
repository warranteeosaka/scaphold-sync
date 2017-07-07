'use strict'
const runWithDB = require('../..')
const handleError = require('./util/handleError')

module.exports = {
  command: 'down',
  describe: 'Download the scaphold database to a local schema folder.',
  handler (options) {
    runWithDB(options, (db) => {
      process.stdout.write(`Downloading schema from scaphold!

  region: "${options.region}"
  appName: "${options.appName}"
  appId: "${options.appId}"

→ ${options.schemaFolder} ... `)
      return db.structure
        .toFolder(options.schemaFolder)
        .then((data) => {
          console.log('Done.')
        })
    }).catch(handleError('Error while downloading schema from server'))
  }
}
