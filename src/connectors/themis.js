const fs = require('fs').promises;
const { promisified_spawn } = require('../util/exec');
const path = require('path');
const ipUtil = require('../util/ipUtil');
const { writeFile, appendFile } = require('fs');
const { removeOutliers } = require('../util/helpers');

const themisCLI = 'target/debug/bench-client';
const themisReplica = 'target/debug/themis-bench-app';
const keysDirectory = 'keys';
const replicaPrefix = 'themisReplica';
const clientPrefix = 'themisClient';

const prometheusPort = 8080;
const replicaPort = 10003;
const clientPort = 10002;

const configPath = 'config/default';
const configFilePath = 'config/default/config.toml';
const pbftConfigFilePath = 'config/default/pbft.toml';
async function build(
  workingDir,
  replicaSettings,
  clientSettings,
  log
) {
  log.info('building Themis ...');
  let cmd = { proc: 'cargo', args: ['build', '--bins'] };
  await promisified_spawn(cmd.proc, cmd.args, workingDir, log);
  log.info('Themis build terminated sucessfully!');
}
async function generateKeys(workingDir, numKeys, log) {
  log.info(`generating keys for ${numKeys} replicas...`);
  try {
    await fs.mkdir(path.join(workingDir, keysDirectory));
  } catch (error) {
    log.warn('using a pre-existing keys directory');
  }
  let cmd = {
    proc: 'cargo',
    args: [
      'run',
      '--bin',
      'keygen',
      '--',
      'Ed25519',
      '0',
      numKeys,
      '--out-dir',
      'keys',
    ],
  };
  await promisified_spawn(cmd.proc, cmd.args, workingDir, log);
  log.info('keys generated successfully!');
}
async function createConfigFile(
  workingDir,
  replicaSettings,
  clientSettings,
  log
) {
  log.info('generating Themis config ...');
  // Top level
  let configString = `reply_size = ${replicaSettings.replySize}\nexecution = 'Single'\nbatching = ${replicaSettings.batchReplies}\n\n`;
  // Authentication
  configString += `[authentication]\npeers = "${replicaSettings.peerAuthentication}"\nclients = "${replicaSettings.clientAuthentication}"\n\n`;
  // Batch
  configString += `[batch]\nmin = ${replicaSettings.minBatchSize}\nmax = ${replicaSettings.maxBatchSize}\ntimeout = { secs = ${replicaSettings.timeout.secs}, nanos = ${replicaSettings.timeout.nano} }\n\n`;
  let maxFaulty = Math.floor((replicaSettings.replicas - 1) / 3);
  let pbftString = `[pbft]\nfaults = ${maxFaulty}\nfirst_primary = 0\ncheckpoint_interval = 1000\nhigh_mark_delta = 3000\nrequest_timeout = 1000\nkeep_checkpoints = 2\nprimary_forwarding = 'Full'\nbackup_forwarding = 'Full'\nreply_mode = 'All'`;
  // Peers
  let hostIPs = await ipUtil.getIPs({
    [replicaPrefix]: replicaSettings.replicas,
    [clientPrefix]: 1, // FOR NOW?
  });
  for (let i = 0; i < hostIPs.length; i++) {
    if (hostIPs[i].name.startsWith(replicaPrefix))
      hostIPs[i].isClient = false;
    else hostIPs[i].isClient = true;
  }
  let peerString = '';
  let replicaId = 0;
  for (let i = 0; i < hostIPs.length; i++) {
    if (hostIPs[i].isClient) continue;
    peerString +=
      '[[peers]]\n' +
      'id = ' +
      replicaId +
      '\n' +
      "host = '" +
      hostIPs[i].ip +
      "' \n" +
      "bind = '" +
      hostIPs[i].ip +
      "' \n" +
      'client_port = ' +
      clientPort +
      '\n' +
      'peer_port = ' +
      replicaPort +
      '\n' +
      'private_key = ' +
      '"keys/ed-25519-private-' +
      replicaId +
      '"\n' +
      'public_key = ' +
      '"keys/ed-25519-public-' +
      replicaId +
      '"\n' +
      'certificate = ' +
      '"keys/ed-25519-cert-' +
      replicaId +
      '"\n' +
      'prometheus_port = ' +
      prometheusPort +
      '\n' +
      '\n';
    replicaId++;
  }
  configString += peerString;
  /* Execution Dir??? */
  await fs.writeFile(
    path.join(workingDir, configFilePath),
    configString
  );
  await fs.writeFile(
    path.join(workingDir, pbftConfigFilePath),
    pbftString
  );
  log.info('Config file generated!');
  return hostIPs;
}
async function passArgs(workingDir, hosts, clientSettings, log) {
  let replicaIndex = 0;
  let clientIndex = 0;
  for (let i = 0; i < hosts.length; i++) {
    if (hosts[i].isClient) {
      hosts[i].procs = [];
      hosts[i].procs.push({
        path: path.join(workingDir, themisCLI),
        env: 'RUST_BACKTRACE=1',
        args: `-d ${clientSettings.duration} --config ${configPath} --payload ${clientSettings.payload} -c ${clientSettings.clients} --concurrent ${clientSettings.concurrent}`,
      });
      clientIndex++;
      continue;
    }
    hosts[i].procs = [];
    hosts[i].procs.push({
      path: path.join(workingDir, themisReplica),
      env: 'RUST_BACKTRACE=1',
      args: `${replicaIndex} --config ${configPath}`,
    });
    replicaIndex++;
  }
  return hosts;
}
async function configure(
  workingDir,
  replicaSettings,
  clientSettings,
  log
) {
  await generateKeys(workingDir, replicaSettings.replicas, log);
  let hosts = await createConfigFile(
    workingDir,
    replicaSettings,
    clientSettings,
    log
  );
  hosts = await passArgs(workingDir, hosts, clientSettings, log);
  return hosts;
}

let createThemisPeer = (id, ip) => {
  let client_port = 10002 + id * 100;
  let peer_port = 10003 + id * 100;
  let prometheus_port = 8080 + id;

  let peerString =
    '[[peers]]\n' +
    'id = ' +
    id +
    '\n' +
    "host = '" +
    ip +
    "' \n" +
    'client_port = ' +
    client_port +
    '\n' +
    'peer_port = ' +
    peer_port +
    '\n' +
    'private_key = ' +
    '"keys/ed-25519-private-' +
    id +
    '"\n' +
    'public_key = ' +
    '"keys/ed-25519-public-' +
    id +
    '"\n' +
    'prometheus_port = ' +
    prometheus_port +
    '\n' +
    '\n';

  return peerString;
};

let createThemisHostConfig = (hosts) => {
  let peers = '';
  for (let i = 0; i < hosts; i++) {
    peers += createThemisPeer(i, '127.0.0.1');
  }
  return peers;
};

let createShadowHostConfigForThemis = (hosts) => {
  let hostsString = 'hosts:\n';
  for (let i = 0; i < hosts; i++) {
    hostsString += envGen.createShadowHost(
      prefix,
      i,
      'target/release/themis-bench-app',
      '"RUST_LOG=info"',
      '["' + i + '", "--config", "../../config/default"]',
      '3s'
    );
  }
  let clientString = envGen.createShadowHost(
    prefix,
    hosts,
    'target/release/bench-client',
    '"RUST_LOG=info"',
    '["-d", "110", "--config", "../../config/default", "--payload", "4000", "-c", "10", "--concurrent", "10"]',
    '10s'
  );
  return hostsString + clientString;
};

let createConfs = (numberHosts) => {
  let myGraph = envGen.createGraphSimple(
    numberHosts,
    '100 Mbit',
    '100 Mbit',
    20,
    '0.0'
  );
  console.log(myGraph);
  let myThemisConf = createThemisHostConfig(numberHosts);
  console.log(myThemisConf);
  let myShadowConf = createShadowHostConfigForThemis(numberHosts);
  console.log(myShadowConf);

  fs.writeFileSync('myGraph_' + numberHosts + '.gml', myGraph);
  fs.writeFileSync(
    'myThemisConf_' + numberHosts + '.conf',
    myThemisConf
  );
  fs.writeFileSync(
    'shadow_host_' + numberHosts + '.conf',
    myShadowConf
  );
};
function getProcessName() {
  return 'themis-bench-app';
}
async function getStats(experimentsPath, protocolPath) {
  let clientFile = await fs.readFile(
    path.join(
      experimentsPath,
      path.join(
        `hosts/${clientPrefix}0/themisClient0.bench-client.1000.stdout`
      )
    )
  );
  let clientFileLines = clientFile.toString().split('\n');
  let RPSEntries = [];
  let LAGEntries = [];
  for (line in clientFileLines) {
    if (
      clientFileLines[line].includes('RPS:') &&
      !clientFileLines[line].includes('Total rps:')
    ) {
      let rps = parseFloat(
        clientFileLines[line]
          .split('RPS: ')[1]
          .replace(/(\r\n|\n|\r)/gm, '')
      );
      RPSEntries.push(Number(rps));
    }
    if (
      clientFileLines[line].includes('LAG:') &&
      !clientFileLines[line].includes('Total lag:')
    ) {
      let lag = parseFloat(
        clientFileLines[line]
          .split('LAG: ')[1]
          .replace(/(\r\n|\n|\r)/gm, '')
      );
      LAGEntries.push(Number(lag));
    }
  }
  let maxThroughput = -1;
  let avgThroughput = 0;
  let avgLag = 0;
  let lenTPSNoZeroes = 0;
  for (x in RPSEntries) {
    if (RPSEntries[x] > maxThroughput) maxThroughput = RPSEntries[x];
    if (RPSEntries[x] > 0) {
      avgThroughput += RPSEntries[x];
      lenTPSNoZeroes += 1;
    }
  }
  let lenLatNoZeroes = 0;
  for (x in LAGEntries) {
    if (LAGEntries[x] > 0) {
      avgLag += LAGEntries[x];
      lenLatNoZeroes += 1;
    }
  }
  avgThroughput /= lenTPSNoZeroes;
  avgLag /= lenLatNoZeroes;
  let latencyOutlierRemoved = removeOutliers(LAGEntries);
  let avgLatNoOutlier = 0;
  console.log(latencyOutlierRemoved)
  for (let i = 0; i < latencyOutlierRemoved.length; i++) {
    avgLatNoOutlier += latencyOutlierRemoved[i];
  }
  avgLatNoOutlier /= latencyOutlierRemoved.length;
  return {
    maxThroughput: maxThroughput,
    avgThroughput: avgThroughput,
    latencyAll: avgLag,
    latencyOutlierRemoved: avgLatNoOutlier,
  };
}
module.exports = { build, configure, getProcessName, getStats };
