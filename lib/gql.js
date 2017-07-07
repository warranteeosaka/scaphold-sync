// We need the Isomorphic-fetch dependency for graphql-fetch in Node.js
require('isomorphic-fetch')

const graphqlFetch = require('graphql-fetch')
const Promise = require('bluebird')
const last = require('lodash.last')
const util = require('util')

function firstChild (data) {
  for (var name in data) {
    return data[name]
  }
  throw new Error('No child in object: ' + data)
}

const all = (one, query, after) => {
  const fetchAll = (after) => {
    if (!after) {
      after = ''
    }
    return one(query, {after})
      .then((result) => firstChild(result.viewer))
      .then((result) => {
        const nodes = result.edges.map(edge => edge.node)
        if (result.pageInfo.hasNextPage) {
          return fetchAll(last(nodes).id)
            .then(nextNodes => nodes.concat(nextNodes))
        }
        return nodes
      })
  }
  return fetchAll(after)
}

const noError = (one, opts, query, args) =>
  one(opts, query, args)
    .catch(e => null)

function errorString () {
  var data = this.toJSON()
  var result = `${util.inspect(data.error, {depth: null})}

${data.method} → ${data.domain}
`
  if (data.headers) {
    result += `
[HEADERS]
>
>  ${util.inspect(data.headers).split('\n').join('\n>  ')}
>
`
    if (!data.headers.authorization) {
      result += '>>>WARNING: authorization header missing!\n'
    }
    result += '\n'
  }
  result += `
[QUERY]
|
|  ${data.query.split('\n').join('\n|  ')}
|
`
  if (data.variables && Object.keys(data.variables).length > 0) {
    result += `
[VARIABLES]
>
>  ${JSON.stringify(data.variables, null, 2).split('\n').join('\n>  ')}
>
`
  }
  result += data.stack
  return result
}

function errorJSON () {
  var headers
  if (this.opts && this.opts.headers) {
    headers = {}
    this.opts.headers.forEach((value, key) => {
      headers[key] = value
    })
    if (headers.authorization) {
      headers.authorization = '<hidden for security reasons>'
    }
  }
  return {
    code: this.code,
    domain: this.domain,
    error: this.errors || this.error,
    method: (this.opts && this.opts.method) || 'POST',
    query: this.query,
    headers,
    variables: this.args,
    stack: this.stack
  }
}

/**
 * Small helper method to improve the functionality provided by `graphql-fetch`
 *
 * 1. It changes the argument order from `query`, `args`, `opts` → `opts`, `args`, `query`
 *    to be able to bind the authorization info
 * 2. It fails if the result returns an error
 * 3. It adds a 'all' method that allows to load all data
 */
module.exports = (domain, defaults) => {
  const fetch = graphqlFetch(domain)
  const one = (query, args, opts) => {
    const stack = new Error().stack
    const actualOpts = Object.assign(Object.assign({}, opts), defaults)
    return fetch(query, args, actualOpts)
      .catch(err => {
        return {errors: [err]}
      })
      .then(data => {
        if (data.errors) {
          data.domain = domain
          data.query = query
          data.args = args
          data.opts = actualOpts
          data.code = 'gql-error'
          if (data.errors.length === 1) {
            data.error = data.errors[0]
            delete data.errors
          }
          data.stack = stack
          data.toJSON = errorJSON.bind(data)
          data.stack = errorString.apply(data)
          data.toString = function () {
            return data.stack
          }
          return Promise.reject(data)
        }
        return data.data
      })
  }
  one.all = all.bind(null, one)
  one.noError = noError.bind(null, one)
  return one
}

module.exports.all = all
module.exports.noError = noError
