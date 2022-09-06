const unitToDuration = {
  s: 1000000000,
  ms: 1000000,
  us: 1000,
  ns: 1,
}
function parseDuration(durationString) {
  let durationString = durationString.trim().replace(/ +(?= )/g, '')
  const [duration, unit] = durationString.split(' ')
  if (Object.keys(unitToDuration).indexOf(unit) == -1) {
    throw Error(
      `${durationString} is not a valid duration, unit must be one of ns, us, ms, s`,
    )
  }
  if (!Number.isInteger(duration)) {
    throw Error(`${duration} in ${durationString} must be an Integer!`)
  }
}

function durationInNanoNumber(durationString) {
  let durationString = durationString.trim().replace(/ +(?= )/g, '')
  const [duration, unit] = durationString.split(' ')
  return duration * unitToDuration[unit]
}
function durationInNanoString(durationString) {
  return `${durationInNanoNumber(durationString)} ns`
}

function nanoAsString(nanoNumber) {
  return `${nanoNumber} ns`
}

function after(currentString, delayString) {
  let currentString = currentString.trim().replace(/ +(?= )/g, '')
  let delayString = delayString.trim().replace(/ +(?= )/g, '')
  const currentNano = durationInNanoNumber(currentString)
  const delayNano = durationInNanoNumber(delayString)
  return nanoAsString(currentNano + delayNano)
}

module.exports = { parseDuration, durationInNanoString, after }
