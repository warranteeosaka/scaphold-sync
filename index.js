/* globals Headers:false */
'use strict'
require('isomorphic-fetch')

const getEndpoint = require('./lib/getEndpoint')
const path = require('path')
const fs = require('fs')

module.exports = (options, template) => {
  var pkg
  function getPkg () {
    if (!pkg) {
      var pkgPath = path.resolve(options.cwd, 'package.json')
      try {
        fs.statSync(pkgPath)
      } catch (e) {
        throw new Error(`Can't access "package.json" file in --cwd, set to "${options.cwd}"`)
      }
      try {
        pkg = require(pkgPath)
      } catch (e) {
        e.message = `Can't read "package.json" ${e.message}`
        throw e
      }
      if (!pkg.scaphold) {
        throw new Error(`There is no scaphold section in the "${pkgPath}" file. We need that for a region and/or appID lookup.`)
      }
    }
    return pkg
  }

  const headers = new Headers()
  if (process.env.SCAPHOLD_TOKEN) {
    headers.set('authorization', `Bearer ${process.env.SCAPHOLD_TOKEN}`)
  } else {
    throw new Error(`The SCAPHOLD_TOKEN environment variable is missing, can't connect to scaphold.`)
  }

  if (!options.region) {
    pkg = getPkg()
    options.region = pkg.scaphold.region
  }

  if (!options.region) {
    options.region = 'us-west-2'
  }

  if (!options.appId) {
    pkg = getPkg()
    if (!pkg.scaphold.apps) {
      throw new Error(`No "appId" given and no "scaphold.apps" object found in package.json.`)
    }
    options.appId = pkg.scaphold.apps[options.appName]
    if (!options.appId) {
      throw new Error(`No "appId" given and no "scaphold.apps.${options.appName}" appId found in package.json.`)
    }
  }

  const opts = { headers }
  const gql = require('./lib/gql')
  const gqlMgmt = gql(`https://${options.region}.api.scaphold.io/management`, opts)
  const gqlApp = gql(`https://${options.region}.api.scaphold.io/graphql/${options.appName}`, opts)
  return getEndpoint(options.cwd, options.appName.replace(/-/ig, ''))
    .then(slsEndpoint => {
      return {
        parse: uri => {
          const execRes = /([^/]*)$/.exec(uri)
          if (!execRes) {
            throw new Error(`Can not parse logic function: ${uri}`)
          }
          const endpoint = execRes[1]
          if (!endpoint) {
            throw new Error(`logicFunction points nowhere?! ${uri} -> ${execRes} -> ${endpoint}`)
          }
          return endpoint
        },
        stringify: endpoint => `${slsEndpoint}/${endpoint}`
      }
    })
    .catch(e => {
      var throwError
      if (e.code === 'no-function-deployed') {
        throwError = () => { throw new Error('You need to deploy or specify functions before you can use them in Scaphold.') }
      } else if (e.code === 'no-aws-project') {
        throwError = () => { throw new Error('Scaphold runs best with AWS and thus this system only knows how to handle aws logic.') }
      } else if (e.code === 'stage-not-deployed') {
        throwError = () => { throw new Error(`It seems you didn't deploy to the stage=${options.stage} or region=${options.region}. Without deploying it is not possible to map functions properly.`) }
      }
      if (throwError) {
        return {
          parse: input => input,
          stringify: input => {
            if (/^https?:\/\//.test(input)) {
              return input
            }
            throwError()
          }
        }
      }
      return Promise.reject(e)
    })
    .then(logicFn => {
      const db = require('./lib/db')(gqlApp, gqlMgmt, options.appId, options.appName, logicFn)
      return template(db)
    })
}
