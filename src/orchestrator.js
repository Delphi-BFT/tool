require('dotenv').config()
const eg = require('./util/generate-env')
const yg = require('./util/yaml-util')
const plot = require('./util/plot')
const monitor = require('./util/resource-monitor')
const yaml = require('js-yaml')
const fs = require('fs').promises
const path = require('path')
const csvUtil = require('./util/csv-util')
const { createLogger, format, transports } = require('winston')
const { combine, splat, timestamp, printf } = format
const { deleteDirectoryIfExists, readAndMergeEDF } = require('./util/helpers')
const { performance } = require('perf_hooks')
const { promisified_spawn } = require('./util/exec')
const { isNullOrEmpty } = require('./util/helpers')

async function getStats(protocol, experimentId, log) {
  if (protocol.getStats) return protocol.getStats(experimentId, log)
  else
    return {
      maxThroughput: -1,
      avgThroughput: -1,
      latencyAll: -1,
      latencyOutlierRemoved: -1,
    }
}
async function build(protocol, replicaSettings, clientSettings, log) {
  log.info('Calling protocol build function ...')
  await protocol.build(replicaSettings, clientSettings, log)
}
async function configure(protocol, replicaSettings, clientSettings, log) {
  log.info('Calling protocol configure function ...')
  return await protocol.configure(replicaSettings, clientSettings, log)
}
async function run(executionDir, log) {
  try {
    await promisified_spawn(
      process.env.SHADOW_PROCESS,
      [process.env.SHADOW_FILE],
      executionDir,
      log,
    )
  } catch (e) {
    log.error('simulation exited with non-zero code!')
  }
}

async function createShadowHostConfig(shadowTemplate, replicas) {
  for (let i = 0; i < replicas.length; i++) {
    shadowTemplate = yg.makeHost(
      shadowTemplate,
      replicas[i].name,
      replicas[i].ip,
      i,
      replicas[i].procs,
    )
  }
  return shadowTemplate
}

async function backUpArtifact(source, dest) {
  await fs.copyFile(source, dest)
}
async function main() {
  let args = process.argv.slice()
  let EDF = await readAndMergeEDF(args[2])
  let protocol = require(EDF.protocolConnectorPath)
  let executionDir = protocol.getExecutionDir()
  let experimentsPath = protocol.getExperimentsOutputDirectory()
  if (EDF.plots) {
    await plot.createPlots(EDF.plots)
  }
  /* winston logger settings */
  const shadowLogFormat = printf(({ level, message, timestamp }) => {
    let msg = `${timestamp} [${level}] : ${message} `
    return msg
  })
  const logger = createLogger({
    level: process.env.LOG_LEVEL,
    format: combine(format.colorize(), splat(), timestamp(), shadowLogFormat),
    transports: [
      new transports.File({
        filename: path.join(experimentsPath, 'combined.log'),
      }),
      new transports.Console(),
    ],
  })
  logger.info(process.env)
  /* start*/
  logger.info('initiating orchestrator...')
  for (e of EDF.experiments) {
    logger.info('starting new experiment ...')
    let experimentId = Object.keys(e)[0]
    let replicaSettings = e[experimentId].replica
    let clientSettings = e[experimentId].client
    let shadowFilePath = path.join(executionDir, process.env.SHADOW_FILE)
    let networkFilePath = path.join(executionDir, process.env.NETWORK_FILE)
    logger.info('deleting clashing directories ...')
    await deleteDirectoryIfExists(path.join(experimentsPath, experimentId))
    let shadowTemplate = await yg.makeConfigTemplate(
      isNullOrEmpty(process.env.SHADOW_TEMPLATE)
        ? null
        : process.env.SHADOW_TEMPLATE,
      process.env.NETWORK_FILE,
      path.join(experimentsPath, experimentId),
      e[experimentId].misc,
    )
    await build(protocol, replicaSettings, clientSettings, logger)
    let hosts = await configure(
      protocol,
      replicaSettings,
      clientSettings,
      logger,
    )
    shadowTemplate = await createShadowHostConfig(shadowTemplate, hosts)
    // Generate Shadow File
    await yg.out(shadowFilePath, shadowTemplate)
    let myGraph = ''
    if (e[experimentId].network.latency.uniform)
      myGraph = eg.createGraphSimple(
        hosts,
        e[experimentId].network.bandwidthUp,
        e[experimentId].network.bandwidthDown,
        e[experimentId].network.latency.replicas,
        e[experimentId].network.latency.clients,
        '0.0',
      )
    else {
      myGraph = await eg.makeAWSGraph(
        hosts,
        e[experimentId].network.latency.replicas,
        e[experimentId].network.latency.clients,
        e[experimentId].network.bandwidthUp,
        e[experimentId].network.bandwidthDown,
        '0.0',
        logger,
      )
    }
    await fs.writeFile(networkFilePath, myGraph)
    let experimentStartTime = performance.now()
    await Promise.all([
      run(executionDir, logger),
      (shadowInterval = monitor.register(
        process.env.SHADOW_PROCESS,
        2000,
        logger,
      )),
      (procInterval = monitor.register(
        protocol.getProcessName(),
        2000,
        logger,
      )),
      (totalInterval = monitor.registerSI(2000, logger)),
    ])
    let experimentEndTime = performance.now()
    let elapsedSeconds = (experimentEndTime - experimentStartTime) / 1000
    let resourceUsage = await monitor.unregister(logger)
    let perfStats = await getStats(protocol, experimentId, logger)
    let statsForCSV = {
      experimentId: experimentId,
      maxThroughput: perfStats.maxThroughput,
      avgThroughput: perfStats.avgThroughput,
      latencyAll: perfStats.latencyAll,
      latencyOutlierRemoved: perfStats.latencyOutlierRemoved,
      cpuShadow: resourceUsage[process.env.SHADOW_PROCESS].medianCPU,
      memShadow: resourceUsage[process.env.SHADOW_PROCESS].maxMEM,
      cpuApp: resourceUsage[protocol.getProcessName()].medianCPU,
      memApp: resourceUsage[protocol.getProcessName()].maxMEM,
      hostActive: resourceUsage['total'].maxMEM,
      elapsed: elapsedSeconds,
    }
    csvUtil.values.push(statsForCSV)
    await csvUtil.save(path.join(experimentsPath, process.env.STATS_FILE))
    if (e[experimentId].plots) {
      for (let p of e[experimentId].plots) {
        if (p.metric == 'tps') {
          plot.pushValue(p.name, p.datasetId, p.label, perfStats.maxThroughput)
          continue
        }
        if (p.metric == 'latency') {
          plot.pushValue(
            p.name,
            p.datasetId,
            p.label,
            perfStats.latencyOutlierRemoved,
          )
          continue
        }
        if (p.metric == 'cpu-shadow') {
          plot.pushValue(
            p.name,
            p.datasetId,
            p.label,
            resourceUsage[process.env.SHADOW_PROCESS].medianCPU,
          )
          continue
        }
        if (p.metric == 'mem-shadow') {
          plot.pushValue(
            p.name,
            p.datasetId,
            p.label,
            resourceUsage[process.env.SHADOW_PROCESS].maxMEM,
          )
          continue
        }
        if (p.metric == 'cpu-app') {
          plot.pushValue(
            p.name,
            p.datasetId,
            p.label,
            resourceUsage[protocol.getProcessName()].medianCPU,
          )
          continue
        }
        if (p.metric == 'mem-app') {
          plot.pushValue(
            p.name,
            p.datasetId,
            p.label,
            resourceUsage[protocol.getProcessName()].maxMEM,
          )
          continue
        }
        if (p.metric == 'mem-host') {
          plot.pushValue(
            p.name,
            p.datasetId,
            p.label,
            resourceUsage['total'].maxMEM,
          )
          continue
        }
        if (p.metric == 'elapsed') {
          plot.pushValue(p.name, p.datasetId, p.label, elapsedSeconds)
          continue
        }
      }
    }

    await backUpArtifact(
      networkFilePath,
      path.join(
        experimentsPath,
        path.join(experimentId, process.env.NETWORK_FILE),
      ),
    )
    await backUpArtifact(
      shadowFilePath,
      path.join(
        experimentsPath,
        path.join(experimentId, process.env.SHADOW_FILE),
      ),
    )
  }
  logger.info('generating plots...')
  await plot.generatePlots(experimentsPath)
  logger.info('plots generated!')
}
main()
