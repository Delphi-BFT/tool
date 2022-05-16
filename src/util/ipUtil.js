async function getIPs(prefix, n) {
  let ipList = [];
  for (let i = 0; i < n; i++) {
    let replicaIP =
      11 +
      '.' +
      Math.floor(Math.random() * 255) +
      '.' +
      Math.floor(Math.random() * 255) +
      '.' +
      Math.floor(Math.random() * 255);
    let replicaName = prefix + i;
    ipList.push({ name: replicaName, ip: replicaIP });
  }
  return ipList;
}

module.exports = { getIPs };
