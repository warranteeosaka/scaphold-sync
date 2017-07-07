const glob = require('glob-promise')
const Promise = require('bluebird')
const path = require('path')
const fs = require('fs-promise')
const yml = require('js-yaml')
const difference = require('lodash.difference')
const isEqual = require('lodash.isequal')
const intersection = require('lodash.intersection')
const logicFnHash = require('./logicFunctions/hash')
const matches = require('lodash.matches')
const acceptedFieldChanges = require('./type/acceptedFieldChanges')

function validateType (file, ymlData) {
  const fileName = /([^/]+).yml/.exec(file)[1]
  if (fileName.toLowerCase() !== ymlData.name.toLowerCase()) {
    throw new Error(`The file name "${file}" has contains a type with name "${ymlData.name}". It should be the same name!`)
  }
}

function isFundamentallyDifferentType (appType, schemaType) {
  return appType.kind !== schemaType.kind || appType.isBridge !== schemaType.isBridge
}

function computeSimpleListChanges (changes, appType, schemaType, propertyName) {
  var appList = appType[propertyName] || []
  var schemaList = schemaType[propertyName] || []
  difference(appList, schemaList).forEach((entry) => {
    changes.push({removeFromSet: {entry, propertyName}})
  })
  difference(schemaList, appList).forEach((entry) => {
    changes.push({addToSet: {entry, propertyName}})
  })
}

function isFundamentallyDifferentField (appField, schemaField) {
  return appField.type !== schemaField.type
}

function sameUnsortedArray (arrayA, arrayB, mapArrayB) {
  if (!arrayA && !arrayB) {
    return true
  }
  if (!arrayA) {
    return arrayB.length === 0
  }
  if (!arrayB) {
    return arrayA.length === 0
  }
  if (arrayA.length !== arrayB.length) {
    return false
  }
  if (arrayA.length === 0) {
    return true
  }
  return matches(arrayA.concat().sort(), arrayB.map(mapArrayB).sort())
}

function sameFields (schemaFields, appFields) {
  return sameUnsortedArray(schemaFields, appFields, field => `${field.type}#${field.name}`)
}

function sameRoles (schemaRoles, appRoles) {
  return sameUnsortedArray(schemaRoles, appRoles, role => role.name)
}

function isSamePermission (schemaPermission, appPermission) {
  const simpleKeys = ['scope', 'enabled', 'create', 'read', 'update', 'delete']
  for (var i = 0; i < simpleKeys.length; i++) {
    let key = simpleKeys[i]
    if (schemaPermission[key] !== appPermission[key]) {
      return false
    }
  }
  if (sameFields(schemaPermission.userFields, appPermission.userFields) &&
    sameFields(schemaPermission.protectedFields, appPermission.protectedFields) &&
    sameRoles(schemaPermission.roles, appPermission.roles)) {
    return true
  }
  return false
}

function findSamePermission (schemaPermissions, appPermission) {
  for (let i = 0; i < schemaPermissions.length; i++) {
    if (isSamePermission(schemaPermissions[i], appPermission)) {
      return i
    }
  }
  return -1
}

function computePermissionChanges (changes, appPermissions, schemaPermissions) {
  const added = schemaPermissions.concat()
  appPermissions
    .forEach((appPermission, appIndex) => {
      const sameIndex = findSamePermission(added, appPermission)
      if (sameIndex !== -1) {
        // This index is not added
        added.splice(sameIndex, 1)
        // This permission can stay ^_^
        return null
      }
      changes.push({removePermission: appIndex})
      return appIndex
    })
  added.forEach((addPermission) => {
    changes.push({addPermission})
  })
}

function isDifferent (a, b) {
  if (a === null || a === undefined || a === '') {
    return b !== null && b !== undefined && a !== ''
  }
  return a !== b
}

function computeFieldChanges (changes, appFields, schemaFields) {
  var appFieldNames = appFields.filter(data => data.isEditable).map(data => data.name)
  var schemaFieldNames = Object.keys(schemaFields)
  difference(appFieldNames, schemaFieldNames).forEach((deletedFieldName) => {
    changes.push({deleteField: deletedFieldName})
  })
  const added = difference(schemaFieldNames, appFieldNames)
  if (added.length > 0) {
    added.forEach((fieldName) => {
      changes.push({createField: schemaFields[fieldName]})
    })
  }
  const other = intersection(schemaFieldNames, appFieldNames)
  appFields.filter(data => other.indexOf(data.name) !== -1).forEach((appField) => {
    const schemaField = schemaFields[appField.name]
    if (isFundamentallyDifferentField(appField, schemaField)) {
      return changes.push({
        replaceField: {
          name: appField.name,
          data: schemaField
        }
      })
    }
    var hasChanged = false
    const updateField = {
      name: appField.name,
      props: {}
    }
    acceptedFieldChanges
      .filter(key => isDifferent(appField[key], schemaField[key]))
      .forEach(key => {
        hasChanged = true
        updateField.props[key] = schemaField[key] || ''
      })
    if (hasChanged) {
      changes.push({updateField})
    }
  }, {})
}

function computeTypeChanges (appType, schemaType) {
  if (isFundamentallyDifferentType(appType, schemaType)) {
    // We need to drop the old type for the new type
    return {
      replaceType: {
        name: schemaType.name,
        data: schemaType
      }
    }
  }
  var changes = []
  if (isDifferent(appType.description, schemaType.description)) {
    changes.push({updateProperty: {name: 'description', value: schemaType.description || ''}})
  }
  ['values', 'interfaces'].forEach(computeSimpleListChanges.bind(null, changes, appType, schemaType))
  computeFieldChanges(changes, appType.fields, schemaType.fields)
  computePermissionChanges(changes, appType.permissions, schemaType.permissions)
  if (changes.length > 0) {
    return {
      updateType: {
        name: schemaType.name,
        changes
      }
    }
  }
  return null
}

function typeDiff (folder, appTypes, concurrency) {
  const existingTypes = {}
  return glob('*.yml', {cwd: path.join(folder, 'types')})
    .then((files) => Promise.map(files, (file) => {
      return fs.readFile(path.join(folder, 'types', file), 'utf8')
        .then((fileData) => yml.load(fileData))
        .then((schemaType) => {
          if (schemaType.fields) {
            Object.keys(schemaType.fields).forEach(fieldName => {
              // Making sure that the names are same and existent
              schemaType.fields[fieldName].name = fieldName
            })
          }
          return schemaType
        })
        .then((schemaType) => {
          validateType(file, schemaType)
          const appType = appTypes[schemaType.name]
          existingTypes[schemaType.name] = true
          if (!appType) {
            return {
              createType: schemaType
            }
          }
          return computeTypeChanges(appType, schemaType)
        })
    }, {concurrency}))
    .then(typeChanges => {
      Object.keys(appTypes).forEach((name) => {
        if (!existingTypes[name]) {
          const type = appTypes[name]
          if (type.isExtendable) {
            typeChanges.push({
              deleteType: name
            })
          }
        }
      })
      return typeChanges
    })
    .then(typeChanges => typeChanges.filter(Boolean))
}

function logicFunctionDiff (folder, logicFunctions, logicFn, concurrency) {
  const base = path.join(folder, 'logicFunctions')
  const deletedFunctions = Object.assign({}, logicFunctions)
  const changes = []
  return glob('*.yml', {cwd: base})
    .then((files) => {
      return Promise
        .map(files, (file) =>
          fs.readFile(path.join(base, file))
            .then((fileData) => yml.load(fileData))
            .then((schemaData) => {
              // Case sensitive check that the mutation is same
              // as the file name. The filename could become all lower or
              // uppercase after checking it out in a case-insensitive system.
              // This is necessary for the integrity of the whole diff
              if (`${schemaData.mutation}.yml`.toLowerCase() !== file.toLowerCase()) {
                throw new Error(`The file name for the logic function: '${file}' does not match its mutation property, it should be: '${schemaData.mutation}.yml' `)
              }
              const foundSchemaFunctions = {}
              const schemaFunctions = schemaData.handlers.map((handler) => {
                handler.mutation = schemaData.mutation
                if (handler.method === undefined) {
                  handler.method = 'POST'
                }
                handler.enabled = !handler.disabled
                delete handler.disabled
                if (handler.headers === undefined) {
                  handler.headers = {}
                }
                handler.headers['x-secret'] = process.env.SCAPHOLD_AWS_COMMUNICATION_SECRET
                if (handler.type === undefined) {
                  handler.type = 'after'
                }
                return handler
              })
              schemaFunctions.forEach((schemaFunction) => {
                const hash = logicFnHash(schemaFunction, schemaFunction.endpoint)
                if (foundSchemaFunctions[hash]) {
                  throw new Error(`The logic function: '${file}.yml' contains two equal functions. This is redundant, please delete one.`)
                }
                foundSchemaFunctions[hash] = true
                const appFunction = deletedFunctions[hash]
                const newFunction = {
                  uri: logicFn.stringify(schemaFunction.endpoint)
                }
                var hasChanged = false
                Object.keys(schemaFunction).forEach((key) => {
                  // The ID is ignored because its always from the appFunction
                  if (key === 'id') {
                    return
                  }
                  // The endpoint is a internal property that should not be
                  // propagated
                  if (key === 'endpoint') {
                    return
                  }
                  // The URI is different per run and we need to create it rather
                  // than copy it
                  if (key === 'uri') {
                    return
                  }
                  newFunction[key] = schemaFunction[key]
                  if (appFunction && !isEqual(schemaFunction[key], appFunction[key])) {
                    hasChanged = true
                  }
                })
                if (!appFunction) {
                  return changes.push({
                    createLogicFunction: newFunction
                  })
                }
                delete deletedFunctions[hash]
                newFunction.id = appFunction.id
                if (hasChanged || appFunction.uri !== newFunction.uri) {
                  changes.push({
                    updateLogicFunction: newFunction
                  })
                }
              })
            })
          , {concurrency})
        .then(() => {
          Object.keys(deletedFunctions).forEach((hash) => {
            changes.push({
              deleteLogicFunction: deletedFunctions[hash].id
            })
          })
          return changes
        })
    })
}

function integrationDiff (folder, appName, integrations, concurrency) {
  const base = path.join(folder, 'app', appName, 'integrations')
  const integrationsToDelete = Object.keys(integrations).reduce((obj, type) => {
    obj[type] = true
    return obj
  }, {})
  const changes = []
  return glob('*', {cwd: base})
    .then((files) => {
      return Promise
        .map(files, (file) =>
          fs.readFile(path.join(base, file))
            .then((fileData) => yml.load(fileData))
            .then((schemaIntegration) => {
              const currentIntegration = integrations[schemaIntegration.type]
              if (currentIntegration) {
                delete integrationsToDelete[schemaIntegration.type]
                const updateIntegration = {
                  id: currentIntegration.id
                }
                var hasChanged = false
                ;['name', 'config', 'type'].forEach((key) => {
                  updateIntegration[key] = schemaIntegration[key]
                  if (!isEqual(schemaIntegration[key], currentIntegration[key])) {
                    hasChanged = true
                  }
                })
                if (hasChanged) {
                  changes.push({
                    updateIntegration
                  })
                }
                return
              }
              changes.push({
                createIntegration: schemaIntegration
              })
            })
          , {concurrency})
        .then(() => {
          Object.keys(integrationsToDelete).forEach((type) => {
            changes.push({
              deleteIntegration: type
            })
          })
          return changes
        })
    })
}

function roleDiff (folder, getType) {
  return fs.readFile(path.join(folder, 'roles.yml'))
    .then((rolesRaw) => {
      return getType('Role')
        .diff(yml.load(rolesRaw).map(name => {
          return {name}
        }), (obj) => obj.name)
        .then((entries) => entries.map((entry) => {
          entry.type = 'Role'
          return entry
        }))
    })
}

module.exports = (load, logicFn, getType) => (folder, concurrency) => {
  return load().then((appData) =>
    Promise.props({
      roles: roleDiff(folder, getType),
      type: typeDiff(folder, appData.lookup.type, concurrency || 10),
      logicFunctions: logicFunctionDiff(folder, appData.lookup.logicFunction, logicFn, concurrency || 10),
      integrations: integrationDiff(folder, appData.name, appData.lookup.integration, concurrency || 10)
    }).then(results => {
      const processes = []
      if (results.roles.length > 0) {
        processes.push({parallel: results.roles})
      }
      const migration = results.type.concat(results.logicFunctions).concat(results.integrations).filter(Boolean)
      if (migration.length > 0) {
        processes.push({migration})
      }
      return processes
    })
  )
}
