const readGqlQuery = require('./readGqlQuery')
const getAppQuery = readGqlQuery(__dirname, 'query/getApp')
const migrateSchemaQuery = readGqlQuery(__dirname, 'query/migrateSchema')
const Promise = require('bluebird')
const dbStructureCompareToFolder = require('./dbStructureCompareToFolder')
const dbStructureToFolder = require('./dbStructureToFolder')
const type = require('./type')
const integrations = require('./integrations')
const logicFunctions = require('./logicFunctions')

function createLookup (schema, roles, integrations, functions, logicFn) {
  const lookup = {
    type: {},
    fieldByType: {},
    field: {},
    role: {},
    integration: {},
    logicFunction: {}
  }
  schema.types.forEach(type => {
    lookup.type[type.name] = type
    type.fields.forEach(field => {
      const key = `${type.name}#${field.name}`
      lookup.field[field.id] = key
      lookup.fieldByType[key] = field
    })
  })
  roles.forEach(role => {
    lookup.role[role.name] = role
  })
  integrations.forEach(integration => {
    lookup.integration[integration.type] = integration
  })
  functions.forEach(fn => {
    var originalHash = logicFunctions.hash(fn, logicFn.parse(fn.uri))
    // Make sure that each logicFunction gets a unique hash
    // This is important because in a comparison with the logicFunction
    // lookup the "leftovers" will be marked as "to delete" to avoid
    // duplicates
    var hash = originalHash
    var cnt = 0
    while (lookup.logicFunction[hash]) {
      hash = `${originalHash}_${cnt}`
      cnt += 1
    }
    lookup.logicFunction[hash] = fn
  })
  return lookup
}

/**
 * The script to retreive the App (query/getApp.graphql) on purpose only fetches
 * the id's of field references. This method references the actual data after
 * Fetching. The reason for this is consistency: If the parameter of a field
 * changes (i.e. Name) then the referencing permission is updated as well.
 */
function linkLookup (types, lookup) {
  types.forEach(type => {
    if (!type.permissions || type.permissions.length === 0) {
      return
    }
    type.permissions.forEach(permission => {
      if (permission.userFields && permission.userFields.length > 0) {
        permission.userFields = permission.userFields.map(reducedField => lookup.fieldByType[lookup.field[reducedField.id]])
      }
      if (permission.protectedFields && permission.protectedFields.length > 0) {
        permission.protectedFields = permission.protectedFields.map(reducedField => lookup.fieldByType[lookup.field[reducedField.id]])
      }
      if (permission.roles && permission.roles.length > 0) {
        permission.roles = permission.roles.map(role => lookup.role[role.name])
      }
    })
  })
}

module.exports = (getType, gqlMgmt, appId, appName, logicFn) => {
  const concurrency = 5
  const load = () => {
    return gqlMgmt(getAppQuery, {appId})
      .then(data => data.getApp)
      .then(appData => {
        return getType('Role').all('input')
          .then(roles => {
            return {appData, roles}
          })
      })
      .then(({appData, roles}) => {
        appData.appId = appId
        appData.roles = roles
        appData.lookup = createLookup(appData.schemas[0], roles, appData.integrations, appData.logicFunctions, logicFn)
        linkLookup(appData.schemas[0].types, appData.lookup)
        return appData
      })
  }
  const migrateSchema = schema => gqlMgmt(migrateSchemaQuery, {schema})
    .then(data => data.migrateSchema.changedSchema.modifiedAt)
  const execAll = (chunks, app) => {
    if (app) {
      app = Promise.resolve(app)
    } else {
      app = load()
    }
    return app.then(appData => {
      if (appData.name !== appName) {
        console.warn(`[Warning] The used name '${appName}' doesn't match the application name '${appData.name}'`)
      }
      const nextChanges = []
      const log = []
      const preSchemaChunks = []
      const postSchemaChunks = []
      var hasSchemaChange = false
      chunks.forEach(chunk => {
        if (chunk.createIntegration ||
            chunk.deleteIntegration ||
            chunk.updateIntegration ||
            chunk.deleteLogicFunction) {
          return preSchemaChunks.push(chunk)
        }
        if (chunk.createLogicFunction ||
            chunk.updateLogicFunction) {
          return postSchemaChunks.push(chunk)
        }
        hasSchemaChange = true
        if (chunk.createType) {
          return type.create(appData, chunk.createType, nextChanges, log)
        }
        if (chunk.deleteType) {
          return type.delete(appData, chunk.deleteType, nextChanges, log)
        }
        if (chunk.updateType) {
          return type.update(appData, chunk.updateType, nextChanges, log)
        }
        if (chunk.replaceType) {
          return type.replace(appData, chunk.replaceType, nextChanges, log)
        }
        throw new Error(`Don't know how to deal with structure change, chunk '${JSON.stringify(chunk)}'`)
      })

      const schema = {
        appId,
        id: appData.schemas[0].id,
        name: appData.schemas[0].name,
        description: appData.schemas[0].description,
        types: appData.schemas[0].types
      }

      return Promise
        .map(preSchemaChunks, chunk => {
          if (chunk.deleteLogicFunction) {
            return logicFunctions.delete(gqlMgmt, appData, chunk.deleteLogicFunction, nextChanges, log)
          }
          if (chunk.createIntegration) {
            return integrations.create(gqlMgmt, appData, chunk.createIntegration, nextChanges, log)
          }
          if (chunk.updateIntegration) {
            return integrations.update(gqlMgmt, appData, chunk.updateIntegration, nextChanges, log)
          }
          if (chunk.deleteIntegration) {
            return integrations.delete(gqlMgmt, appData, chunk.deleteIntegration, nextChanges, log)
          }
          throw new Error(`Unexpected postSchema change! ${JSON.stringify(chunk)}`)
        }, {concurrency})
        .then(() => (hasSchemaChange) ? migrateSchema(schema) : new Date().toISOString())
        .then(completedAt => {
          if (log.length > 0 && !log.find(entry => !/^delay/.test(entry.logType))) {
            log.push({logType: 'error', error: 'Stalemate.'})
            return log
          } else {
            if (nextChanges.length > 0) {
              log.push({logType: 'step-successful', completedAt})
              return execAll(nextChanges.concat(postSchemaChunks), null)
                .then(nextLog => log.concat(nextLog))
            }
          }
          var afterLogicFns
          if (postSchemaChunks.length > 0) {
            log.push({logType: 'step-successful', completedAt})
            afterLogicFns = Promise
              .map(postSchemaChunks, change => {
                if (change.createLogicFunction) {
                  return logicFunctions.create(gqlMgmt, logicFn, appData, change.createLogicFunction, log)
                }
                if (change.updateLogicFunction) {
                  return logicFunctions.update(gqlMgmt, logicFn, appData, change.updateLogicFunction, log)
                }
                throw new Error(`Unexpected postSchema change! ${JSON.stringify(change)}`)
              }, {concurrency})
              .then(() => new Date().toISOString())
          } else {
            afterLogicFns = Promise.resolve(completedAt)
          }
          return afterLogicFns.then(completedAt => {
            log.push({logType: 'all-successful', completedAt})
            return log
          })
        })
        .catch(error => {
          log.push({logType: 'error', error: error && (error.stack || error.message || error)})
          return log
        })
    })
  }
  const compareToFolder = dbStructureCompareToFolder(load, logicFn, getType)
  const toFolder = folder => load().then(appData =>
    dbStructureToFolder(folder, logicFn, appName, appData)
  )
  return {
    load,
    compareToFolder,
    toFolder,
    execAll,
    exec (chunk, app) {
      if (Object.keys(chunk).length !== 1) {
        return Promise.reject(
          new Error('Every structure operation is expected to have only one attribute for the operation.')
        )
      }
      return execAll([chunk], app)
    }
  }
}
