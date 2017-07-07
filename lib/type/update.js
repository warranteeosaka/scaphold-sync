'use strict'
const findIndex = require('lodash.findindex')
const acceptedFieldChanges = require('./acceptedFieldChanges')
const isAvailableType = require('./isAvailableType')
const isAvailableInterface = require('./isAvailableInterface')
const allFieldsMatchInterface = require('./allFieldsMatchInterface')

const defaultFields = require('./defaultFields')

function assertThroughType (type, ofType, throughTypeName, appData, log) {
  if (throughTypeName) {
    if (isAvailableType(throughTypeName, appData)) {
      if (!appData.lookup.type[throughTypeName].isBridge) {
        throw new Error(`Trying to use ${throughTypeName} as a through-type but its just a regular type.`)
      }
      return
    }
    const throughType = {
      name: throughTypeName,
      kind: 'OBJECT',
      isBridge: true,
      description: `A bridge type for the ${throughTypeName} connection.`,
      interfaces: [
        'Timestamped'
      ],
      fields: defaultFields(true)
    }
    appData.lookup.type[throughTypeName] = throughType
    appData.schemas[0].types.push(throughType)
    log.push({logType: 'create-through-type', throughTypeName})
  }
}

function createField (appData, type, fieldData, nextFieldChanges, log) {
  const fieldName = fieldData.name
  const fieldIndex = findIndex(type.fields, (field) => field.name === fieldName)
  if (fieldIndex !== -1) {
    throw new Error(`Can not add new field '${fieldName}' because the field already exists. ${fieldIndex}`)
  }
  if (fieldData.type && !isAvailableType(fieldData.type, appData)) {
    nextFieldChanges.push({createField: fieldData})
    // TODO: prevent endless loop!
    log.push({logType: 'delay-create-field-type-missing', name: fieldData.name, missingType: fieldData.type})
    return
  }
  if (fieldData.ofType && !isAvailableType(fieldData.ofType, appData)) {
    nextFieldChanges.push({createField: fieldData})
    // TODO: prevent endless loop!
    log.push({logType: 'delay-create-field-ofType-missing', name: fieldData.name, missingType: fieldData.ofType})
    return
  }
  if (fieldData.ofTypeNonNull && !isAvailableType(fieldData.ofTypeNonNull, appData)) {
    nextFieldChanges.push({createField: fieldData})
    // TODO: prevent endless loop!
    log.push({logType: 'delay-create-field-ofTypeNonNull-missing', name: fieldData.name, missingType: fieldData.ofTypeNonNull})
    return
  }
  assertThroughType(type, fieldData.ofType, fieldData.through, appData, log)
  type.fields.push(fieldData)
  log.push({logType: 'add-field', typeName: type.name, fieldName})
}
function updateField (appData, type, fieldData, nextFieldChanges, log) {
  const fieldName = fieldData.name
  const field = appData.lookup.fieldByType[`${type.name}#${fieldName}`]
  if (!field) {
    throw new Error(`Can not delete field '${fieldName}' because the field doesn't exist.`)
  }
  // TODO: do the same type tests as with create type
  Object.keys(fieldData.props).forEach((key) => {
    if (acceptedFieldChanges.indexOf(key) === -1) {
      throw new Error(`Can not change property '${key}' of field '${fieldName}' because this property is not supported.`)
    }
    const value = fieldData.props[key]
    field[key] = value
    log.push({logType: 'update-field-property', typeName: type.name, key, value})
  })
}
function replaceField (appData, type, fieldData, nextFieldChanges, log) {
  deleteField(appData, type, fieldData.name, nextFieldChanges, log)
  nextFieldChanges.push({createField: fieldData})
}

function deleteField (appData, type, fieldName, nextFieldChanges, log) {
  const fieldIndex = findIndex(type.fields, (field) => field.name === fieldName)
  if (fieldIndex === -1) {
    throw new Error(`Can not delete field '${fieldName}' because the field doesn't exist.`)
  }
  type.fields.splice(fieldIndex, 1)
  log.push({logType: 'delete-field', typeName: type.name, fieldName})
}
function removePermission (appData, type, permissionIndex, nextFieldChanges, log) {
  if (!type.permissions || type.permissions.length <= permissionIndex) {
    throw new Error(`Can not delete permission '${permissionIndex}' because there are only ${type.permissions.length} permissions on '${type.name}'.`)
  }
  type.permissions.splice(permissionIndex, 1)
  log.push({logType: 'delete-permission', typeName: type.name, permissionIndex})
}

function createNewFields (rawUserFields, appData, errorCode, log) {
  const userFields = []
  for (var i = 0; i < rawUserFields.length; i++) {
    var fieldName = rawUserFields[i]
    var field = appData.lookup.fieldByType[fieldName]
    if (!field) {
      const err = new Error('fieldNotFound')
      err.fieldName = fieldName
      throw err
    }
    userFields.push({
      id: field.id,
      name: field.name
    })
  }
  return userFields
}

function preparePermission (rawPermission, appData, log) {
  var newPermission = Object.assign({}, rawPermission)
  try {
    if (rawPermission.userFields) {
      newPermission.userFields = createNewFields(rawPermission.userFields, appData, 'permission-problem-user-field-not-found', log)
    }
    if (rawPermission.protectedFields) {
      newPermission.protectedFields = createNewFields(rawPermission.protectedFields, appData, 'permission-problem-protected-field-not-found', log)
    }
  } catch (e) {
    if (e.message !== 'fieldNotFound') {
      throw e
    }
    log.push({logType: 'delay-add-permission-problem-userfield-not-found', field: e.fieldName})
    return
  }
  if (rawPermission.roles) {
    newPermission.roles = []
    for (var i = 0; i < rawPermission.roles.length; i++) {
      var roleName = rawPermission.roles[i]
      var role = appData.lookup.role[roleName]
      if (!role) {
        log.push({logType: 'delay-add-permission-problem-role-not-found', roleName})
        return
      }
      newPermission.roles.push({
        id: role.id,
        name: role.name
      })
    }
  }
  return newPermission
}
function addPermission (appData, type, rawPermission, nextFieldChanges, log) {
  if (!type.permissions) {
    type.permissions = []
  }
  const permission = preparePermission(rawPermission, appData, log)
  if (!permission) {
    nextFieldChanges.push({addPermission: rawPermission})
    return
  }
  type.permissions.push(permission)
  log.push({logType: 'add-permission', permission})
}
function addToSet (appData, type, value, nextFieldChanges, log) {
  const {entry, propertyName} = value
  const list = type[propertyName] || (type[propertyName] = [])
  const entryIndex = list.indexOf(entry)
  if (entryIndex !== -1) {
    throw new Error(`${propertyName} '${entry}' has already been added.`)
  }
  if (propertyName === 'interfaces') {
    if (!isAvailableInterface(entry, appData)) {
      log.push({logType: 'delay-add-to-set-interface-missing', typeName: type.name, value})
      nextFieldChanges.push({ addToSet: value })
      return
    }
    if (!isAvailableInterface.core(entry) && !allFieldsMatchInterface(appData.lookup.type[entry], type)) {
      log.push({logType: 'delay-add-to-set-interface-not-implemented', typeName: type.name, value})
      nextFieldChanges.push({ addToSet: value })
      return
    }
  }
  list.push(entry)
  log.push({logType: 'add-to-set', typeName: type.name, value})
}
function removeFromSet (appData, type, value, nextFieldChanges, log) {
  const {entry, propertyName} = value
  if (propertyName === 'interfaces') {
    if (isAvailableInterface.core(entry)) {
      throw new Error(`Can not remove interface '${entry}' because its a core interface.`)
    }
  }
  const list = type[propertyName]
  const entryIndex = list ? list.indexOf(entry) : -1
  if (entryIndex === -1) {
    throw new Error(`${propertyName} '${entry}' is not on set.`)
  }
  list.splice(entryIndex, 1)
  log.push({logType: 'remove-from-set', typeName: type.name, value})
}
function updateProperty (appData, type, chunk, nextFieldChanges, log) {
  const {name, value} = chunk
  type[name] = value
  log.push({logType: 'update-property', name, value, typeName: type.name})
}

module.exports = (appData, chunk, nextChanges, log) => {
  const nextFieldChanges = []
  // TODO: Maintain a global order of operations here and in ./dbStructure
  // 1. deleteField / replaceField
  // 2. createField
  // 3. other
  const type = appData.lookup.type[chunk.name]
  if (!type) {
    throw new Error(`Can not operate on field of type '${chunk.name}' because it doesn't exist.`)
  }
  chunk.changes.forEach((change) => {
    if (change.createField) {
      return createField(appData, type, change.createField, nextFieldChanges, log)
    }
    if (change.deleteField) {
      return deleteField(appData, type, change.deleteField, nextFieldChanges, log)
    }
    if (change.replaceField) {
      return replaceField(appData, type, change.replaceField, nextFieldChanges, log)
    }
    if (change.updateField) {
      return updateField(appData, type, change.updateField, nextFieldChanges, log)
    }
    if (change.addToSet) {
      return addToSet(appData, type, change.addToSet, nextFieldChanges, log)
    }
    if (change.removeFromSet) {
      return removeFromSet(appData, type, change.removeFromSet, nextFieldChanges, log)
    }
    if (change.updateProperty) {
      return updateProperty(appData, type, change.updateProperty, nextFieldChanges, log)
    }
    if (change.addPermission) {
      return addPermission(appData, type, change.addPermission, nextFieldChanges, log)
    }
    if (change.removePermission !== null && change.removePermission !== undefined) {
      return removePermission(appData, type, change.removePermission, nextFieldChanges, log)
    }
    throw new Error(`Don't know how to handle field change: '${JSON.stringify(change)}' for type '${chunk.name}'`)
  })
  if (nextFieldChanges.length > 0) {
    nextChanges.push({
      updateType: {
        name: chunk.name,
        changes: nextFieldChanges
      }
    })
  }
}
