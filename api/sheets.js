export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id, gid } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing sheet id' });

  const url = gid
    ? `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
    : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch sheet' });
    }

    const csv = await response.text();
    const rows = parseCSV(csv);

    res.setHeader('Cache-Control', 's-maxage=300'); // 5분 캐시
    return res.status(200).json({ rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  const headers = splitCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      const key = h.trim();
      if (key) row[key] = (values[j] || '').trim();
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
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
