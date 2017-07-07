'use strict'
const readGqlQuery = require('../readGqlQuery')
const query = readGqlQuery(__dirname, 'update')
module.exports = (gqlMgmt, logicFn, appData, logicFunction, log) => {
  const input = {
    appId: appData.appId,
    id: logicFunction.id,
    uri: logicFunction.endpoint,
    mutation: logicFunction.mutation,
    description: logicFunction.description,
    headers: logicFunction.headers,
    method: logicFunction.method,
    fragment: logicFunction.fragment,
    enabled: logicFunction.enabled,
    type: logicFunction.type,
    position: logicFunction.position
  }
  return gqlMgmt(query, {input})
    .then(result => {
      const created = result['updateLogicFunction']
      if (created) {
        return created['changedLogicFunction'].id
      }
      return null
    })
    .then(id => {
      log.push({logType: 'update-logic', id})
      return id
    })
}
