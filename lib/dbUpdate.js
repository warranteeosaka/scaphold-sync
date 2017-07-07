'use strict'
module.exports = (gql, type) => {
  const query = `
    mutation update($input: Update${type}Input!) {
      update${type}(input: $input) {
        changed${type} {
          id
        }
      }
    }
  `
  return input => gql(query, { input })
    .then(result => {
      const updated = result[`update${type}`]
      if (updated) {
        return updated[`changed${type}`].id
      }
      return null
    })
}
