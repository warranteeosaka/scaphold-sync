'use strict'
const readGqlQuery = require('../readGqlQuery')
const query = readGqlQuery(__dirname, 'create')
module.exports = (gqlMgmt, appData, integration, nextChanges, log) => {
  const input = {
    appId: appData.appId,
    name: integration.name,
    type: integration.type,
    config: integration.config
  }
  return gqlMgmt(query, {input})
    .then(result => {
      const created = result['createIntegration']
      if (created) {
        return created['changedIntegration'].id
      }
      return null
    })
    .then(id => {
      log.push({logType: 'create-integration', id})
      return id
    })
}
