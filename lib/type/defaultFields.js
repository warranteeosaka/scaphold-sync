'use strict'
module.exports = (isBridge) => [{
  name: 'id',
  description: 'A globally unique ID.',
  unique: true,
  type: 'ID',
  defaultValue: null
}, {
  name: 'createdAt',
  description: 'When paired with the Node interface, this is an automatically managed timestamp that is set when an object is first created.',
  unique: false,
  type: 'DateTime',
  defaultValue: 'NOW'
}, {
  name: 'modifiedAt',
  description: 'When paired with the Node interface, this is an automatically managed timestamp that is set whenever an object is mutated.',
  unique: false,
  type: 'DateTime',
  defaultValue: 'NOW'
}].map((field, position) => {
  Object.assign(field, {
    position,
    isEditable: false,
    ofType: null,
    ofTypeNonNull: false,
    through: null,
    indexed: false,
    reverseName: null,
    columnName: null,
    nonNull: true
  })
  return field
}).filter(field => isBridge ? field.name !== 'id' : true)
