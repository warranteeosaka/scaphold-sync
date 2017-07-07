'use strict'
function isCore (type) {
  return type === 'Node' || type === 'Timestamped'
}

function isAvailableInterface (type, appData) {
  if (isCore(type)) {
    return true
  }
  const lookupType = appData.lookup.type[type]
  if (lookupType) {
    return lookupType.kind === 'INTERFACE'
  }
  return false
}
isAvailableInterface.core = isCore

module.exports = isAvailableInterface
