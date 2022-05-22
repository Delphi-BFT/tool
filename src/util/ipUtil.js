async function getIPs(hosts) {
  let ipList = [];
  for (const [key, value] of Object.entries(hosts)) {
    for (let i = 0; i < value; i++) {
      let hostIP =
        11 +
        '.' +
        Math.floor(Math.random() * 255) +
        '.' +
        Math.floor(Math.random() * 255) +
        '.' +
        Math.floor(Math.random() * 255);
      let hostName = key + i;
      ipList.push({ name: hostName, ip: hostIP });
    }
  }
  return ipList;
}

module.exports = { getIPs };
