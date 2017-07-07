'use strict'
module.exports = (gql, type) => {
  const query = `
    mutation delete($id: ID!) {
      delete${type}(input: {id: $id}) {
        changed${type} {
          id
        }
      }
    }
  `
  return (id) => gql(query, { id })
    .then(result => {
      const deleted = result[`delete${type}`]
      if (deleted) {
        return deleted[`changed${type}`].id
      }
      return null
    })
}
