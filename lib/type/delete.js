'use strict'
const findIndex = require('lodash.findindex')

module.exports = (appData, name, nextChanges, log) => {
  if (!appData.lookup.type[name]) {
    throw new Error(`Trying to delete type '${name}' that doesn't exist!`)
  }
  const types = appData.schemas[0].types
  const index = findIndex(types, (type) => type.name === name)
  if (index === -1) {
    throw new Error(`The type '${name}' was found in the lookup but not in the types?!`)
  }
  delete appData.lookup.type[name]
  types.splice(index, 1)
  log.push({logType: 'delete-type', name})
}
