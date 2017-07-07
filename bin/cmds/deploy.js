'use strict'
const runWithDB = require('../..')
const streamJSON = require('./util/streamJSON')
const handleError = require('./util/handleError')
const last = require('lodash.last')
const sls = require('../../lib/sls')
const path = require('path')

module.exports = {
  command: 'deploy',
  describe: 'Update a scaphold database to match the local schema folder.',
  handler (options) {
    runWithDB(options, db => {
      /****

       TODO: This needs to deploy to an UNIQUE state or endpoint, after the state or
             endpoint is deployed, the old state needs to be undeployed. This way we
             can make sure that both the new version is published before we advice
             scaphold to use it.

       ****/
      var origArgs = process.argv
      process.argv = [origArgs[0], path.join(require.resolve('serverless'), 'bin', 'serverless'), 'deploy', '--verbose', '--stage', options.appName.replace(/-/ig, '')]

      var cleanup = function () {
        process.argv = origArgs
        cleanup = function () {}
      }

      return sls(options.cwd, options.appName.replace(/-/ig, ''))
        .then(sls => {
          console.log('-- Deploying Functions to Server --')
          cleanup()
          return sls.run()
        })
        .catch(e => {
          cleanup()
          if (e.type === 'no-aws-project') {
            return Promise.resolve()
          }
          return Promise.reject(e)
        })
        .then(() => {
          console.log(`-- Comparing the scaphold database --

  region: "${options.region}"
  appName: "${options.appName}"
  appId: "${options.appId}"

-- ... with folder: "${options.schemaFolder}" --`)
          return db.structure
            .compareToFolder(options.schemaFolder)
            .then((data) => {
              console.log(`
-- Running following operations on Scaphold --
${streamJSON(data)}
-- Output ... --`)
              return db.execAll(options.concurrency, data)
                .then(output => {
                  console.log(streamJSON(output))
                  var lastEntry = output
                  while (Array.isArray(lastEntry)) {
                    lastEntry = last(lastEntry)
                  }
                  if (lastEntry && lastEntry.logType === 'error') {
                    console.log('-- Error. --')
                    return process.exit(1)
                  }
                  console.log('-- Done. --')
                })
            })
        })
    })
      .catch(handleError('Error while deploying'))
  }
}
