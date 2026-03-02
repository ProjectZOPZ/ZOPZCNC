module.exports = async (params, stream) => {
  // Tool description
  const description = "usage: ping <ip/host>";

  // Display description if no params are provided
  if (params.length === 0) {
    stream.write(`${description}\r\n`);
    return;
  }

  const ch = new globalThis.CheckHost();
  const ip = params[0];

  if (!ip) {
    stream.write('usage: ping <ip/host>\r\n');
    return;
  }

  try {
    globalThis.resizeTerminal(stream);
    globalThis.clearScreen(stream);
    stream.write(`[>] Starting ICMP Ping to ${ip}...\r\n`);

    // Perform the ICMP ping
    const result = await ch.pingHost(ip);

    stream.write(`Ping completed for ${ip}:\r\n`);

    // Capture logs instead of printing directly to stdout
    const logs = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (msg) => { logs.push(msg); };

    // Log ping results
    ch.logCheckHostResult('Ping', result, 'ping');

    process.stdout.write = originalWrite;
    stream.write(logs.join('').replace(/\n/g, '\r\n'));

  } catch (err) {
    stream.write(`Error: ${err.message}\r\n`);
  }
};

// Export tool description for later use
module.exports.description = "usage: ping <ip/host>";
