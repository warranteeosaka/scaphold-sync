'use strict'
const isEqual = require('lodash.isequal')

module.exports = (all) => {
  return (newEntries, createHash) => {
    if (!Array.isArray(newEntries)) {
      throw new Error('The entries to compare with needs to be supplied as Array.')
    }
    if (typeof createHash !== 'function') {
      throw new Error('You need to supply a hash function to get the diff.')
    }
    const lookup = newEntries.reduce((lookup, newEntry) => {
      lookup[createHash(newEntry)] = newEntry
      return lookup
    }, {})
    return all('input').then(oldEntries => {
      const changes = []
      oldEntries.forEach(oldEntry => {
        const hash = createHash(oldEntry)
        const newEntry = lookup[hash]
        if (!newEntry) {
          changes.push({delete: oldEntry.id})
        } else {
          newEntry.id = oldEntry.id
          if (!isEqual(oldEntry, newEntry)) {
            changes.push({update: newEntry})
          }
          delete lookup[hash]
        }
      })
      Object.keys(lookup).forEach(hash => {
        changes.push({create: lookup[hash]})
      })
      return changes
    })
  }
}
