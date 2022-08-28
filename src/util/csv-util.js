const ObjectsToCsv = require('objects-to-csv')

const values = []

async function save(dest) {
  await new ObjectsToCsv(values).toDisk(dest)
}

module.exports = { values, save }
