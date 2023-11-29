require('dotenv').config()
const eg = require('./util/environment-generator')
const plot = require('./util/plot')
const monitor = require('./util/resource-monitor')
const fs = require('fs').promises
const path = require('path')
const csvUtil = require('./util/csv-util')
const { createLogger, format, transports } = require('winston')
const { combine, splat, timestamp, printf } = format
const {
  deleteDirectoryIfExists,
  readAndMergeEDF,
  backUpArtifact,
} = require('./util/helpers')
const { performance } = require('perf_hooks')
const { promisified_spawn } = require('./util/exec')
const { isNullOrEmpty } = require('./util/helpers')
const crashFault = require('./faults/crash')

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
      ['--use-memory-manager=false', process.env.SHADOW_FILE],
      executionDir,
      log,
    )
  } catch (e) {
    log.error('simulation exited with non-zero code!')
  }
}

async function createShadowHostConfig(shadowTemplate, replicas) {

  //console.log('create Shadow Host Config for .. ' + replicas.length + ' hosts , i.e.,' + JSON.stringify(replicas))
  for (let i = 0; i < replicas.length; i++) {
    shadowTemplate = eg.makeHost(
      shadowTemplate,
      replicas[i].name,
      replicas[i].ip,
      i,
      replicas[i].procs,
    )
  }
  return shadowTemplate
}

async function main() {
  let args = process.argv.slice()
  let EDF = await readAndMergeEDF(args[2])
  eg.parseEDF(EDF)
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
      /*  new transports.File({
        filename: path.join(experimentsPath, 'combined.log'),
      }),
      */
      new transports.Console(),
    ],
  })
  logger.info(process.env)
  /* start*/
  logger.info('initiating orchestrator...')
  for (const EDO of EDF.experiments) {
    console.log(EDO)
    logger.info('starting new experiment ...')
    let experimentId = EDO.name
    let replicaSettings = EDO.replica
    let clientSettings = EDO.client
    let shadowFilePath = path.join(executionDir, process.env.SHADOW_FILE)
    let networkFilePath = path.join(executionDir, process.env.NETWORK_FILE)
    try {
      logger.info('deleting clashing directories ...')
      await deleteDirectoryIfExists(path.join(experimentsPath, experimentId))
      let shadowTemplate = await eg.makeConfigTemplate(
        isNullOrEmpty(process.env.SHADOW_TEMPLATE)
          ? null
          : process.env.SHADOW_TEMPLATE,
        process.env.NETWORK_FILE,
        path.join(experimentsPath, experimentId),
        EDO.misc,
      )
      await build(protocol, replicaSettings, clientSettings, logger)
      let hosts = await configure(
        protocol,
        replicaSettings,
        clientSettings,
        logger,
      )
      if (EDO.fault) {
        if (EDO.fault.type == 'crash')
          await crashFault.crash(
            replicaSettings.replicas,
            hosts,
            EDO.fault.threshold,
            EDO.fault.timestamp,
            EDO.fault.restartClients,
            logger,
          )
      }
      shadowTemplate = await createShadowHostConfig(shadowTemplate, hosts)
      logger.info('Created Shadow Host Config sucessfully')
      // Generate Shadow File
      await eg.out(shadowFilePath, shadowTemplate)
      await eg.exportPNS(hosts, EDO.network, networkFilePath, logger)
      let experimentStartTime = performance.now()
      try {
        await Promise.all([
          run(executionDir, logger),
          (shadowInterval = monitor.register(
            process.env.SHADOW_PROCESS,
            process.env.RESOURCE_MONITOR_INTERVAL,
            logger,
          )),
          (procInterval = monitor.register(
            protocol.getProcessName(),
            process.env.RESOURCE_MONITOR_INTERVAL,
            logger,
          )),
          (totalInterval = monitor.registerSI(
            process.env.RESOURCE_MONITOR_INTERVAL,
            logger,
          )),
        ])
      } catch (e) {
        logger.error(`Experiment did not terminate successfully`)
      }
      if (protocol.getProcessName() == 'java') {
        try {
          await promisified_spawn('killall', ['java'], executionDir, logger)
        } catch (e) {
          logger.info(
            `killall failed, BFT-SMaRt was killed successfully by Shadow ;)`,
          )
        }
      }
      let experimentEndTime = performance.now()
      let elapsedSeconds = (experimentEndTime - experimentStartTime) / 1000
      let resourceUsage = await monitor.unregister(logger)
      let perfStats = await getStats(protocol, experimentId, logger)
      let statsObj = {
        experimentId: experimentId,
        ...perfStats,
        cpuShadow: resourceUsage[process.env.SHADOW_PROCESS].medianCPU,
        memShadow: resourceUsage[process.env.SHADOW_PROCESS].maxMEM,
        cpuApp: resourceUsage[protocol.getProcessName()].medianCPU,
        memApp: resourceUsage[protocol.getProcessName()].maxMEM,
        hostActive: resourceUsage['total'].maxMEM,
        elapsed: elapsedSeconds,
      }
      csvUtil.values.push(statsObj)
      await csvUtil.save(path.join(experimentsPath, process.env.STATS_FILE)) // save CSV after every exp
      if (EDO.plots) {
        plot.pushStatsToDatasets(EDO.plots, statsObj)
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
    } catch (err) {
      logger.error(
        `An error occurred while processing experiment ${experimentId}, error message: ${err.message}`,
      )
      logger.info('moving on to next experiment ...')
    }
  }
  logger.info('generating plots...')
  await plot.generatePlots(experimentsPath)
  logger.info('plots generated!')
}
main()
