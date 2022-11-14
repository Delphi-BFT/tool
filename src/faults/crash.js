async function crash(nreplicas, hosts, threshold, timestamp, log) {
  let nfaulty = Math.floor(nreplicas * threshold)
  log.info(
    `using a fault-threshold of ${threshold} for ${nreplicas}. Will crash ${nfaulty} replicas at ${timestamp}`,
  )
  for (const host of hosts) {
    if (host.isClient) continue
    if (nfaulty <= 0) return
    for (const proc of host.procs) {
      proc.stopTime = timestamp
    }
    nfaulty--
  }
}
module.exports = { crash }
