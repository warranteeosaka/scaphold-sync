'use strict'
const idKeys = ['mutation', 'method', 'type']

module.exports = (logicFunction, endpoint) =>
  JSON.stringify(idKeys.reduce((result, key) => {
    var value = logicFunction[key]
    if (key === 'headers') {
      value = Object.keys(value).reduce((headers, header) => {
        // Ignoring the secret header because it
        // can change per deployment
        if (header !== 'x-secret') {
          headers[header] = value[header]
        }
        return headers
      }, {})
    }
    result[key] = value
    return result
  }, {endpoint}))
