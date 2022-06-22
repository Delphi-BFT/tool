const { LinearScale } = require('chart.js');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const path = require('path');
const fs = require('fs').promises;
const renderer = new ChartJSNodeCanvas({
    type: 'svg',
    width: 640,
    height: 360,
  });

const plotsMap = new Map();
async function createPlots(plots) {

      for(let p of Object.entries(plots)) {
        let plotId = p[0];
        let plotObj = p[1];
        console.log(plotId);
        plotsMap[plotId] = {
            type: 'line',
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: plotObj.details.title
                    }
                },
                scales: {
                  y: {
                    title: {
                      display: true,
                      text: plotObj.details.yAxisTitle
                    }
                  },
                  x: {
                    title: {
                      display: true,
                      text: plotObj.details.xAxisTitle
                    }
                  }
                }
            },
            data: {
                datasets:[
                    {
                        label: plotObj.shadowPlot.style.label,
                        data:[],
                        borderWidth: 1,
                        borderColor: plotObj.shadowPlot.style.borderColor,
                        fill: false,
                        pointStyle: plotObj.shadowPlot.style.pointStyle,
                        pointRadius: 5,
                        pointBorderColor: plotObj.shadowPlot.style.pointBorderColor 
                    }
                ]
            }
        };
        console.log(JSON.stringify(plotsMap));
        for(let predefinedPlot of Object.entries(plotObj.predefinedPlots)) {
            let predefinedPlotObj = predefinedPlot[1];
            console.log(predefinedPlotObj);
            let plotDetails = {};
            plotDetails.label = predefinedPlotObj.style.label;
            plotDetails.borderColor = predefinedPlotObj.style.borderColor;
            plotDetails.borderWidth= 1;
            plotDetails.fill= false,
            plotDetails.pointStyle= predefinedPlotObj.style.pointStyle,
            plotDetails.pointRadius= 5,
            plotDetails.pointBorderColor=predefinedPlotObj.style.pointBorderColor;
            plotDetails.data = predefinedPlotObj.values;
            plotsMap[plotId].data.datasets.push(plotDetails);
        }
    }
}

async function pushValue (plotId, label, value) {
    let objectToPush =  {};
    objectToPush.x = String(label);
    objectToPush.y = String(value);
    console.log('toPush:'+JSON.stringify(objectToPush));
    plotsMap[plotId].data.datasets[0].data.push(objectToPush);
}
async function generatePlots(experimentsPath) {
  let savePath = path.join(experimentsPath, 'plots');
  await fs.mkdir(savePath, {recursive: true});
  console.log(JSON.stringify(plotsMap));
  for (const [key, value] of Object.entries(plotsMap)) {
    console.log('KEY:'+key);
    const buffer =  renderer.renderToBufferSync(value);
    await fs.writeFile(path.join(savePath,'./' + key + '.svg'), buffer, 'base64');
  }
}

module.exports = {createPlots, pushValue, generatePlots};