const fs = require('fs').promises
const { promisified_spawn } = require('../util/exec')
const path = require('path')
const ipUtil = require('../util/ip-util')
const math = require('mathjs')
const { removeOutliers, isNullOrEmpty } = require('../util/helpers')
const TOML = require('@iarna/toml')
const auth = {
  peers: {
    scheme: 'Ed25519',
    pubKeyPrefix: 'ed-25519-public-',
    pvKeyPrefix: 'ed-25519-private-',
    certPrefix: 'ed-25519-cert-',
  },
  clients: {
    scheme: 'Hmac',
  },
}

function _parse(replicaSettings, clientSettings) {
  if (isNullOrEmpty(replicaSettings))
    throw new Error('replica object of current experiment was not defined')
  if (isNullOrEmpty(clientSettings))
    throw new Error('client object of current experiment was not defined')
  if (isNullOrEmpty(replicaSettings.replicas))
    throw new Error(
      'replicas property of replicas object of current experiment was not defined',
    )
  if (!Number.isInteger(replicaSettings.replicas))
    throw new Error('replicas property of replica object must be an Integer')
  if (
    isNullOrEmpty(replicaSettings.minBatchSize) ||
    isNullOrEmpty(replicaSettings.maxBatchSize)
  )
    throw new Error(
      'minBatchSize and maxBatchSize properties of replica object of current experiment was not defined',
    )
  if (
    !Number.isInteger(replicaSettings.minBatchSize) ||
    !Number.isInteger(replicaSettings.maxBatchSize)
  )
    throw new Error(
      'minBatchSize and maxBatchSize properties of replica object must be an Integer',
    )
  if (isNullOrEmpty(replicaSettings.replySize))
    throw new Error(
      'replySize property of replica object of current experiment was not defined',
    )
  if (!Number.isInteger(replicaSettings.replySize))
    throw new Error('replySize property of replica object must be an Integer')
  if (isNullOrEmpty(replicaSettings.batchReplies))
    throw new Error(
      'batchReplies property of replica object of current experiment was not defined',
    )
  if (!math.isBoolean(replicaSettings.batchReplies))
    throw new Error(
      'batchReplies property of replica object must be an Integer',
    )
  if (isNullOrEmpty(clientSettings.clients))
    throw new Error(
      'clients property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.clients))
    throw new Error('clients property of client object must be an Integer')
  if (isNullOrEmpty(clientSettings.concurrent))
    throw new Error(
      'concurrent property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.concurrent))
    throw new Error('concurrent property of client object must be an Integer')
  if (isNullOrEmpty(clientSettings.payload))
    throw new Error(
      'payload property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.payload))
    throw new Error('payload property of client object must be an Integer')
  if (isNullOrEmpty(clientSettings.duration))
    throw new Error(
      'duration property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.duration))
    throw new Error('duration property of client object must be an Integer')
}

async function build(replicaSettings, clientSettings, log) {
  log.info('building Themis ...')
  let cmd = { proc: 'cargo', args: ['build', '--bins'] }
  await promisified_spawn(cmd.proc, cmd.args, process.env.THEMIS_DIR, log)
  log.info('Themis build terminated sucessfully!')
}
async function generateKeys(numKeys, log) {
  log.info(`generating keys for ${numKeys} replicas...`)
  try {
    await fs.mkdir(
      path.join(process.env.THEMIS_DIR, process.env.THEMIS_KEYS_DIR),
    )
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
      auth.peers.scheme,
      '0',
      numKeys,
      '--out-dir',
      process.env.THEMIS_KEYS_DIR,
    ],
  }
  await promisified_spawn(cmd.proc, cmd.args, process.env.THEMIS_DIR, log)
  log.info('keys generated successfully!')
}
async function createConfigFile(replicaSettings, log) {
  log.info('generating Themis config ...')
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
      nmin: Number(replicaSettings.minBatchSize),
      nmax: Number(replicaSettings.maxBatchSize),
    },
  }

  // Peers
  let hostIPs = await ipUtil.getIPs({
    [process.env.THEMIS_REPLICA_HOST_PREFIX]: replicaSettings.replicas,
    [process.env.THEMIS_CLIENT_HOST_PREFIX]: 1, // FOR NOW?
  })
  for (let i = 0; i < hostIPs.length; i++) {
    if (hostIPs[i].name.startsWith(process.env.THEMIS_REPLICA_HOST_PREFIX))
      hostIPs[i].isClient = false
    else hostIPs[i].isClient = true
  }
  config.peers = []
  let replicaId = 0
  for (let i = 0; i < hostIPs.length; i++) {
    if (hostIPs[i].isClient) continue
    config.peers.push({
      id: replicaId,
      host: hostIPs[i].ip,
      bind: hostIPs[i].ip,
      client_port: Number(process.env.THEMIS_CLIENT_PORT),
      peer_port: Number(process.env.THEMIS_REPLICA_PORT),
      private_key: `${process.env.THEMIS_KEYS_DIR}/${auth.peers.pvKeyPrefix}${replicaId}`,
      public_key: `${process.env.THEMIS_KEYS_DIR}/${auth.peers.pubKeyPrefix}${replicaId}`,
      certificate: `${process.env.THEMIS_KEYS_DIR}/${auth.peers.certPrefix}${replicaId}`,
      prometheus_port: Number(process.env.THEMIS_PROMETHEUS_PORT),
    })
    replicaId++
  }
  let pbft = TOML.parse(
    await fs.readFile('./src/connectors/assets/themis/pbft.toml'),
  )
  pbft.pbft.nfaults = Math.floor((replicaSettings.replicas - 1) / 3)
  if (replicaSettings.requestTimeout)
    pbft.pbft.request_timeout = replicaSettings.requestTimeout
  let configString = TOML.stringify(config)
  let pbftString = TOML.stringify(pbft)
  /* Execution Dir??? */
  await fs.writeFile(
    path.join(process.env.THEMIS_DIR, process.env.THEMIS_CONFIG_FILE_PATH),
    configString,
  )
  await fs.writeFile(
    path.join(process.env.THEMIS_DIR, process.env.THEMIS_PBFT_CONFIG_FILE_PATH),
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
        path: path.join(process.env.THEMIS_DIR, process.env.THEMIS_CLIENT_BIN),
        env: 'RUST_BACKTRACE=1',
        args: `-d ${clientSettings.duration} --config ${process.env.THEMIS_CONFIG_PATH} --payload ${clientSettings.payload} -c ${clientSettings.clients} --concurrent ${clientSettings.concurrent}`,
        startTime: clientSettings.startTime ? clientSettings.startTime : 0,
      })
      clientIndex++
      continue
    }
    hosts[i].procs = []
    hosts[i].procs.push({
      path: path.join(process.env.THEMIS_DIR, process.env.THEMIS_REPLICA_BIN),
      env: 'RUST_BACKTRACE=1',
      args: `${replicaIndex} --config ${process.env.THEMIS_CONFIG_PATH}`,
      start_time: 0,
    })
    replicaIndex++
  }
  return hosts
}
function getExecutionDir() {
  return process.env.THEMIS_EXECUTION_DIR
}
function getExperimentsOutputDirectory() {
  return process.env.THEMIS_EXPERIMENTS_OUTPUT_DIR
}
async function configure(replicaSettings, clientSettings, log) {
  log.info('parsing replica and client objects')
  _parse(replicaSettings, clientSettings)
  log.info('objects parsed!')
  await generateKeys(replicaSettings.replicas, log)
  let hosts = await createConfigFile(replicaSettings, log)
  hosts = await passArgs(hosts, clientSettings, log)
  return hosts
}

function getProcessName() {
  return 'themis-bench-app'
}

async function getStats(experimentId, log) {
  let clientFile = await fs.readFile(
    path.join(
      path.join(process.env.THEMIS_EXPERIMENTS_OUTPUT_DIR, experimentId),
      path.join(
        `hosts/${process.env.THEMIS_CLIENT_HOST_PREFIX}0/${THEMIS_CLIENT_HOST_PREFIX}0.bench-client.1000.stdout`,
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
