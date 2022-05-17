const fs = require('fs');
async function transformLatencies(hosts) {
  let awsHosts = [];
  for (let i = 0; i < hosts.length; i++) {
    let region = Object.keys(hosts[i])[0];
    let amount = Object.values(hosts[i])[0];
    while (amount--) {
      awsHosts.push(region);
    }
  }
  return awsHosts;
}

async function deleteDirectoryIfExists(path) {
  fs.rmSync(path, { recursive: true, force: true });
}
module.exports = { transformLatencies, deleteDirectoryIfExists };
