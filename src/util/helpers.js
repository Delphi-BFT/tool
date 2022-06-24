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

function median(values) {
  if(values.length ===0) 
    throw new Error("Array for median calcuation is empty!");

  values.sort(function(first,second){
    return first-second;
  });

  var mid = Math.floor(values.length / 2);
  
  return (values.length & 1) ? values[mid]:(values[mid - 1] + values[mid]) / 2.0;
}
module.exports = { transformLatencies, deleteDirectoryIfExists, median };
