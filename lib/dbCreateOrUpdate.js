'use strict'
module.exports = (create, update) => data => data.id ? update(data) : create(data)
