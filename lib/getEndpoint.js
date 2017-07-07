'use strict'
const goodErr = require('./goodErr')
const sls = require('./sls')

function noop () {}

module.exports = (servicePath, stage) => {
  return sls(servicePath, stage)
    .then(sls => {
      const AWSInfo = sls.pluginManager.plugins.find(entry => entry.getStackInfo)
      process.argv.push('--stage')
      process.argv.push(stage)
      var cleanup = () => {
        process.argv.pop()
        process.argv.pop()
        cleanup = noop
      }
      return goodErr(AWSInfo.getStackInfo())
        .catch(e => {
          if (/^Stack with id/.test(e.message) && /does not exist.*$/.test(e.message)) {
            e.code = 'stage-not-deployed'
          }
          cleanup()
          return Promise.reject(e)
        })
        .then(() => {
          cleanup()
          const endpoint = AWSInfo.gatheredData.info.endpoint
          if (!endpoint) {
            var err = new Error(`--cwd "${servicePath}" seems to have no AWS http function deployed. Can not fetch the endpoint before you deployed your first function.`)
            err.code = 'no-function-deployed'
            return Promise.reject(err)
          }
          return Promise.resolve(endpoint)
        })
    })
}
