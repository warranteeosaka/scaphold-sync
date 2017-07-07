'use strict'
const getEndpoint = require('../../lib/getEndpoint')
const handleError = require('./util/handleError')

module.exports = {
  command: 'endpoint',
  describe: 'Get the endpoint user by serverless.',
  handler (options) {
    getEndpoint(options.cwd, options.appName.replace(/-/ig, ''))
      .then(endpoint => {
        if (endpoint === '') {
          return Promise.reject(new Error(`No function deployed yet, endpoint not yet specified.`))
        }
        console.log(endpoint)
      })
      .catch(handleError('Error while fetching the endpoint'))
  }
}
