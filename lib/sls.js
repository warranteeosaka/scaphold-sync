'use strict'
const fs = require('fs')
const path = require('path')
const goodErr = require('./goodErr')
const Serverless = require('serverless')
var cache = {}

function noop () {}

module.exports = (servicePath, stage) => {
  var hash = JSON.stringify({servicePath, stage})
  if (!cache[hash]) {
    var found = false
    ;['serverless.yaml', 'serverless.yml', 'serverless.json'].forEach((file) => {
      try {
        fs.accessSync(path.resolve(servicePath, file))
        found = true
      } catch (e) {}
    })
    if (!found) {
      return Promise.reject(new Error(`--cwd "${servicePath}" does not contain serverless configuration. Are you sure its a serverless project?`))
    }
    process.argv.push('--stage')
    process.argv.push(stage)
    var cleanup = () => {
      process.argv.pop()
      process.argv.pop()
      cleanup = noop
    }
    const sls = new Serverless({stage, servicePath})
    cache[hash] = goodErr(sls.init())
      .then(() => {
        const AWSInfo = sls.pluginManager.plugins.find(entry => entry.getStackInfo)
        if (!AWSInfo) {
          var err = new Error(`--cwd "${servicePath}" seems to be no AWS serverless project. AWS is recommended to use with scaphold and this tool doesnt work without it.`)
          err.code = 'no-aws-project'
          return Promise.reject(err)
        }
        cleanup()
        return sls
      })
      .catch(e => {
        cleanup()
        return Promise.reject(e)
      })
  }
  return cache[hash]
}
