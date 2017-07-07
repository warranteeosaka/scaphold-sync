'use strict'
module.exports = (interfaceType, type) => {
  for (var i = 0; i < interfaceType.fields.length; i++) {
    var interfaceField = interfaceType.fields[i]
    var found = false
    for (var j = 0; !found && j < type.fields.length; j++) {
      var typeField = type.fields[j]
      if (interfaceField.name !== typeField.name) {
        continue
      }
      if (interfaceField.type !== typeField.type ||
          interfaceField.ofType !== typeField.ofType ||
          interfaceField.ofTypeNonNull !== typeField.ofTypeNonNull ||
          interfaceField.nonNull !== typeField.nonNull
        ) {
        // Same name, different type - not good
        return false
      }
      found = true
    }
    if (!found) {
      return false
    }
  }
  return true
}
