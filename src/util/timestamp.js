const unitToTimestamp = {
  hr: 3600,
  min: 60,
  s: 1,
}
function parseTimestamp(timestampString) {
  timestampString = timestampString.trim().replace(/ +(?= )/g, '')
  const [timestamp, unit] = timestampString.split(' ')
  if (Object.keys(unitToTimestamp).indexOf(unit) == -1) {
    throw Error(
      `${timestampString} is not a valid timeStamp, unit must be one of s, min and hr`,
    )
  }
  if (!Number.isInteger(timestamp)) {
    throw Error(`${timestamp} in ${timestampString} must be an Integer!`)
  }
}

function timestampInSecondsNumber(timestampString) {
  timestampString = timestampString.trim().replace(/ +(?= )/g, '')
  const [timestamp, unit] = timestampString.split(' ')
  return timestamp * unitToTimestamp[unit]
}
function timestampInSecondsString(timestampString) {
  return `${timestampInSecondsNumber(timestampString)} s`
}

function secondsAsString(secondsNumber) {
  return `${secondsNumber} s`
}
function after(currentString, afterString) {
  currentString = currentString.trim().replace(/ +(?= )/g, '')
  afterString = afterString.trim().replace(/ +(?= )/g, '')
  const currentSeconds = timestampInSecondsNumber(currentString)
  const afterSeconds = timestampInSecondsNumber(afterString)
  return secondsAsString(currentSeconds + afterSeconds)
}
module.exports = {
  parseTimestamp,
  timestampInSecondsString,
  secondsAsString,
  after,
}
