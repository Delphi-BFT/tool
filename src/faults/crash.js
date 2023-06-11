const ipUtil = require('../util/ip-util.js')
const _ = require('lodash')
async function crash(
  nreplicas,
  hosts,
  threshold,
  timestamp,
  restartClients,
  log,
) {
  let nfaulty = Math.floor(nreplicas * threshold)
  log.info(
    `using a fault-threshold of ${threshold} for ${nreplicas}. Will crash ${nfaulty} replicas at ${timestamp}`,
  )
  let newClients = []
  for (const host of hosts) {
    if (host.isClient) {
      if (restartClients) {
        let newProcs = []
        for (const proc of host.procs) {
          let newProc = _.cloneDeep(proc)
          proc.stopTime = timestamp
          newProc.startTime = timestamp
          newProcs.push(newProc)
        }
        host.procs.push(...newProcs)
      }
      continue
    }
    if (nfaulty <= 0) {
      continue
    }
    for (const proc of host.procs) {
      proc.stopTime = timestamp
    }
    nfaulty--
  }
}
module.exports = { crash }
