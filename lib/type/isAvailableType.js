'use strict'
const defaultTypes = [
  'String',
  'Role',
  'Int',
  'Float',
  'Boolean',
  'DateTime',
  'JSON',
  'Text',
  'Connection',
  'List'
].reduce((obj, key) => {
  obj[key] = true
  return obj
}, {})

module.exports = (type, appData) => {
  if (defaultTypes[type]) {
    return true
  }
  if (appData.lookup.type[type]) {
    return true
  }
  return false
}
