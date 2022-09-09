const fs = require('fs').promises
const yaml = require('js-yaml')
const statistics = require('simple-statistics')
const path = require('path')
async function transformLatencies(hosts) {
  let awsHosts = []
  for (let i = 0; i < hosts.length; i++) {
    let region = Object.keys(hosts[i])[0]
    let amount = Object.values(hosts[i])[0]
    while (amount--) {
      awsHosts.push(region)
    }
  }
  return awsHosts
}
async function backUpArtifact(source, dest) {
  await fs.copyFile(source, dest)
}
async function deleteDirectoryIfExists(path) {
  await fs.rm(path, { recursive: true, force: true })
}

function median(values) {
  if (values.length === 0)
    throw new Error('Array for median calcuation is empty!')

  values.sort(function (first, second) {
    return first - second
  })

  var mid = Math.floor(values.length / 2)

  return values.length & 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2.0
}

function removeOutliers(data) {
  let outlierConstant = 1.5
  let sorted = data.sort(function (a, b) {
    return a - b
  })
  let uq = statistics.quantile(sorted, 0.75)
  let lq = statistics.quantile(sorted, 0.25)
  let IQR = (uq - lq) * outlierConstant
  let quartileSet = [lq - IQR, uq + IQR]
  let resultSet = []
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] >= quartileSet[0] && sorted[i] <= quartileSet[1])
      resultSet.push(sorted[i])
  }
  return resultSet
}
function isNullOrEmpty(obj) {
  return obj === null || obj === undefined || obj === ''
}
function JSONtoDot(topLevelPrefix, json) {
  let res = ''
  if (typeof json !== 'object') {
    return topLevelPrefix + ' = ' + json
  }
  for (const [key, value] of Object.entries(json)) {
    const currentLevelPrefix =
      topLevelPrefix !== '' ? topLevelPrefix + '.' + key : key
    res += JSONtoDot(currentLevelPrefix, value) + '\n'
    continue
  }
  return res
}
async function readAndMergeEDF(EDFPath) {
  let EDF = await yaml.load(await fs.readFile(EDFPath, 'utf8'))
  if (!EDF.plots) return EDF
  for (let plot of Object.entries(EDF.plots)) {
    let currentPlotObj = plot[1]
    if (isNullOrEmpty(currentPlotObj.predefinedDatasets)) continue
    if (
      typeof currentPlotObj.predefinedDatasets === 'string' ||
      currentPlotObj.predefinedDatasets instanceof String
    ) {
      // its is a path
      currentPlotObj.predefinedDatasets = await yaml.load(
        await fs.readFile(
          path.join(EDFPath, `../${currentPlotObj.predefinedDatasets}`),
          'utf-8',
        ),
      )
    }

    // else: predefinedPlots are embedded in current File
  }
  return EDF
}
module.exports = {
  transformLatencies,
  deleteDirectoryIfExists,
  median,
  removeOutliers,
  isNullOrEmpty,
  readAndMergeEDF,
  backUpArtifact,
  JSONtoDot,
}
