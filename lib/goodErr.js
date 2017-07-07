'use strict'
module.exports = promise => {
  var stack = new Error('<msg>').stack
  return promise
    .catch(e => {
      e.stack = stack.replace('<msg>', e.message)
      return Promise.reject(e)
    })
}
