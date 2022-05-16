const eg = require('./util/generate-env');
const yg = require('./util/yamlUtilities');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');

const { combine, splat, timestamp, printf } = format;

/* misc */
const networkFileName = 'network.gml';
const shadowFileName = 'shadow.yaml'
const experimentDirectoryPrefix = 'experiments';

/* Connectors */
//const hotstuff = require('hotstuff');
const bftsmart = require('./connectors/bftsmart');

async function build(protocol, workingDir, log) {
  log.info('Calling protocol build function ...');
  await protocol.build(workingDir, log);
}
async function configure(protocol, workingDir, experiment, log) {
  log.info('Calling protocol configure function ...');
  return await protocol.configure(workingDir, experiment, log);
}
async function run(protocol, workingDir) {}
async function getStats(protocol, workingDir) {}

async function createShadowHostConfig(shadowTemplate, replicas) {
  for (let i = 0; i < replicas.length; i++) {
    shadowTemplate = yg.makeHost(
      shadowTemplate,
      replicas[i].name,
      replicas[i].ip,
      i,
      replicas[i].proc,
      replicas[i].env,
      replicas[i].args,
      '0s',
    );
  }
  return shadowTemplate;
}

function getProtocolObject(name) {
  if (name == 'bftsmart') return bftsmart;
}

async function main() {
  const shadowLogFormat = printf(({ level, message, timestamp }) => {
    let msg = `${timestamp} [${level}] : ${message} `;
    return msg;
  });
  const logger = createLogger({
    level: 'info',
    format: combine(format.colorize(), splat(), timestamp(), shadowLogFormat),
    transports: [
      //      new transports.File({ filename: 'error.log', level: 'error' }),
      //    new transports.File({ filename: 'combined.log' }),
      new transports.Console(),
    ],
  });
  logger.info('initiating orchestrator...');

  let args = process.argv.slice();
  let experimentDetails = yaml.load(fs.readFileSync(args[2], 'utf8'));
  let protocol = getProtocolObject(experimentDetails.protocolName);
  let workingDir = experimentDetails.protocolPath;
  let executionDir = experimentDetails.executionDir;

  for (e of experimentDetails.experiments) {
    logger.info('starting new experiment ...');
    let experimentId = Object.keys(e)[0];
    let shadowTemplate = yg.makeConfigTemplate(
      networkFileName,
      path.join(experimentDirectoryPrefix, experimentId),
    );
    await build(protocol, workingDir, logger);
    let hosts = await configure(protocol, workingDir, e, logger);
    shadowTemplate = await createShadowHostConfig(shadowTemplate, hosts);
    // Generate Shadow File
    yg.out(path.join(executionDir, shadowFileName), shadowTemplate);
    let myGraph = eg.createGraphSimple(
      hosts,
      '10 Gbit',
      '10 Gbit',
      '1',
      '0.0',
    );
    fs.writeFileSync(path.join(executionDir, networkFileName), myGraph);
    //await run(protocol);
    //await getStats(protocol);
  }
}
main();
