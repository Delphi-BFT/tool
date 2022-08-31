const { LinearScale } = require('chart.js')
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
        borderWidth: 1,
        borderColor: shadowDatasetObj.style.borderColor,
        fill: false,
        pointStyle: shadowDatasetObj.style.pointStyle,
        pointRadius: 5,
        pointBorderColor: shadowDatasetObj.style.pointBorderColor,
      })
    }
    if (plotObj.predefinedDatasets) {
      for (const [predefinedDatasetId, predefinedDatasetObj] of Object.entries(
        plotObj.predefinedDatasets,
      )) {
        console.log(predefinedDatasetObj)
        plotsMap[plotId].data.datasets.push({
          label: predefinedDatasetId,
          borderColor: predefinedDatasetObj.style.borderColor,
          borderWidth: 1,
          fill: false,
          pointStyle: predefinedDatasetObj.style.pointStyle,
          pointRadius: 5,
          pointBorderColor: predefinedDatasetObj.style.pointBorderColor,
          data: predefinedDatasetObj.values,
        })
      }
    }
  }
}

async function pushValue(plotId, datasetId, label, value) {
  let objectToPush = {}
  objectToPush.x = label
  objectToPush.y = value
  for (let dataset of plotsMap[plotId].data.datasets) {
    if (dataset.label == datasetId) dataset.data.push(objectToPush)
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

module.exports = { createPlots, pushValue, generatePlots }
