const seenIPs = new Set()
async function getIPs(hosts) {
  let ipList = []
  for (const [key, value] of Object.entries(hosts)) {
    for (let i = 0; i < value; i++) {
      let hostIP = ''
      do {
        hostIP =
          11 +
          '.' +
          Math.floor(Math.random() * 255) +
          '.' +
          Math.floor(Math.random() * 255) +
          '.' +
          Math.floor(Math.random() * 255)
      } while (seenIPs.has(hostIP))
      seenIPs.add(hostIP)
      let hostName = key + i
      ipList.push({ name: hostName, ip: hostIP })
    }
  }
  return ipList
}

async function clearIPSet() {
  seenIPs.clear()
}

module.exports = { getIPs, clearIPSet }
