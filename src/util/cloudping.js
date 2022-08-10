const fetch = require('node-fetch');

// cloudping daily averages api endpoint

const apiUrl = 'https://api-demo.cloudping.co/averages';

async function getLatencies(log) {
  let latencies = new Object();
  try {
    log.info('getting latencies from cloudping ...');
    const response = await fetch(apiUrl, { method: 'GET' });
    if (response.ok) {
      log.info('got ok response from cloudping!');
      const json = await response.json();
      for (let i = 0; i < json.length; i++) {
        let currentRegion = json[i].region;
        latencies[currentRegion] = new Object();
        for (let j = 0; j < json[i].averages.length; j++) {
          let destinationRegion = json[i].averages[j].regionTo;
          let RTT = parseFloat(json[i].averages[j].average).toFixed(
            3
          );
          latencies[currentRegion][destinationRegion] = new Object();
          latencies[currentRegion][destinationRegion] = Math.floor(
            (RTT * 1000) / 2
          );
        }
      }
      return latencies;
    } else {
      log.error('error retrieving latencies from cloudping');
      throw Error();
    }
  } catch (e) {
    throw Error('exception occurred while retrieving AWS latencies');
  }
}
module.exports = { getLatencies };
