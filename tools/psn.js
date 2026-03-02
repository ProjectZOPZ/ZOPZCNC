const fetch = require('node-fetch');

// Simple function to highlight matched keywords
function highlight(text, keywords) {
  let highlighted = text;
  keywords.forEach(keyword => {
    const regex = new RegExp(`(${keyword})`, 'gi');
    highlighted = highlighted.replace(regex, '[97m'); // yellow highlight
  });
  return highlighted;
}

module.exports = async (params, stream) => {
  const description = "[97musage[38;5;39m:[97m [97mpsn <searchterm>";

  if (params.length === 0) {
    stream.write(`${description}\r\n`);
    return;
  }

  const searchTerms = params.map(term => term.toLowerCase());

  try {
    // Fetch label list
    const response = await fetch('https://zopzsniff.xyz/api/label/list');
    const result = await response.json();

    if (!result.success || !Array.isArray(result.data)) {
      stream.write('Unexpected API response format\r\n');
      return;
    }

    // Filter matching entries
    const matches = result.data.filter(item =>
      searchTerms.some(term =>
        item.name.toLowerCase().includes(term) ||
        item.value.toLowerCase().includes(term)
      )
    );

    if (matches.length === 0) {
      stream.write('[97mNo matches found\r\n');
      return;
    }

    stream.write(`[97mFound ${matches.length} matching entries:\r\n`);

    // Fetch geo info for all matches in parallel
    const geoPromises = matches.map(async (item, index) => {
      // Highlight search terms in Name and IP
      const highlightedName = highlight(item.name, searchTerms);
      const highlightedIP = highlight(item.value, searchTerms);

      let output = `\r\n[97mEntry ${index + 1}:\r\n[97mName[38;5;39m:[97m ${highlightedName}\r\n[97mIP[38;5;39m:[97m ${highlightedIP}\r\n`;

      try {
        const geoRes = await fetch(`https://zopzsniff.xyz/geoip/${item.value}`);
        const geoData = await geoRes.json();

        if (geoData.success) {
          output += `[97mISP[38;5;39m:[97m ${geoData.isp}\r\n`;
          output += `[97mCountry[38;5;39m:[97m ${geoData.country_name}\r\n`;
          output += `[97mCity[38;5;39m:[97m ${geoData.city}\r\n`;
        } else {
          output += '[97mGeo info not available\r\n';
        }
      } catch {
        output += '[97mError fetching geo info\r\n';
      }

      return output;
    });

    const geoResults = await Promise.all(geoPromises);
    geoResults.forEach(entry => stream.write(entry));

  } catch (err) {
    stream.write('Error fetching or processing data\r\n');
  }
};

// Export description
module.exports.description = "psn <searchterm>";
