'use strict'
const fs = require('fs-promise')
const mkdirp = require('mkdirp-promise')
const rimraf = require('rimraf-promise')
const path = require('path')
const keyBy = require('lodash.keyby')
const groupBy = require('lodash.groupby')
const sortBy = require('lodash.sortby')
const sortKeys = require('sort-keys')
const yaml = require('js-yaml')

function subdirP (folder, subfolder) {
  const route = path.join(folder, subfolder)
  return mkdirp(route).then(() => {
    const dir = subdirP.bind(null, route)
    dir.folder = route
    dir.file = name => path.join(route, name)
    return dir
  })
}

function allKeys (obj, handler) {
  return Promise.all(Object.keys(obj).map(name => handler(name, obj[name])))
}

function deleteNullFields (obj) {
  Object.keys(obj).forEach(key => {
    if (obj[key] === null) {
      delete obj[key]
    }
  })
  delete obj.id
  delete obj.createdAt
  delete obj.modifiedAt
}

module.exports = (folder, logicFn, appName, appData) => {
  const subdir = subdirP.bind(null, folder)
  subdir.folder = folder

  return Promise.all([
    rimraf(path.join(folder, 'types')),
    rimraf(path.join(folder, 'logicFunctions')),
    rimraf(path.join(folder, 'app', appName)),
    fs.writeFile(path.join(folder, 'roles.yml'), yaml.dump(appData.roles.map(role => role.name).sort()))
  ]).then(() => Promise.all([
    subdir('types').then(subdir => {
      return allKeys(appData.lookup.type, (typeName, rawType) => {
        if (!rawType.isExtendable) {
          return
        }
        const type = Object.assign({}, rawType)
        delete type.isExtendable
        delete type.isEditable
        delete type.isDeletable
        deleteNullFields(type)
        type.fields = keyBy(sortBy(type.fields.filter(rawField => rawField.isEditable), 'name').map(rawField => {
          const field = Object.assign({}, rawField)
          deleteNullFields(field)
          delete field.isEditable
          return field
        }), 'name')
        type.permissions = type.permissions.map(rawPermission => {
          const permission = Object.assign({}, rawPermission)
          deleteNullFields(permission)
          if (permission.roles) {
            permission.roles = permission.roles.map(role => role.name).sort()
          }
          if (permission.userFields && permission.userFields.length > 0) {
            permission.userFields = permission.userFields.map(field => appData.lookup.field[field.id]).filter(Boolean).map((field) => field.name).sort()
          }
          if (permission.protectedFields && permission.protectedFields.length > 0) {
            permission.protectedFields = permission.protectedFields.map(field => appData.lookup.field[field.id]).filter(Boolean).map(field => field.name).sort()
          }
          return permission
        })
        return fs.writeFile(subdir.file(`${typeName}.yml`), yaml.dump(type))
      })
    }),
    subdir('logicFunctions').then(subdir => {
      const functions = groupBy(appData.logicFunctions, 'mutation')
      return allKeys(functions, (functionName, handlers) => {
        if (handlers.length === 0) {
          return
        }
        var mutation = handlers[0].mutation
        handlers = handlers.map(handler => {
          handler.endpoint = logicFn.parse(handler.uri)
          deleteNullFields(handler)
          delete handler.uri
          delete handler.position
          if (handler.method === 'POST') {
            delete handler.method
          }
          if (handler.headers) {
            delete handler.headers['x-secret']
          }
          if (Object.keys(handler.headers).length === 0) {
            delete handler.headers
          }
          if (handler.type === 'after') {
            delete handler.type
          }
          if (!handler.enabled) {
            handler.disabled = true
          }
          delete handler.enabled
          delete handler.mutation
          return sortKeys(handler, {deep: true})
        })
        return fs.writeFile(subdir.file(`${functionName}.yml`), yaml.dump({
          mutation,
          handlers
        }))
      })
    }),
    subdir(path.join('app', appName))
      .then(subdir => Promise.all([
        // TODO: fs.writeFile(subdir.file('app.yml'), yaml.dump({appData.description})),
        subdir('integrations').then(subdir => {
          const integrations = keyBy(appData.integrations, 'type')
          return allKeys(integrations, (integrationType, integration) =>
            fs.writeFile(subdir.file(`${integrationType}`), yaml.dump({
              name: integration.name,
              type: integration.type,
              config: typeof integration.config === 'object' ? sortKeys(integration.config, {deep: true}) : integration.config
            }))
          )
        })
      ]))
  ]))
}
