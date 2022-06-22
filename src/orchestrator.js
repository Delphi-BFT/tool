const eg = require('./util/generate-env');
const yg = require('./util/yamlUtilities');
const plot = require('./util/plot');
const yaml = require('js-yaml');
const fs = require('fs').promises;
const path = require('path');
const { createLogger, format, transports } = require('winston');
const { combine, splat, timestamp, printf } = format;
const { deleteDirectoryIfExists } = require('./util/helpers');
/* misc */
const networkFileName = 'network.gml';
const shadowFileName = 'shadow.yaml';
//const experimentDirectoryPrefix = 'experiments';

/* Connectors */
const hotstuff = require('./connectors/hotstuff');
const bftsmart = require('./connectors/bftsmart');
const { promisified_spawn } = require('./util/exec');
async function getStats(protocol, experimentsPath, protocolPath) {
  return protocol.getStats(experimentsPath, protocolPath);
}
async function build(
  protocol,
  workingDir,
  replicaSettings,
  clientSettings,
  log,
) {
  log.info('Calling protocol build function ...');
  await protocol.build(workingDir, replicaSettings, clientSettings, log);
}
async function configure(
  protocol,
  workingDir,
  replicaSettings,
  clientSettings,
  log,
) {
  log.info('Calling protocol configure function ...');
  return await protocol.configure(
    workingDir,
    replicaSettings,
    clientSettings,
    log,
  );
}
async function run(protocol, executionDir, log) {
  try {
    await promisified_spawn('shadow', ['shadow.yaml'], executionDir, log);
  } catch (e) {
    log.error('simulation exited with non-zero code!');
  }
}

async function createShadowHostConfig(shadowTemplate, replicas, clientDelay) {
  for (let i = 0; i < replicas.length; i++) {
    shadowTemplate = yg.makeHost(
      shadowTemplate,
      replicas[i].name,
      replicas[i].ip,
      i,
      replicas[i].proc,
      replicas[i].env,
      replicas[i].args,
      replicas[i].isClient ? clientDelay : '0s',
    );
  }
  return shadowTemplate;
}

function getProtocolObject(name) {
  if (name == 'bftsmart') return bftsmart;
  if (name == 'hotstuff') return hotstuff;
}
async function backUpArtifact(source, dest) {
  await fs.copyFile(source, dest);
}
async function main() {
  let args = process.argv.slice();
  let experimentDetails = yaml.load(await fs.readFile(args[2], 'utf8'));
  let protocol = getProtocolObject(experimentDetails.protocolName);
  let workingDir = experimentDetails.protocolPath;
  let executionDir = experimentDetails.executionDir;
  let experimentsPath = experimentDetails.experimentsDirectory;
  if(experimentDetails.plots) {
    await plot.createPlots(experimentDetails.plots);
  }
  /* winston logger settings */
  const shadowLogFormat = printf(({ level, message, timestamp }) => {
    let msg = `${timestamp} [${level}] : ${message} `;
    return msg;
  });
  const logger = createLogger({
    level: 'info',
    format: combine(format.colorize(), splat(), timestamp(), shadowLogFormat),
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
    await deleteDirectoryIfExists(path.join(experimentsPath, experimentId));
    let shadowTemplate = yg.makeConfigTemplate(
      networkFileName,
      path.join(experimentsPath, experimentId),
      e[experimentId].misc,
    );
    await build(protocol, workingDir, replicaSettings, clientSettings, logger);
    let hosts = await configure(
      protocol,
      workingDir,
      replicaSettings,
      clientSettings,
      logger,
    );
    shadowTemplate = await createShadowHostConfig(
      shadowTemplate,
      hosts,
      e[experimentId].misc.clientDelay,
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
        '0.0',
      );
    else {
      myGraph = await eg.makeAWSGraph(
        hosts,
        e[experimentId].network.latency.hosts,
        e[experimentId].network.bandwidthUp,
        e[experimentId].network.bandwidthDown,
        '0.0',
        logger,
      );
    }
    await fs.writeFile(networkFilePath, myGraph);
    await run(protocol, executionDir, logger);
    if(e[experimentId].plots) {
      let perfStats = await getStats(protocol, path.join(experimentsPath,experimentId), workingDir);
      for(let p of e[experimentId].plots) {
        if(p.metric == 'tps') {
          plot.pushValue(p.name,p.label,perfStats.throughput);
          continue;
        }
        if(p.metric == 'latency') {
          plot.pushValue(p.name,p.label,perfStats.latency);
          continue;
        }
      }
    }
    await backUpArtifact(
      networkFilePath,
      path.join(experimentsPath, path.join(experimentId, networkFileName)),
    );
    await backUpArtifact(
      shadowFilePath,
      path.join(experimentsPath, path.join(experimentId, shadowFileName)),
    );
  }
  logger.info('generating plots...');
  await plot.generatePlots(experimentsPath);
  logger.info('plots generated!');
}
main();
