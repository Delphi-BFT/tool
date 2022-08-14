const eg = require('./util/generate-env');
const yg = require('./util/yamlUtilities');
const plot = require('./util/plot');
const monitor = require('./util/resource-monitor');
const yaml = require('js-yaml');
const fs = require('fs').promises;
const path = require('path');
const csvUtil = require('./util/csvUtil');
const { createLogger, format, transports } = require('winston');
const { combine, splat, timestamp, printf } = format;
const { deleteDirectoryIfExists } = require('./util/helpers');
const { performance } = require('perf_hooks');

/* misc */
const networkFileName = 'network.gml';
const shadowFileName = 'shadow.yaml';
const shadowProcessName = 'shadow';
//const experimentDirectoryPrefix = 'experiments';

/* Connectors */
const hotstuff = require('./connectors/hotstuff');
const bftsmart = require('./connectors/bftsmart');
const themis = require('./connectors/themis');
const { promisified_spawn } = require('./util/exec');

async function getStats(protocol, experimentsPath, protocolPath) {
  return protocol.getStats(experimentsPath, protocolPath);
}
async function build(
  protocol,
  workingDir,
  replicaSettings,
  clientSettings,
  log
) {
  log.info('Calling protocol build function ...');
  await protocol.build(
    workingDir,
    replicaSettings,
    clientSettings,
    log
  );
}
async function configure(
  protocol,
  workingDir,
  replicaSettings,
  clientSettings,
  log
) {
  log.info('Calling protocol configure function ...');
  return await protocol.configure(
    workingDir,
    replicaSettings,
    clientSettings,
    log
  );
}
async function run(protocol, executionDir, log) {
  try {
    await promisified_spawn(
      'shadow',
      ['shadow.yaml'],
      executionDir,
      log
    );
  } catch (e) {
    log.error('simulation exited with non-zero code!');
  }
}

async function createShadowHostConfig(
  shadowTemplate,
  replicas,
  clientDelay
) {
  for (let i = 0; i < replicas.length; i++) {
    shadowTemplate = yg.makeHost(
      shadowTemplate,
      replicas[i].name,
      replicas[i].ip,
      i,
      replicas[i].procs
    );
  }
  return shadowTemplate;
}

function getProtocolObject(name) {
  if (name == 'bftsmart') return bftsmart;
  if (name == 'hotstuff') return hotstuff;
  return themis;
}
async function backUpArtifact(source, dest) {
  await fs.copyFile(source, dest);
}
async function main() {
  let args = process.argv.slice();
  let experimentDetails = yaml.load(
    await fs.readFile(args[2], 'utf8')
  );
  let protocol = getProtocolObject(experimentDetails.protocolName);
  let workingDir = experimentDetails.protocolPath;
  let executionDir = experimentDetails.executionDir;
  let experimentsPath = experimentDetails.experimentsDirectory;
  if (experimentDetails.plots) {
    await plot.createPlots(experimentDetails.plots);
  }
  /* winston logger settings */
  const shadowLogFormat = printf(({ level, message, timestamp }) => {
    let msg = `${timestamp} [${level}] : ${message} `;
    return msg;
  });
  const logger = createLogger({
    level: 'info',
    format: combine(
      format.colorize(),
      splat(),
      timestamp(),
      shadowLogFormat
    ),
    transports: [
      new transports.File({
        filename: path.join(experimentsPath, 'combined.log'),
      }),
      new transports.Console(),
    ],
  });
  /* start*/
  logger.info('initiating orchestrator...');
  for (e of experimentDetails.experiments) {
    logger.info('starting new experiment ...');
    let experimentId = Object.keys(e)[0];
    let replicaSettings = e[experimentId].replica;
    let clientSettings = e[experimentId].client;
    let shadowFilePath = path.join(executionDir, shadowFileName);
    let networkFilePath = path.join(executionDir, networkFileName);
    logger.info('deleting clashing directories ...');
    await deleteDirectoryIfExists(
      path.join(experimentsPath, experimentId)
    );
    let shadowTemplate = yg.makeConfigTemplate(
      networkFileName,
      path.join(experimentsPath, experimentId),
      e[experimentId].misc
    );
    await build(
      protocol,
      workingDir,
      replicaSettings,
      clientSettings,
      logger
    );
    let hosts = await configure(
      protocol,
      workingDir,
      replicaSettings,
      clientSettings,
      logger
    );
    shadowTemplate = await createShadowHostConfig(
      shadowTemplate,
      hosts,
      e[experimentId].misc.clientDelay
    );
    // Generate Shadow File
    await yg.out(shadowFilePath, shadowTemplate);
    let myGraph = '';
    if (e[experimentId].network.latency.uniform)
      myGraph = eg.createGraphSimple(
        hosts,
        e[experimentId].network.bandwidthUp,
        e[experimentId].network.bandwidthDown,
        e[experimentId].network.latency.delay,
        '0.0'
      );
    else {
      myGraph = await eg.makeAWSGraph(
        hosts,
        e[experimentId].network.latency.replicas,
        e[experimentId].network.latency.clients,
        e[experimentId].network.bandwidthUp,
        e[experimentId].network.bandwidthDown,
        '0.0',
        logger
      );
    }
    await fs.writeFile(networkFilePath, myGraph);
    let experimentStartTime = performance.now();
    await Promise.all([
      run(protocol, executionDir, logger),
      (shadowInterval = monitor.register(
        shadowProcessName,
        2000,
        logger
      )),
      (procInterval = monitor.register(
        protocol.getProcessName(),
        2000,
        logger
      )),
      (totalInterval = monitor.registerSI(2000, logger)),
    ]);
    let experimentEndTime = performance.now();
    let elapsedSeconds =
      (experimentEndTime - experimentStartTime) / 1000;
    let resourceUsage = await monitor.unregister(logger);
    let perfStats = await getStats(
      protocol,
      path.join(experimentsPath, experimentId),
      workingDir
    );
    let statsForCSV = {
      experimentId: experimentId,
      maxThroughput: perfStats.maxThroughput,
      avgThroughput: perfStats.avgThroughput,
      latencyAll: perfStats.latencyAll,
      latencyOutlierRemoved: perfStats.latencyOutlierRemoved,
      cpuShadow: resourceUsage[shadowProcessName].medianCPU,
      memShadow: resourceUsage[shadowProcessName].maxMEM,
      cpuApp: resourceUsage[protocol.getProcessName()].medianCPU,
      memApp: resourceUsage[protocol.getProcessName()].maxMEM,
      totalHost: resourceUsage['total'].maxMEM,
      elapsed: elapsedSeconds,
    };
    csvUtil.values.push(statsForCSV);
    //console.log(statsForCSV);
    await csvUtil.save(path.join(experimentsPath, 'results.csv'));
    if (e[experimentId].plots) {
      for (let p of e[experimentId].plots) {
        if (p.metric == 'tps') {
          plot.pushValue(p.name, p.label, perfStats.throughput);
          continue;
        }
        if (p.metric == 'latency') {
          plot.pushValue(p.name, p.label, perfStats.latency);
          continue;
        }
        if (p.metric == 'cpu-shadow') {
          plot.pushValue(
            p.name,
            p.label,
            resourceUsage[shadowProcessName].medianCPU
          );
          continue;
        }
        if (p.metric == 'mem-shadow') {
          plot.pushValue(
            p.name,
            p.label,
            resourceUsage[shadowProcessName].maxMEM
          );
          continue;
        }
        if (p.metric == 'cpu-app') {
          plot.pushValue(
            p.name,
            p.label,
            resourceUsage[protocol.getProcessName()].medianCPU
          );
          continue;
        }
        if (p.metric == 'mem-app') {
          plot.pushValue(
            p.name,
            p.label,
            resourceUsage[protocol.getProcessName()].maxMEM
          );
          continue;
        }
        if (p.metric == 'mem-host') {
          plot.pushValue(
            p.name,
            p.label,
            resourceUsage['total'].maxMEM
          );
          continue;
        }
        if (p.metric == 'elapsed') {
          plot.pushValue(p.name, p.label, elapsedSeconds);
          continue;
        }
      }
    }

    await backUpArtifact(
      networkFilePath,
      path.join(
        experimentsPath,
        path.join(experimentId, networkFileName)
      )
    );
    await backUpArtifact(
      shadowFilePath,
      path.join(
        experimentsPath,
        path.join(experimentId, shadowFileName)
      )
    );
  }
  logger.info('generating plots...');
  await plot.generatePlots(experimentsPath);
  logger.info('plots generated!');
}
main();
