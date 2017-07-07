'use strict'
module.exports = (create, update, createOrUpdate, del) => {
  return chunk => {
    chunk.start = new Date().toISOString()
    var result
    if (chunk.delete) {
      result = del(chunk.delete)
    } else if (chunk.update) {
      result = update(chunk.update)
    } else if (chunk.create) {
      result = create(chunk.create)
    } else if (chunk.data) {
      result = createOrUpdate(chunk.data)
    } else {
      result = Promise.reject(new Error('Unprocessable entry found.'))
    }
    return result.then(result => {
      chunk.result = result
      chunk.end = new Date().toISOString()
      return chunk
    }).catch(e => {
      chunk.error = e
      chunk.end = new Date().toISOString()
      return chunk
    })
  }
}
