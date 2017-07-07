'use strict'
const readGqlQuery = require('../readGqlQuery')
const query = readGqlQuery(__dirname, 'delete')
module.exports = (gqlMgmt, appData, type, nextChanges, log) => {
  const integration = appData.lookup.integration[type]
  if (!integration) {
    throw new Error(`No integration for type ${type} exists.`)
  }
  return gqlMgmt(query, {
    input: {
      appId: appData.appId,
      id: integration.id,
      type: integration.type,
      config: integration.config
    }
  })
    .then(result => {
      const deleted = result['deleteIntegration']
      if (deleted) {
        return deleted['changedIntegration'].id
      }
      return null
    })
    .then(changedId => {
      log.push({logType: 'delete-integration', type, changedId})
      return changedId
    })
}
