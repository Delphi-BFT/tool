const fs = require('fs').promises
const { promisified_spawn } = require('../util/exec')
const path = require('path')
const ipUtil = require('../util/ip-util')
const math = require('mathjs')
const { removeOutliers } = require('../util/helpers')

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
      'Ed25519',
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
  // Top level
  let configString = `reply_size = ${replicaSettings.replySize}\nexecution = 'Single'\nbatching = ${replicaSettings.batchReplies}\n\n`
  // Authentication
  configString += `[authentication]\npeers = "${replicaSettings.peerAuthentication}"\nclients = "${replicaSettings.clientAuthentication}"\n\n`
  // Batch
  configString += `[batch]\nmin = ${replicaSettings.minBatchSize}\nmax = ${replicaSettings.maxBatchSize}\ntimeout = { secs = ${replicaSettings.timeout.secs}, nanos = ${replicaSettings.timeout.nano} }\n\n`
  let maxFaulty = Math.floor((replicaSettings.replicas - 1) / 3)
  let pbftString = `[pbft]\nfaults = ${maxFaulty}\nfirst_primary = 0\ncheckpoint_interval = 1000\nhigh_mark_delta = 3000\nrequest_timeout = 1000\nkeep_checkpoints = 2\nprimary_forwarding = 'Full'\nbackup_forwarding = 'Full'\nreply_mode = 'All'`
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
  let peerString = ''
  let replicaId = 0
  for (let i = 0; i < hostIPs.length; i++) {
    if (hostIPs[i].isClient) continue
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
      process.env.THEMIS_CLIENT_PORT +
      '\n' +
      'peer_port = ' +
      process.env.THEMIS_REPLICA_PORT +
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
      process.env.THEMIS_PROMETHEUS_PORT +
      '\n' +
      '\n'
    replicaId++
  }
  configString += peerString
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
        `hosts/${process.env.THEMIS_CLIENT_HOST_PREFIX}0/themisClient0.bench-client.1000.stdout`,
      ),
    ),
  )
  let clientFileLines = clientFile.toString().split('\n')
  let RPSEntries = []
  let LAGEntries = []
  for (line in clientFileLines) {
    if (
      clientFileLines[line].includes('RPS:') &&
      !clientFileLines[line].includes('Total rps:')
    ) {
      let rps = parseFloat(
        clientFileLines[line].split('RPS: ')[1].replace(/(\r\n|\n|\r)/gm, ''),
      )
      if (rps > 0) RPSEntries.push(rps)
    }
    if (
      clientFileLines[line].includes('LAG:') &&
      !clientFileLines[line].includes('Total lag:')
    ) {
      let lag = parseFloat(
        clientFileLines[line].split('LAG: ')[1].replace(/(\r\n|\n|\r)/gm, ''),
      )
      if (lag > 0) LAGEntries.push(lag)
    }
  }
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
