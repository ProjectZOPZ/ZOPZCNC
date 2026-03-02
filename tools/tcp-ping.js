module.exports = async (params, stream) => {
  // Tool description
  const description = "[97musage[38;5;39m:[97m tcp-ping <ip/host> [port]";

  // Display description if no params are provided
  if (params.length === 0) {
    stream.write(`${description}\r\n`);
    return;
  }

  const ch = new globalThis.CheckHost();
  const ip = params[0];
  const port = params[1] ? parseInt(params[1]) : 80;

  if (!ip) {
    stream.write('usage: tcp-ping <ip/host> [port]\r\n');
    return;
  }

  try {
    globalThis.resizeTerminal(stream);
    globalThis.clearScreen(stream);
    stream.write(`[>] Starting TCP Ping to ${ip}:${port}...\r\n`);
    const result = await ch.tcpPingHost(ip, port);
    stream.write(`TCP Ping completed for ${ip}:${port}:\r\n`);
    const logs = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (msg) => { logs.push(msg); };
    ch.logCheckHostResult('TCP Ping', result, 'tcp');
    process.stdout.write = originalWrite;
    stream.write(logs.join('').replace(/\n/g, '\r\n'));
  } catch (err) {
    stream.write(`Error: ${err.message}\r\n`);
  }
};

// Export tool description for later use
module.exports.description = "tcp-ping <ip/host> [port]";