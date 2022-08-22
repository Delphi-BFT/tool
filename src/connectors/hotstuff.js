const fs = require('fs').promises;
const path = require('path');
const ipUtil = require('../util/ip-util');
const { promisified_spawn } = require('../util/exec');
const util = require('util');
const exec = util.promisify(require('node:child_process').exec);

const processName = 'hotstuff-app';

function getProcessName() {
  return processName;
}

async function writeHosts(ips, log) {
  let replicaString = '';
  let clientString = '';
  for (let i = 0; i < ips.length; i++) {
    if (ips[i].isClient)
      clientString += ips[i].ip + ' ' + ips[i].ip + '\n';
    else replicaString += ips[i].ip + ' ' + ips[i].ip + '\n';
  }
  await fs.writeFile(
    path.join(
      process.env.HOTSTUFF_DIR,
      process.env.HOTSTUFF_REPLICAS_FILE
    ),
    replicaString
  );
  log.info('Wrote replicas file!');
  await fs.writeFile(
    path.join(
      process.env.HOTSTUFF_DIR,
      process.env.HOTSTUFF_CLIENTS_FILE
    ),
    clientString
  );
  log.info('Wrote clients file!');
}

async function genArtifacts(blockSize, log) {
  log.info('Generating artifacts...');
  await promisified_spawn(
    './gen_all.sh',
    [blockSize],
    path.join(
      process.env.HOTSTUFF_DIR,
      process.env.HOTSTUFF_GENSCRIPT_WORKING_DIR
    ),
    log
  );
  log.info('Finished generating artifacts...');
}
async function passArgs(
  hosts,
  outStandingPerClient,
  numberOfClientHosts,
  numberOfClients,
  log
) {
  let replicaIndex = 0;
  let clientIndex = 0;
  let clientHostIndex = 1; // BEWARE: IT STARTS AT 1
  let clientsPerHost = Math.floor(
    numberOfClients / numberOfClientHosts
  );
  let clientsOnLastHost =
    clientsPerHost + (numberOfClients % numberOfClientHosts); // WATCH OUT CAN BE 0

  for (let i = 0; i < hosts.length; i++) {
    if (hosts[i].isClient) {
      let clientsOnCurrentHost =
        clientHostIndex < numberOfClientHosts
          ? clientsPerHost
          : clientsOnLastHost;
      hosts[i].procs = [];
      for (let j = 0; j < clientsOnCurrentHost; j++) {
        hosts[i].procs.push({
          path: process.env.HOTSTUFF_CLIENT_BIN,
          env: '',
          args: `--idx ${clientIndex} --iter -1 --max-async ${outStandingPerClient}`,
        });
        clientIndex++;
      }
      clientHostIndex++;
      continue;
    }
    let conf = path.join(
      process.env.HOTSTUFF_GENSCRIPT_WORKING_DIR,
      `hotstuff.gen-sec${replicaIndex}.conf`
    );
    hosts[i].procs = [];
    hosts[i].procs.push({
      path: process.env.HOTSTUFF_REPLICA_BIN,
      env: '',
      args: `--conf ${conf}`,
    });
    replicaIndex++;
  }
  return hosts;
}
async function copyConfig(log) {
  await promisified_spawn(
    'cp',
    [
      path.join(
        process.env.HOTSTUFF_DIR,
        path.join(
          process.env.HOTSTUFF_GENSCRIPT_WORKING_DIR,
          'hotstuff.gen.conf'
        )
      ),
      path.join(process.env.HOTSTUFF_DIR, 'hotstuff.conf'),
    ],
    process.env.HOTSTUFF_DIR,
    log
  );
}

async function getStats(experimentId, log) {
  let grep = await exec(
    `cat ./hosts/*/*.stderr | python3 ${path.join(
      process.env.HOTSTUFF_DIR,
      process.env.HOTSTUFF_STATS_SCRIPT
    )}`,
    {
      cwd: path.join(
        process.env.HOTSTUFF_EXPERIMENTS_OUTPUT_DIR,
        experimentId
      ),
    }
  );
  let tokens = grep.stdout.toString().split('\n');
  let stripped = tokens[0].replace('[', '').replace(']', '');
  let arr = stripped.split(', ');
  let numArr = [];
  arr.forEach((element) => numArr.push(Number(element)));
  let max = -1;
  numArr.forEach((element) => {
    max = element > max ? element : max;
  });
  // Average TPS
  let averageTPS = -1;
  if (numArr.length > 2) {
    for (let i = 1; i < numArr.length - 1; i++)
      averageTPS += numArr[i];
    averageTPS = averageTPS / (numArr.length - 2);
  }
  let latencyStringAll = tokens[1]
    .replace('lat = ', '')
    .replace('ms', '');
  let latencyStringNoOutlier = tokens[2]
    .replace('lat = ', '')
    .replace('ms', '');
  let latencyAll = Number(latencyStringAll);
  let latencyNoOutlier = Number(latencyStringNoOutlier);
  let returnVal = {
    maxThroughput: max,
    avgThroughput: averageTPS,
    latencyAll: latencyAll,
    latencyOutlierRemoved: latencyNoOutlier,
  };
  return returnVal;
}
async function build(replicaSettings, clientSettings, log) {
  await promisified_spawn(
    'cmake',
    [
      '-DCMAKE_BUILD_TYPE=Release',
      '-DBUILD_SHARED=ON',
      '-DHOTSTUFF_PROTO_LOG=ON',
      `-DCMAKE_CXX_FLAGS=-g -DHOTSTUFF_ENABLE_BENCHMARK -DHOTSTUFF_CMD_RESPSIZE=${replicaSettings.replySize} -DHOTSTUFF_CMD_REQSIZE=${clientSettings.requestSize}`,
    ],
    process.env.HOTSTUFF_DIR,
    log
  );
  await promisified_spawn('make', [], process.env.HOTSTUFF_DIR, log);
  log.info('HotStuff build terminated successfully!');
}
async function configure(replicaSettings, clientSettings, log) {
  const hostIPs = await ipUtil.getIPs({
    [process.env.HOTSTUFF_REPLICA_HOST_PREFIX]:
      replicaSettings.replicas,
    [process.env.HOTSTUFF_CLIENT_HOST_PREFIX]:
      clientSettings.numberOfHosts,
  });
  for (let i = 0; i < hostIPs.length; i++) {
    if (
      hostIPs[i].name.startsWith(
        process.env.HOTSTUFF_REPLICA_HOST_PREFIX
      )
    )
      hostIPs[i].isClient = false;
    else hostIPs[i].isClient = true;
  }
  await writeHosts(hostIPs, log);
  await genArtifacts(replicaSettings.blockSize, log);
  let hosts = await passArgs(
    hostIPs,
    clientSettings.outStandingPerClient,
    clientSettings.numberOfHosts,
    clientSettings.clients,
    log
  );
  await copyConfig(log);
  return hosts;
}
function getExecutionDir() {
  return process.env.HOTSTUFF_EXECUTION_DIR;
}
function getExperimentsOutputDirectory() {
  return process.env.HOTSTUFF_EXPERIMENTS_OUTPUT_DIR;
}
module.exports = {
  build,
  configure,
  getStats,
  getProcessName,
  getExecutionDir,
  getExperimentsOutputDirectory,
};
