const { ChartJSNodeCanvas } = require('chartjs-node-canvas')
const path = require('path')
const fs = require('fs').promises
const renderer = new ChartJSNodeCanvas({
  type: 'svg',
  width: 640,
  height: 360,
})

const plotsMap = new Map()

async function createPlots(plots) {
  for (const [plotId, plotObj] of Object.entries(plots)) {
    plotsMap[plotId] = {
      type: 'line',
      options: {
        plugins: {
          title: {
            display: true,
            text: plotObj.details.title,
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: plotObj.details.yAxisTitle,
            },
          },
          x: {
            title: {
              display: true,
              text: plotObj.details.xAxisTitle,
            },
          },
        },
      },
      data: {
        datasets: [],
      },
    }
    for (const [shadowDatasetId, shadowDatasetObj] of Object.entries(
      plotObj.shadowDatasets,
    )) {
      plotsMap[plotId].data.datasets.push({
        label: shadowDatasetId,
        data: [],
        ...shadowDatasetObj.style,
      })
    }
    if (plotObj.predefinedDatasets) {
      for (const [predefinedDatasetId, predefinedDatasetObj] of Object.entries(
        plotObj.predefinedDatasets,
      )) {
        console.log(predefinedDatasetObj)
        plotsMap[plotId].data.datasets.push({
          label: predefinedDatasetId,
          ...predefinedDatasetObj.style,
          data: predefinedDatasetObj.values,
        })
      }
    }
  }
}

async function pushValue(plotId, datasetId, label, value) {
  for (let dataset of plotsMap[plotId].data.datasets) {
    if (dataset.label == datasetId) {
      dataset.data.push({ x: String(label), y: value })
      continue
    }
  }
}
async function generatePlots(experimentsPath) {
  let savePath = path.join(experimentsPath, 'plots')
  await fs.mkdir(savePath, { recursive: true })
  for (const [key, value] of Object.entries(plotsMap)) {
    const buffer = renderer.renderToBufferSync(value)
    await fs.writeFile(
      path.join(savePath, './' + key + '.svg'),
      buffer,
      'base64',
    )
  }
}

function pushStatsToDatasets(plotsObj, stats) {
  for (let p of plotsObj) {
    if (p.metric == 'tps') {
      pushValue(p.name, p.datasetId, p.label, stats.maxThroughput)
      continue
    }
    if (p.metric == 'latency') {
      pushValue(p.name, p.datasetId, p.label, stats.latencyOutlierRemoved)
      continue
    }
    if (p.metric == 'cpu-shadow') {
      pushValue(p.name, p.datasetId, p.label, stats.cpuShadow)
      continue
    }
    if (p.metric == 'mem-shadow') {
      pushValue(p.name, p.datasetId, p.label, stats.memShadow)
      continue
    }
    if (p.metric == 'cpu-app') {
      pushValue(p.name, p.datasetId, p.label, stats.cpuApp)
      continue
    }
    if (p.metric == 'mem-app') {
      pushValue(p.name, p.datasetId, p.label, stats.memApp)
      continue
    }
    if (p.metric == 'mem-host') {
      pushValue(p.name, p.datasetId, p.label, stats.hostActive)
      continue
    }
    if (p.metric == 'elapsed') {
      pushValue(p.name, p.datasetId, p.label, stats.elapsed)
      continue
    }
  }
}

module.exports = { createPlots, pushStatsToDatasets, generatePlots }
