const fs = require('fs').promises
const { promisified_spawn } = require('../util/exec')
const path = require('path')
const ipUtil = require('../util/ip-util')
const math = require('mathjs')
const { removeOutliers, isNullOrEmpty } = require('../util/helpers')
const TOML = require('@iarna/toml')
const auth = {
  /*  peers: {
    scheme: 'Ed25519',
    pubKeyPrefix: 'ed-25519-public-',
    pvKeyPrefix: 'ed-25519-private-',
    certPrefix: 'ed-25519-cert-',
  },*/
  peers: {
    scheme: 'Ecdsa',
    pubKeyPrefix: 'ecdsa-256-public-',
    pvKeyPrefix: 'ecdsa-256-private-',
    //    certPrefix: 'ecdsa-256-cert-',
  },
  clients: {
    scheme: 'Ecdsa',
    pubKeyPrefix: 'ecdsa-256-public-',
    pvKeyPrefix: 'ecdsa-256-private-',
    //  certPrefix: 'ecdsa-256-cert-',
  },
}

function _parse(replicaSettings, clientSettings) {
  //TODO
}

async function build(replicaSettings, clientSettings, log) {
  log.info('building Mir ...')
  let cmd = { proc: 'cargo', args: ['build', '--bins'] }
  await promisified_spawn(cmd.proc, cmd.args, process.env.MIR_DIR, log)
  log.info('Mir build terminated sucessfully!')
}
async function generateKeys(numKeys, nClientKeys, log) {
  log.info(`generating keys for ${numKeys} replicas...`)
  try {
    await fs.mkdir(
      path.join(process.env.MIR_DIR, process.env.MIR_CLIENT_KEYS_DIR),
    )
    await fs.mkdir(path.join(process.env.MIR_DIR, process.env.MIR_KEYS_DIR))
  } catch (error) {
    log.warn('using a pre-existing keys directory')
  }
  let cmd = {
    proc: 'cargo',
    args: [
      'run',
      '--bin',
      'keygen',
      '--',
      'ECDSA',
      '0',
      numKeys,
      '--out-dir',
      process.env.MIR_KEYS_DIR,
    ],
  }
  let client_cmd = {
    proc: 'cargo',
    args: [
      'run',
      '--bin',
      'keygen',
      '--',
      'ECDSA',
      100,
      100 + nClientKeys,
      '--out-dir',
      process.env.MIR_CLIENT_KEYS_DIR,
    ],
  }
  await promisified_spawn(cmd.proc, cmd.args, process.env.MIR_DIR, log)
  await promisified_spawn(
    client_cmd.proc,
    client_cmd.args,
    process.env.MIR_DIR,
    log,
  )
  log.info('keys generated successfully!')
}
async function createConfigFile(replicaSettings, clientSettings, log) {
  log.info('generating Mir config ...')
  let config = {
    reply_size: replicaSettings.replySize,
    execution: 'Single',
    batching: replicaSettings.batchReplies,
    authentication: {
      peers: auth.peers.scheme,
      clients: auth.clients.scheme,
    },
    batch: {
      timeout: {
        secs: Number(replicaSettings.batchTimeout.secs),
        nanos: Number(replicaSettings.batchTimeout.nano),
      },
      min: Number(replicaSettings.minBatchSize),
      max: Number(replicaSettings.maxBatchSize),
    },
  }

  // Peers
  let hostIPs = await ipUtil.getIPs({
    [process.env.MIR_REPLICA_HOST_PREFIX]: replicaSettings.replicas,
    [process.env.MIR_CLIENT_HOST_PREFIX]: 1, // FOR NOW?
  })
  for (let i = 0; i < hostIPs.length; i++) {
    if (hostIPs[i].name.startsWith(process.env.MIR_REPLICA_HOST_PREFIX))
      hostIPs[i].isClient = false
    else hostIPs[i].isClient = true
  }
  config.peers = []
  config.clients = []
  let replicaId = 0
  let clientId = 0
  for (let i = 0; i < clientSettings.clients; i++) {
    config.clients.push({
      id: 100 + i,
      private_key: `${process.env.MIR_CLIENT_KEYS_DIR}/${
        auth.clients.pvKeyPrefix
      }${100 + i}`,
      public_key: `${process.env.MIR_CLIENT_KEYS_DIR}/${
        auth.clients.pubKeyPrefix
      }${100 + i}`,
      //certificate: `${process.env.MIR_KEYS_DIR}/${auth.peers.certPrefix}${100+i}`,
    })
  }
  for (let i = 0; i < hostIPs.length; i++) {
    if (hostIPs[i].isClient) {
      continue
    }
    config.peers.push({
      id: replicaId,
      host: hostIPs[i].ip,
      bind: hostIPs[i].ip,
      client_port: Number(process.env.MIR_CLIENT_PORT),
      peer_port: Number(process.env.MIR_REPLICA_PORT),
      private_key: `${process.env.MIR_KEYS_DIR}/${auth.peers.pvKeyPrefix}${replicaId}`,
      public_key: `${process.env.MIR_KEYS_DIR}/${auth.peers.pubKeyPrefix}${replicaId}`,
      // certificate: `${process.env.MIR_KEYS_DIR}/${auth.peers.certPrefix}${replicaId}`,
      prometheus_port: Number(process.env.MIR_PROMETHEUS_PORT),
    })
    replicaId++
  }
  let pbft = TOML.parse(
    await fs.readFile('./src/connectors/assets/mir/mir.toml'),
  )
  pbft.pbft.faults = Math.floor((replicaSettings.replicas - 1) / 3)
  if (replicaSettings.requestTimeout)
    pbft.pbft.request_timeout = replicaSettings.requestTimeout
  pbft.pbft.client_amount = clientSettings.clients
  if (replicaSettings.clientMarkWindow)
    pbft.pbft.client_mark_window = replicaSettings.clientMarkWindow
  if (replicaSettings.epochLength)
    pbft.pbft.epoch_length = replicaSettings.epochLength
  pbft.pbft.batch_size = Number(replicaSettings.maxBatchSize)
  let configString = TOML.stringify(config)
  let pbftString = TOML.stringify(pbft)
  /* Execution Dir??? */
  await fs.writeFile(
    path.join(process.env.MIR_DIR, process.env.MIR_CONFIG_FILE_PATH),
    configString,
  )
  await fs.writeFile(
    path.join(process.env.MIR_DIR, process.env.MIR_PBFT_CONFIG_FILE_PATH),
    pbftString,
  )
  log.info('Config file generated!')
  return hostIPs
}
async function passArgs(hosts, clientSettings, log) {
  let replicaIndex = 0
  let clientIndex = 0
  for (let i = 0; i < hosts.length; i++) {
    if (hosts[i].isClient) {
      hosts[i].procs = []
      hosts[i].procs.push({
        path: path.join(process.env.MIR_DIR, process.env.MIR_CLIENT_BIN),
        env: 'RUST_LOG=DEBUG',
        args: `-d ${clientSettings.duration} --config ${process.env.MIR_CONFIG_PATH} --payload ${clientSettings.payload} --clients ${clientSettings.clients} --concurrent ${clientSettings.concurrent}`,
        startTime: clientSettings.startTime ? clientSettings.startTime : 0,
      })
      clientIndex++
      continue
    }
    hosts[i].procs = []
    hosts[i].procs.push({
      path: path.join(process.env.MIR_DIR, process.env.MIR_REPLICA_BIN),
      env: 'RUST_LOG=DEBUG',
      args: `${replicaIndex} --config ${process.env.MIR_CONFIG_PATH}`,
      start_time: 0,
    })
    replicaIndex++
  }
  return hosts
}
function getExecutionDir() {
  return process.env.MIR_EXECUTION_DIR
}
function getExperimentsOutputDirectory() {
  return process.env.MIR_EXPERIMENTS_OUTPUT_DIR
}
async function configure(replicaSettings, clientSettings, log) {
  log.info('parsing replica and client objects')
  _parse(replicaSettings, clientSettings)
  log.info('objects parsed!')
  await generateKeys(replicaSettings.replicas, clientSettings.clients, log)
  let hosts = await createConfigFile(replicaSettings, clientSettings, log)
  hosts = await passArgs(hosts, clientSettings, log)
  return hosts
}

function getProcessName() {
  return 'themis-bench-app'
}

async function getStats(experimentId, log) {
  let clientFile = await fs.readFile(
    path.join(
      path.join(process.env.MIR_EXPERIMENTS_OUTPUT_DIR, experimentId),
      path.join(
        `hosts/${process.env.MIR_CLIENT_HOST_PREFIX}0/${process.env.MIR_CLIENT_HOST_PREFIX}0.bench-client.1000.stdout`,
      ),
    ),
  )
  let clientFileLines = clientFile.toString().split('\n')
  let RPSEntries = []
  let LAGEntries = []
  clientFileLines.forEach((line) => {
    if (line.includes('RPS:') && !line.includes('Total rps:')) {
      let rps = parseFloat(line.split('RPS: ')[1].replace(/(\r\n|\n|\r)/gm, ''))
      if (rps > 0) RPSEntries.push(rps)
    }
    if (line.includes('LAG:') && !line.includes('Total lag:')) {
      let lag = parseFloat(line.split('LAG: ')[1].replace(/(\r\n|\n|\r)/gm, ''))
      if (lag > 0) LAGEntries.push(lag)
    }
  })
  let maxThroughput = math.max(RPSEntries)
  let avgThroughput = math.mean(RPSEntries)
  let avgLag = math.mean(LAGEntries)
  let latencyOutlierRemoved = removeOutliers(LAGEntries)
  let avgLatNoOutlier = math.mean(latencyOutlierRemoved)
  return {
    maxThroughput: maxThroughput,
    avgThroughput: avgThroughput,
    latencyAll: avgLag,
    latencyOutlierRemoved: avgLatNoOutlier,
  }
}
module.exports = {
  build,
  configure,
  getProcessName,
  getStats,
  getExecutionDir,
  getExperimentsOutputDirectory,
}
