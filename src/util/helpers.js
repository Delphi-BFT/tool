const fs = require('fs');
const statistics = require('simple-statistics');
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
  if (values.length === 0)
    throw new Error('Array for median calcuation is empty!');

  values.sort(function (first, second) {
    return first - second;
  });

  var mid = Math.floor(values.length / 2);

  return values.length & 1
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2.0;
}

function removeOutliers(data) {
  let outlierConstant = 1.5;
  let sorted = data.sort(function(a, b) {
  	return a - b;
  });
  let uq = statistics.quantile(sorted, 0.75);
  let lq = statistics.quantile(sorted, 0.25);
  let IQR = (uq - lq) * outlierConstant;
  let quartileSet = [lq - IQR, uq + IQR];
  let resultSet = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] >= quartileSet[0] && sorted[i] <= quartileSet[1])
      resultSet.push(sorted[i]);
  }
  return resultSet;
}
module.exports = {
  transformLatencies,
  deleteDirectoryIfExists,
  median,
  removeOutliers,
};
