'use strict'
module.exports = function streamJSON (data) {
  if (Array.isArray(data)) {
    var result = '[\n'
    data.forEach((entry, nr) => {
      result += streamJSON(entry)
      if (nr !== data.length - 1) {
        result += ','
      }
      result += '\n'
    })
    return result + ']\n'
  } else {
    return JSON.stringify(data)
  }
}
