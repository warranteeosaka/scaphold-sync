'use strict'
const readGqlQuery = require('./readGqlQuery')
const query = readGqlQuery(__dirname, 'dbIntrospectType')

module.exports = gql => {
  const cache = {}
  return {
    introspect (type) {
      if (!cache[type]) {
        cache[type] = gql.noError(query, { type }).then(result => {
          return result && result['__type']
        })
      }
      const result = cache[type]
        .then(data => data || Promise.reject(new Error(`Type not found: ${type}`)))
      return result
    },
    clear (type) {
      if (cache[type]) {
        delete cache[type]
        return true
      }
      return false
    }
  }
}
