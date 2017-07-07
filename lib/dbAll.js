'use strict'
function getQuery (type, fields) {
  const fieldNames = fields
    .map(field => typeof field === 'string' ? {name: field} : field)
    .filter(field => (!field.type || field.type.kind !== 'OBJECT') && field.name !== 'clientMutationId' && field.name !== 'id')
    .map((field, nr) => nr === 0 ? field.name : `              ${field.name}`)
    .join('\n')
  return `
    query getAll($after: String) {
      viewer {
        all${type}s(after: $after) {
          edges {
            node {
              id
              ${fieldNames}
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    }
  `
}

module.exports = (gql, type, introspectType) => {
  if (!introspectType) {
    introspectType = introspectType(gql)
  }
  var defaultQuery
  var fullQuery
  return fields => {
    if (Array.isArray(fields)) {
      return gql.all(getQuery(type, fields))
    }
    if (fields === 'input') {
      if (!defaultQuery) {
        defaultQuery = introspectType.introspect(`Create${type}Input`)
          .then(typeData => getQuery(type, typeData.inputFields || []))
      }
      return defaultQuery.then(query => gql.all(query))
    }
    if (fields === 'full') {
      if (!fullQuery) {
        fullQuery = introspectType.introspect(type)
          .then(typeData => getQuery(type, typeData.fields || []))
      }
      return fullQuery.then(query => gql.all(query))
    }
    return gql.all(getQuery(type, []))
  }
}
