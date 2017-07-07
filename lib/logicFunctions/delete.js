'use strict'
const readGqlQuery = require('../readGqlQuery')
const query = readGqlQuery(__dirname, 'delete')
module.exports = (gqlMgmt, appData, id, nextChanges, log) => {
  return gqlMgmt(query, { appId: appData.appId, id })
    .then(result => {
      const deleted = result['deleteLogicFunction']
      if (deleted) {
        return deleted['changedLogicFunction'].id
      }
      return null
    })
    .then(changedId => {
      log.push({logType: 'delete-logic', id, changedId})
      return changedId
    })
}
