'use strict'
module.exports = (gql, type) => {
  const query = `
    mutation create($input: Create${type}Input!) {
      create${type}(input: $input) {
        changed${type} {
          id
        }
      }
    }
  `
  return input => gql(query, { input })
    .then(result => {
      const created = result[`create${type}`]
      if (created) {
        return created[`changed${type}`].id
      }
      return null
    })
}
