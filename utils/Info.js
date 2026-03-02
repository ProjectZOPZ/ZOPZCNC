const dns = require('dns').promises;
const net = require('net');
const fetch = require('node-fetch'); // Make sure you have node-fetch installed

async function resolveIP(hostname) {
  try {
    return await dns.lookup(hostname);
  } catch {
    return null; // Return null if DNS lookup fails
  }
}

async function getTargetDetails(input) {
  let host = input;

  // Strip protocol if present
  if (host.startsWith('http://') || host.startsWith('https://')) {
    host = new URL(host).hostname;
  }

  // Handle CIDR notation (e.g., 70.70.70.7/24 → 70.70.70.7)
  if (host.includes('/')) {
    host = host.split('/')[0];
  }

  // Validate or resolve
  const ip = net.isIP(host) ? host : (await resolveIP(host))?.address;

  // If input isn't a valid IP, return unknown
  if (!ip) {
    return { asn: 'Unknown', org: 'Unknown', country_code: 'Unknown' };
  }

  try {
    const response = await fetch(`https://zopzsniff.xyz/geoip/${ip}`);
    const data = await response.json();

    if (response.ok) {
      return {
        asn: data.asn_number ? `AS${data.asn_number}` : 'Unknown',
        org: data.asn_org || 'Unknown',
        country_code: data.country_code || 'Unknown'
      };
    }
  } catch (err) {
    console.error("GeoIP fetch failed:", err);
  }

  return { asn: 'Unknown', org: 'Unknown', country_code: 'Unknown' };
}

// Make function globally accessible
globalThis.getTargetDetails = getTargetDetails;

// Example usage
(async () => {
  console.log(await getTargetDetails("ZOPZ")); // { asn: 'Unknown', org: 'Unknown', country_code: 'Unknown' }
  console.log(await getTargetDetails("8.8.8.8")); // Returns GeoIP data
})();
