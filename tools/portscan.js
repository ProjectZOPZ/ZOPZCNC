const fetch = require('node-fetch');

module.exports = async (params, stream) => {
    const description = "Scans an IP or domain for open ports using WebResolver API.";

    if (!params || params.length === 0) {
        stream.write(`Usage: portscan <ip>\r\n`);
        stream.write(`${description}\r\n`);
        return;
    }

    const ip = params[0];
    const apiKey = 'KC3B9-E9T5K-3TNS9-XDGC9';
    const apiUrl = `https://webresolver.nl/api.php?key=${apiKey}&json&action=portscan&string=${ip}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data?.ports?.length > 0) {
            stream.write(`\r\n========================\r\n`);
            stream.write(` Port Scan Results\r\n`);
            stream.write(`========================\r\n`);
            stream.write(`Target: ${data.domain || ip}\r\n`);
            stream.write(`------------------------\r\n`);
            for (const portInfo of data.ports) {
                const portStatus = portInfo.open === "true" ? "Open" : "Closed";
                stream.write(`Port ${portInfo.port} (${portInfo.service}): ${portStatus}\r\n`);
            }
            stream.write(`========================\r\n`);
        } else {
            stream.write(`No ports found or API returned no data.\r\n`);
        }
    } catch (error) {
        stream.write(`Error performing port scan: ${error.message}\r\n`);
    }
};

module.exports.description = "usage: portscan <searchterm>";
