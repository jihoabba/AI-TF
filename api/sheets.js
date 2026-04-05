import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id, gid } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing sheet id' });

  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? '&gid=' + gid : ''}`;

  try {
    const csv = await fetchWithRedirect(url);
    const rows = parseCSV(csv);
    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(200).json({ rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function fetchWithRedirect(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function doRequest(currentUrl, remaining) {
      https.get(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
          'Accept': 'text/csv,text/plain,*/*'
        }
      }, (response) => {
        const { statusCode, headers } = response;

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          if (remaining <= 0) return reject(new Error('Too many redirects'));
          const location = headers['location'];
          if (!location) return reject(new Error('Redirect with no location'));
          response.resume();
          return doRequest(location, remaining - 1);
        }

        if (statusCode !== 200) {
          response.resume();
          return reject(new Error(`HTTP ${statusCode}`));
        }

        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        response.on('error', reject);
      }).on('error', reject);
    }

    doRequest(url, maxRedirects);
  });
}

function parseCSV(text) {
  // BOM 제거
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = clean.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  const headers = splitCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      const key = h.trim().replace(/\r/g, '');
      if (key) row[key] = (values[j] || '').trim().replace(/\r/g, '');
    });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
