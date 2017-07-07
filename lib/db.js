'use strict'
const dbCreateStream = require('./dbCreateStream')
const dbGetType = require('./dbGetType')
const dbStructure = require('./dbStructure')
const Promise = require('bluebird')

function reduceLines (lines, line) {
  if (Array.isArray(line)) {
    return line.reduce(reduceLines, lines)
  }
  lines.push(line)
  return lines
}

function reduceResponse (lines) {
  return lines.reduce(reduceLines, [])
}

module.exports = (gql, gqlMgmt, appId, appName, logicFn) => {
  const getType = dbGetType(gql)
  const structure = dbStructure(getType, gqlMgmt, appId, appName, logicFn)
  const exec = (concurrency, chunk) => {
    if (Object.keys(chunk).length !== 1) {
      return Promise.reject(
        new Error('Every operation is expected to have only one attribute for the operation.')
      )
    }
    if (chunk.structure) {
      return structure.exec(chunk.structure)
    }
    if (chunk.migration) {
      return structure.execAll(chunk.migration)
    }
    if (chunk.parallel) {
      return Promise.map(chunk.parallel, exec.bind(null, concurrency), {concurrency})
    }
    return getType(chunk.type).exec(chunk)
  }
  return {
    getType,
    exec,
    execAll: (concurrency, all) => Promise.mapSeries(all, exec.bind(null, concurrency)).then(reduceResponse),
    createStream: dbCreateStream.bind(null, exec),
    structure
  }
}
