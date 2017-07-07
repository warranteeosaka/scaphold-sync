'use strict'
const defaultFields = require('./defaultFields')
const isAvailableInterface = require('./isAvailableInterface')

module.exports = (appData, chunk, nextChanges, log) => {
  if (chunk.isBridge) {
    if (appData.lookup.type[chunk.name]) {
      return
    }
    log.push({logType: 'delay-bridge-waiting-on-necessity', name: chunk.name})
    return
  }
  if (appData.lookup.type[chunk.name]) {
    throw new Error(`Trying to create type '${chunk.name}' that already exists!`)
  }
  const newType = {}
  Object.assign(newType, chunk)
  var nextTypeChanges = []
  if (newType.interfaces) {
    newType.interfaces = newType.interfaces.filter(entry => {
      if (isAvailableInterface.core(entry)) {
        return true
      }
      nextTypeChanges.push({
        addToSet: { entry, propertyName: 'interfaces' }
      })
      log.push({logType: 'delay-add-interface', name: chunk.name, entry})
      return false
    })
  }
  if (newType.fields) {
    Object.keys(newType.fields).forEach(fieldName => {
      // Create all fields using createField due to type checks happening there.
      const field = newType.fields[fieldName]
      field.name = fieldName
      nextTypeChanges.push({createField: field})
    })
  }
  if (newType.permissions && newType.permissions.length > 0) {
    newType.permissions.forEach((permission) => {
      nextTypeChanges.push({addPermission: permission})
    })
    log.push({logType: 'delay-add-permission', name: chunk.name, count: newType.permissions.length})
  }
  if (nextTypeChanges.length > 0) {
    nextChanges.push({updateType: {
      name: chunk.name,
      changes: nextTypeChanges
    }})
  }
  // Only use the default fields  & permissions at first (in an array!)
  newType.fields = defaultFields(newType.isBridge)
  newType.permissions = []
  appData.schemas[0].types.push(newType)
  log.push({logType: 'create-type', name: chunk.name})
}
