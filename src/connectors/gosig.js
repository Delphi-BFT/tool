const fs = require('fs').promises
const { promisified_spawn } = require('../util/exec')
const path = require('path')
const ipUtil = require('../util/ip-util')
const math = require('mathjs')
const { removeOutliers, isNullOrEmpty } = require('../util/helpers')
const TOML = require('@iarna/toml')
const auth = {
  peers: {
    scheme: 'Bls',
    pubKeyPrefix: 'bls-Bn256-public-',
    pvKeyPrefix: 'bls-Bn256-private-',
    certPrefix: 'bls-Bn256-cert-',
  },
  clients: {
    scheme: 'Hmac',
  },
}

function _parse(replicaSettings, clientSettings) {
  //TODO
}

async function build(replicaSettings, clientSettings, log) {
  log.info('building Gosig ...')
  let cmd = { proc: 'cargo', args: ['build', '--release', '--bins'] }
  await promisified_spawn(cmd.proc, cmd.args, process.env.GOSIG_DIR, log)
  log.info('Gosig build terminated sucessfully!')
}
async function generateKeys(numKeys, log) {
  log.info(`generating keys for ${numKeys} replicas...`)
  try {
    await fs.mkdir(path.join(process.env.GOSIG_DIR, process.env.GOSIG_KEYS_DIR))
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
      process.env.GOSIG_KEYS_DIR,
    ],
  }
  await promisified_spawn(cmd.proc, cmd.args, process.env.GOSIG_DIR, log)
  log.info('keys generated successfully!')
}
async function createBlsConfigFile(replicaSettings, log) {
  log.info('generating Gosig BLS config ...')
  let blsConfig = {
    reply_size: replicaSettings.replySize,
    reqs_per_client: 100000,
    batching: replicaSettings.batchReplies,
    execution: 'Single',
    protocol: 'Gosig',
    communication_mode: 'Gossip',
    backpressure: 1000,
    authentication: {
      peers: auth.peers.scheme,
      clients: auth.clients.scheme,
    },
    batch: {
      timeout: {
        secs: Number(replicaSettings.batchTimeout.secs),
        nanos: Number(replicaSettings.batchTimeout.nano),
      },
      min: 1,
      max: 1,
    },
  }

  // Peers
  let hostIPs = await ipUtil.getIPs({
    [process.env.GOSIG_REPLICA_HOST_PREFIX]: replicaSettings.replicas,
    [process.env.GOSIG_CLIENT_HOST_PREFIX]: 1, // FOR NOW?
  })
  for (let i = 0; i < hostIPs.length; i++) {
    if (hostIPs[i].name.startsWith(process.env.GOSIG_REPLICA_HOST_PREFIX))
      hostIPs[i].isClient = false
    else hostIPs[i].isClient = true
  }
  blsConfig.peers = []
  let replicaId = 0
  for (let i = 0; i < hostIPs.length; i++) {
    if (hostIPs[i].isClient) continue
    blsConfig.peers.push({
      id: replicaId,
      host: hostIPs[i].ip,
      bind: hostIPs[i].ip,
      client_port: Number(process.env.GOSIG_CLIENT_PORT),
      peer_port: Number(process.env.GOSIG_PEER_PORT),
      private_key: `${process.env.GOSIG_KEYS_DIR}/${auth.peers.pvKeyPrefix}${replicaId}`,
      public_key: `${process.env.GOSIG_KEYS_DIR}/${auth.peers.pubKeyPrefix}${replicaId}`,
      certificate: `${process.env.GOSIG_KEYS_DIR}/${auth.peers.certPrefix}${replicaId}`,
      gossip_port: Number(process.env.GOSIG_GOSSIP_PORT),
    })
    replicaId++
  }
  let pbft = TOML.parse(
    await fs.readFile('./src/connectors/assets/gosig/pbft.toml'),
  )
  pbft.pbft.faults = Math.floor((replicaSettings.replicas - 1) / 3)
  if (replicaSettings.requestTimeout)
    pbft.pbft.request_timeout = replicaSettings.requestTimeout
  let blsConfigString = TOML.stringify(blsConfig)
  let pbftString = TOML.stringify(pbft)
  /* Execution Dir??? */
  await fs.writeFile(
    path.join(process.env.GOSIG_DIR, process.env.GOSIG_BLS_CONFIG_FILE_PATH),
    blsConfigString,
  )
  await fs.writeFile(
    path.join(process.env.GOSIG_DIR, process.env.GOSIG_PBFT_CONFIG_FILE_PATH),
    pbftString,
  )
  log.info('Config file generated!')
  return hostIPs
}
async function createGosigConfigFile(replicaSettings, log) {
  log.info('Generating gosig.toml')
  let gosig = TOML.parse(
    await fs.readFile('./src/connectors/assets/gosig/gosig.toml'),
  )
  gosig.gosig.faults = Math.floor((replicaSettings.replicas - 1) / 3)
  gosig.gosig.stage_1_length = replicaSettings.firstStageLength
  gosig.gosig.stage_2_length = replicaSettings.secondStageLength
  gosig.gosig.gossip_time = replicaSettings.gossipTime
  gosig.gosig.proposer_threshold = 7
  gosig.gosig.max_transactions = replicaSettings.batchSize
  gosig.gosig.max_rounds = replicaSettings.maxRounds
  let gosigString = TOML.stringify(gosig)
  await fs.writeFile(
    path.join(process.env.GOSIG_DIR, process.env.GOSIG_CONFIG_FILE_PATH),
    gosigString,
  )
  log.info('gosig.toml generated!')
}
async function createGossipConfigFile(replicaSettings, log) {
  log.info('Generating gossip.toml')
  let gossip = TOML.parse(
    await fs.readFile('./src/connectors/assets/gosig/gossip.toml'),
  )
  gossip.gossip.gossip_count = replicaSettings.gossip.gossipCount
  gossip.gossip.gossip_period = replicaSettings.gossip.gossipPeriod
  gossip.gossip.update_expiration = replicaSettings.gossip.updateExpiration
  gossip.gossip.direct_sending = replicaSettings.gossip.useDirectSending
  let gossipString = TOML.stringify(gossip)
  await fs.writeFile(
    path.join(process.env.GOSIG_DIR, process.env.GOSIG_GOSSIP_CONFIG_FILE_PATH),
    gossipString,
  )
  log.info('gossip.toml generated!')
}
async function passArgs(hosts, clientSettings, log) {
  let replicaIndex = 0
  let clientIndex = 0
  for (let i = 0; i < hosts.length; i++) {
    if (hosts[i].isClient) {
      hosts[i].procs = []
      hosts[i].procs.push({
        path: path.join(process.env.GOSIG_DIR, process.env.GOSIG_CLIENT_BIN),
        env: 'RUST_LOG=INFO',
        args: `-d ${clientSettings.duration} --config ${process.env.GOSIG_CONFIG_PATH} --payload ${clientSettings.payload} -c ${clientSettings.clients} --concurrent ${clientSettings.concurrent}`,
        startTime: clientSettings.startTime ? clientSettings.startTime : 0,
      })
      clientIndex++
      continue
    }
    hosts[i].procs = []
    hosts[i].procs.push({
      path: path.join(process.env.GOSIG_DIR, process.env.GOSIG_REPLICA_BIN),
      env: 'RUST_LOG=INFO',
      args: `${replicaIndex} --config ${process.env.GOSIG_CONFIG_PATH}`,
      start_time: 0,
    })
    replicaIndex++
  }
  return hosts
}
function getExecutionDir() {
  return process.env.GOSIG_EXECUTION_DIR
}
function getExperimentsOutputDirectory() {
  return process.env.GOSIG_EXPERIMENTS_OUTPUT_DIR
}
async function configure(replicaSettings, clientSettings, log) {
  // log.info('parsing replica and client objects')
  // _parse(replicaSettings, clientSettings)
  // log.info('objects parsed!')
  await generateKeys(replicaSettings.replicas, log)
  let hosts = await createBlsConfigFile(replicaSettings, log)
  await createGosigConfigFile(replicaSettings, log)
  await createGossipConfigFile(replicaSettings, log)
  hosts = await passArgs(hosts, clientSettings, log)
  return hosts
}

function getProcessName() {
  return 'themis-bench-app'
}

//async function getStats(experimentId, log) {
//  let clientFile = await fs.readFile(
//    path.join(
//      path.join(process.env.THEMIS_EXPERIMENTS_OUTPUT_DIR, experimentId),
//      path.join(
//        `hosts/${process.env.THEMIS_CLIENT_HOST_PREFIX}0/${process.env.THEMIS_CLIENT_HOST_PREFIX}0.bench-client.1000.stdout`,
//      ),
//    ),
//  )
//  let clientFileLines = clientFile.toString().split('\n')
//  let RPSEntries = []
//  let LAGEntries = []
//  clientFileLines.forEach((line) => {
//    if (line.includes('RPS:') && !line.includes('Total rps:')) {
//      let rps = parseFloat(line.split('RPS: ')[1].replace(/(\r\n|\n|\r)/gm, ''))
//      if (rps > 0) RPSEntries.push(rps)
//    }
//    if (line.includes('LAG:') && !line.includes('Total lag:')) {
//      let lag = parseFloat(line.split('LAG: ')[1].replace(/(\r\n|\n|\r)/gm, ''))
//      if (lag > 0) LAGEntries.push(lag)
//    }
//  })
//  let maxThroughput = math.max(RPSEntries)
//  let avgThroughput = math.mean(RPSEntries)
//  let avgLag = math.mean(LAGEntries)
//  let latencyOutlierRemoved = removeOutliers(LAGEntries)
//  let avgLatNoOutlier = math.mean(latencyOutlierRemoved)
//  return {
//    maxThroughput: maxThroughput,
//    avgThroughput: avgThroughput,
//    latencyAll: avgLag,
//    latencyOutlierRemoved: avgLatNoOutlier,
//  }
//}
module.exports = {
  build,
  configure,
  getProcessName,
  //  getStats,
  getExecutionDir,
  getExperimentsOutputDirectory,
}
