'use strict'
const dbDel = require('./dbDel')
const dbUpdate = require('./dbUpdate')
const dbCreate = require('./dbCreate')
const dbAll = require('./dbAll')
const dbIntrospectType = require('./dbIntrospectType')
const dbCreateStream = require('./dbCreateStream')
const dbDiff = require('./dbDiff')
const dbSyncStream = require('./dbSyncStream')
const dbSync = require('./dbSync')
const dbExec = require('./dbExec')
const dbCreateOrUpdate = require('./dbCreateOrUpdate')

module.exports = gql => {
  const introspectType = dbIntrospectType(gql)
  const create = type => {
    const del = dbDel(gql, type)
    const update = dbUpdate(gql, type)
    const create = dbCreate(gql, type)
    const all = dbAll(gql, type, introspectType)
    const createOrUpdate = dbCreateOrUpdate(create, update)
    const exec = dbExec(create, update, createOrUpdate, del)
    const createStream = dbCreateStream.bind(null, exec, type)
    const diff = dbDiff(all)
    const syncStream = dbSyncStream(createStream, diff)
    const sync = dbSync(diff, exec)
    return {
      del,
      update,
      create,
      createOrUpdate,
      all,
      exec,
      createStream,
      diff,
      sync,
      syncStream
    }
  }
  const cache = {}
  return type => {
    if (!cache[type]) {
      cache[type] = create(type)
    }
    return cache[type]
  }
}
