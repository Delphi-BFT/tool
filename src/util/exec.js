const { exec } = require('child_process');
function promisified_exec(cmd, workingDir, log) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: workingDir }, (error, stdout, stderr) => {
      if (error) {
        log.error(`process failed stderr: ${stderr}`);
        reject();
        throw Error('Error from child process!');
      }
      log.info(stdout);
      resolve();
    });
  });
}

module.exports = { promisified_exec };
