'use strict'
const readGqlQuery = require('../readGqlQuery')
const query = readGqlQuery(__dirname, 'create')
module.exports = (gqlMgmt, logicFn, appData, logicFunction, log) => {
  const input = {
    appId: appData.appId,
    uri: logicFunction.uri,
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
      const created = result['createLogicFunction']
      if (created) {
        return created['changedLogicFunction'].id
      }
      return null
    })
    .then(id => {
      log.push({logType: 'create-logic', id})
      return id
    })
}
