'use strict'
const readGqlQuery = require('../readGqlQuery')
const query = readGqlQuery(__dirname, 'update')
module.exports = (gqlMgmt, appData, newIntegration, nextChanges, log) => {
  const integration = appData.lookup.integration[newIntegration.type]
  if (!integration) {
    throw new Error(`No integration for type ${newIntegration.type} exists.`)
  }
  const input = {
    id: integration.id,
    appId: appData.appId,
    name: newIntegration.name,
    type: newIntegration.type,
    config: newIntegration.config
  }
  return gqlMgmt(query, {input})
    .then(result => {
      const updated = result['updateIntegration']
      if (updated) {
        return updated['changedIntegration'].id
      }
      return null
    })
    .then(id => {
      log.push({logType: 'update-integration', id})
      return id
    })
}
