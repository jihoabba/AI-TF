#!/usr/bin/env node
/**
 * 엑셀 데이터 → 대시보드 임베딩 스크립트
 *
 * SAP 엑셀 파일을 파싱해서 각 idea 페이지에 pre-loaded 데이터를 삽입합니다.
 * 업로드 UI를 숨기고 바로 대시보드가 뜨도록 합니다.
 *
 * 사용법: node scripts/embed-data.js [엑셀파일경로]
 */

const XLSX = require('/tmp/node_modules/xlsx');
const fs   = require('fs');
const path = require('path');

const EXCEL_PATH = process.argv[2] || '/Users/yeomdonghyeog/Downloads/매출 로우 데이터 (바탕화면).xlsx';
const IDEA_DIR   = path.join(__dirname, '..', 'idea');

if (!fs.existsSync(EXCEL_PATH)) {
  console.error('❌ 엑셀 파일을 찾을 수 없습니다:', EXCEL_PATH);
  process.exit(1);
}

console.log('📊 엑셀 파일 로딩:', EXCEL_PATH);
const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });

// ── 시트 데이터 추출 ──
function getSheet(name) {
  const found = wb.SheetNames.find(n => n.includes(name));
  if (!found) { console.warn('  ⚠ 시트 없음:', name); return []; }
  return XLSX.utils.sheet_to_json(wb.Sheets[found], { header: 1, defval: null });
}

const profitRaw = getSheet('공헌이익 raw');
const fcstRaw   = getSheet('Fcst raw');
const ytdRaw    = getSheet('YTD raw');
const agingRaw  = getSheet('단가');

console.log(`  공헌이익 raw: ${profitRaw.length}행`);
console.log(`  Fcst raw: ${fcstRaw.length}행`);
console.log(`  YTD raw: ${ytdRaw.length}행`);
console.log(`  단가(Aging): ${agingRaw.length}행`);

// ── 헬퍼 ──
function num(v) { return typeof v === 'number' ? v : 0; }
function str(v) { return v != null ? String(v).trim() : ''; }
function monthFromVal(v) {
  if (v instanceof Date) return v.getMonth() + 1;
  if (typeof v === 'number' && v > 0 && v <= 12) return v;
  if (typeof v === 'string') { const n = parseInt(v); if (n > 0 && n <= 12) return n; }
  return null;
}

// ── 1. b2b-sales-report: parseSAP(공헌이익 raw) ──
function parseSalesReport() {
  const data = profitRaw;
  if (data.length < 2) return [];
  // 판매처명 컬럼이 있는지 확인 — 없으면 이 시트의 헤더 사용
  const headers = data[0].map(h => str(h));
  const col = name => headers.indexOf(name);

  // 공헌이익 raw 시트는 header가 다른 형태
  // 판매처명이 없으면 Partner 사용
  let cPartner = col('판매처명');
  if (cPartner < 0) cPartner = col('Partner');
  const cIP     = headers.findIndex(h => h.includes('IP'));
  const cAmount = headers.findIndex(h => h.includes('Amt') || h.includes('대금청구금액'));
  const cProfit = headers.findIndex(h => h.includes('공헌이익'));
  const cMonth  = col('월');

  if (cPartner < 0 || cAmount < 0) return [];

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const partner = r[cPartner];
    const amount  = r[cAmount];
    if (!partner || typeof amount !== 'number') continue;
    rows.push({
      month:   monthFromVal(cMonth >= 0 ? r[cMonth] : null),
      partner: str(partner),
      ip:      cIP >= 0 && r[cIP] ? str(r[cIP]) : 'ETC',
      sales:   amount / 1.1,
      profit:  cProfit >= 0 && typeof r[cProfit] === 'number' ? r[cProfit] : 0,
    });
  }
  return rows;
}

// ── 2. b2b-profit-analysis: parseSheet(공헌이익 raw) ──
function parseProfitAnalysis() {
  const data = profitRaw;
  if (data.length < 2) return [];
  const headers = data[0].map(h => str(h));
  const col = name => headers.findIndex(h => h.includes(name));

  const cMonth   = col('월');
  const cPartner = col('Partner');
  const cIP      = col('IP');
  const cQty     = headers.findIndex(h => h.includes('Uint') || h.includes('수량'));
  const cSales   = headers.findIndex(h => h.includes('Amt') || (h.includes('매출') && h.includes('v-')));
  const cRoyalty  = col('로열티');
  const cCost     = col('원가');
  const cShip     = col('배송비');
  const cTTL      = col('TTL');
  const cProfit   = col('공헌이익');

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r || r.every(v => v == null || v === '')) continue;
    rows.push({
      month:   monthFromVal(cMonth >= 0 ? r[cMonth] : null),
      partner: cPartner >= 0 && r[cPartner] ? str(r[cPartner]) : 'N/A',
      ip:      cIP >= 0 && r[cIP] ? str(r[cIP]) : 'ETC',
      qty:     cQty >= 0 ? num(r[cQty]) : 0,
      sales:   cSales >= 0 ? num(r[cSales]) : 0,
      royalty: cRoyalty >= 0 ? num(r[cRoyalty]) : 0,
      cost:    cCost >= 0 ? num(r[cCost]) : 0,
      ship:    cShip >= 0 ? num(r[cShip]) : 0,
      ttl:     cTTL >= 0 ? num(r[cTTL]) : 0,
      profit:  cProfit >= 0 ? num(r[cProfit]) : 0,
    });
  }
  return rows;
}

// ── 3. b2b-target-actual: parseFcst + parseActual ──
function parseFcst() {
  const data = fcstRaw;
  if (data.length < 3) return [];
  const headers = (data[1] || data[0]).map(h => str(h));
  const col = name => headers.findIndex(h => h === name || h.includes(name));

  const cMonth   = col('월');
  const cPartner = headers.findIndex(h => h === '업체명');
  const cIP      = col('IP');
  const cSales   = headers.findIndex(h => h.includes('거래액') && h.includes('v-'));
  const cProfit  = headers.findIndex(h => h.includes('공헌이익금'));
  if (cPartner < 0) return [];

  const rows = [];
  for (let i = 2; i < data.length; i++) {
    const r = data[i];
    if (!r || r.every(v => v == null || v === '')) continue;
    rows.push({
      month:   monthFromVal(cMonth >= 0 ? r[cMonth] : null),
      partner: cPartner >= 0 && r[cPartner] ? str(r[cPartner]) : 'N/A',
      ip:      cIP >= 0 && r[cIP] ? str(r[cIP]) : 'ETC',
      sales:   cSales >= 0 ? num(r[cSales]) : 0,
      profit:  cProfit >= 0 ? num(r[cProfit]) : 0,
    });
  }
  return rows;
}

function parseActual() {
  const data = profitRaw;
  if (data.length < 2) return [];
  const headers = data[0].map(h => str(h));
  const col = name => headers.findIndex(h => h.includes(name));

  const cMonth   = col('월');
  const cPartner = col('Partner');
  const cIP      = col('IP');
  const cSales   = headers.findIndex(h => h.includes('Amt') || (h.includes('매출') && h.includes('v-')));
  const cProfit  = col('공헌이익');

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r || r.every(v => v == null || v === '')) continue;
    rows.push({
      month:   monthFromVal(cMonth >= 0 ? r[cMonth] : null),
      partner: cPartner >= 0 && r[cPartner] ? str(r[cPartner]) : 'N/A',
      ip:      cIP >= 0 && r[cIP] ? str(r[cIP]) : 'ETC',
      sales:   cSales >= 0 ? num(r[cSales]) : 0,
      profit:  cProfit >= 0 ? num(r[cProfit]) : 0,
    });
  }
  return rows;
}

// ── 4. commerce-dashboard: parseSheet(YTD raw) ──
function parseCommerce() {
  const data = ytdRaw;
  if (data.length < 2) return [];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    const amount = r[46];
    if (typeof amount !== 'number') continue;
    let month = r[68];
    if (month instanceof Date) month = month.getMonth() + 1;
    if (typeof month !== 'number' || month <= 0 || month > 12) month = null;
    rows.push({
      channel:  r[4]  ? str(r[4])  : 'ETC',
      partner:  r[8]  ? str(r[8])  : '',
      prodCode: r[22] ? str(r[22]) : '',
      prodName: r[23] ? str(r[23]) : '',
      orderQty: num(r[24]),
      billQty:  num(r[39]),
      amount,
      ip:       r[57] ? str(r[57]) : 'ETC',
      month,
    });
  }
  return rows;
}

// ── 5. offline-dashboard: inventory(Aging) + sales(YTD) ──
function excelDateToStr(v) {
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (typeof v === 'number' && v > 30000) {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return v ? str(v) : null;
}

function parseOfflineInventory() {
  const data = agingRaw;
  if (data.length < 2) return [];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r || !r[7]) continue;
    rows.push({
      category:   r[4] ? str(r[4]) : '',
      matCode:    str(r[7]),
      matName:    r[8] ? str(r[8]) : '',
      ip:         r[11] ? str(r[11]) : 'ETC',
      releaseDate: excelDateToStr(r[15]),
      offlineWh:  num(r[18]),
      storeQty:   num(r[20]),
      totalQty:   num(r[22]),
      totalAmt:   num(r[23]),
      totalPrice: num(r[24]),
      sellPrice:  num(r[26]),
    });
  }
  return rows;
}

function parseOfflineSales() {
  const data = ytdRaw;
  if (data.length < 2) return [];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    const amount = r[46];
    if (typeof amount !== 'number') continue;
    let month = r[68];
    if (month instanceof Date) month = month.getMonth() + 1;
    if (typeof month !== 'number' || month <= 0 || month > 12) month = null;
    rows.push({
      partner:  r[8] ? str(r[8]) : '',
      shipDate: excelDateToStr(r[16]),
      prodCode: r[22] ? str(r[22]) : '',
      prodName: r[23] ? str(r[23]) : '',
      billQty:  num(r[39]),
      amount,
      ip:       r[57] ? str(r[57]) : 'ETC',
      month,
    });
  }
  return rows;
}

// ── 6. md-inventory: parseData(Aging raw array) ──
// 이 페이지는 raw array를 직접 받으므로 agingRaw 그대로 전달
// 하지만 사이즈가 크므로 parseData 결과를 임베드

function parseMdInventory() {
  const data = agingRaw;
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r || !r[7]) continue;
    rows.push({
      type: r[0] || '',
      catPart: r[3] || '',
      catL: r[4] || '',
      catM: r[5] || '',
      catS: r[6] || '',
      code: String(r[7] || ''),
      name: r[8] || '',
      charM: r[9] || '',
      ipL: r[11] || '',
      ipM: r[12] || '',
      releaseDate: excelDateToStr(r[15]),
      firstInDate: excelDateToStr(r[16]),
      lastInDate: excelDateToStr(r[17]),
      offline: num(r[18]),
      online: num(r[19]),
      store: num(r[20]),
      transfer: num(r[21]),
      totalQty: num(r[22]),
      totalAmt: num(r[23]),
      unitPrice: num(r[24]),
      salePrice: num(r[26]),
    });
  }
  return rows;
}

// ── 7. md-order-forecast: processData(ytdRaw, fcstRaw, agingRaw) ──
function parseMdOrderForecast() {
  // YTD: monthly sales by IP
  const ytdByIp = {};
  for (let i = 1; i < ytdRaw.length; i++) {
    const r = ytdRaw[i];
    if (!r) continue;
    const ip = r[57];
    if (!ip) continue;
    const month = r[68];
    const qty = num(r[39]);
    if (!ytdByIp[ip]) ytdByIp[ip] = { months: new Set(), totalQty: 0 };
    if (month) ytdByIp[ip].months.add(month);
    ytdByIp[ip].totalQty += qty;
  }

  // Fcst
  const fcstByIp = {};
  if (fcstRaw.length > 1) {
    const hdr = fcstRaw[1] || fcstRaw[0];
    let colIP = -1, colQty = -1;
    for (let c = 0; c < (hdr ? hdr.length : 0); c++) {
      const h = String(hdr[c] || '').trim();
      if (h === 'IP' || h.includes('IP')) colIP = c;
      if (h === '수량' || h.includes('수량')) colQty = c;
    }
    const startRow = (fcstRaw[1] && colIP >= 0) ? 2 : 1;
    for (let i = startRow; i < fcstRaw.length; i++) {
      const r = fcstRaw[i];
      if (!r) continue;
      const ip = colIP >= 0 ? r[colIP] : '';
      const qty = colQty >= 0 ? num(r[colQty]) : 0;
      if (!ip) continue;
      fcstByIp[ip] = (fcstByIp[ip] || 0) + qty;
    }
  }

  // Aging inventory
  const invByIp = {};
  for (let i = 1; i < agingRaw.length; i++) {
    const r = agingRaw[i];
    if (!r || !r[7]) continue;
    const ip = r[11] || '';
    const qty = num(r[22]);
    if (!ip) continue;
    invByIp[ip] = (invByIp[ip] || 0) + qty;
  }

  // Merge
  const allIps = new Set([...Object.keys(ytdByIp), ...Object.keys(invByIp)]);
  const ipData = [];
  allIps.forEach(ip => {
    const ytd = ytdByIp[ip];
    const monthCount = ytd ? Math.max(ytd.months.size, 1) : 1;
    const avgMonthly = ytd ? Math.round(ytd.totalQty / monthCount) : 0;
    const currentInv = invByIp[ip] || 0;
    const burnMonths = avgMonthly > 0 ? currentInv / avgMonthly : (currentInv > 0 ? 999 : 0);
    const fcstQty = fcstByIp[ip] || 0;

    let rec = '', cls = '';
    if (burnMonths < 1) { rec = '긴급 발주 필요'; cls = 'rec-urgent'; }
    else if (burnMonths < 2) { rec = '발주 권장'; cls = 'rec-order'; }
    else if (burnMonths < 3) { rec = '모니터링'; cls = 'rec-monitor'; }
    else { rec = '적정'; cls = 'rec-ok'; }

    ipData.push({ ip, avgMonthly, currentInv, burnMonths, fcstQty, rec, cls });
  });

  ipData.sort((a, b) => a.burnMonths - b.burnMonths);
  return ipData;
}

// ── HTML 수정 ──
const PRELOAD_MARKER = '/* PRELOADED_DATA_START */';
const PRELOAD_END    = '/* PRELOADED_DATA_END */';

function injectData(filename, scriptContent) {
  const filePath = path.join(IDEA_DIR, filename);
  let html = fs.readFileSync(filePath, 'utf8');

  // 기존 임베딩 제거
  const startIdx = html.indexOf(PRELOAD_MARKER);
  const endIdx   = html.indexOf(PRELOAD_END);
  if (startIdx >= 0 && endIdx >= 0) {
    html = html.slice(0, startIdx) + html.slice(endIdx + PRELOAD_END.length);
  }

  // </body> 앞에 삽입
  const insertPoint = html.lastIndexOf('</body>');
  if (insertPoint < 0) {
    console.error('  ❌ </body> 없음:', filename);
    return;
  }

  const injection = `\n<script>\n${PRELOAD_MARKER}\n${scriptContent}\n${PRELOAD_END}\n</script>\n`;
  html = html.slice(0, insertPoint) + injection + html.slice(insertPoint);

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`  ✅ ${filename} 임베딩 완료`);
}

// ── 각 페이지 처리 ──
console.log('\n🔧 데이터 파싱 & 임베딩 시작...\n');

// 1) b2b-sales-report
const salesReportData = parseSalesReport();
console.log(`  b2b-sales-report: ${salesReportData.length}건`);
injectData('b2b-sales-report.html', `
(function() {
  const preloaded = ${JSON.stringify(salesReportData)};
  allRows = preloaded;
  const FISCAL_ORDER = [4,5,6,7,8,9,10,11,12,1,2,3];
  const monthSet = new Set(preloaded.map(r => r.month).filter(m => m && m > 0));
  availableMonths = FISCAL_ORDER.filter(m => monthSet.has(m));
  const sel = document.getElementById('month-select');
  sel.innerHTML = availableMonths.map(m => '<option value="' + m + '">' + m + '월</option>').join('');
  sel.disabled = false;
  sel.value = availableMonths[availableMonths.length - 1];
  document.getElementById('gen-btn').disabled = false;
  document.querySelector('.upload-card').style.display = 'none';
  document.getElementById('file-info').style.display = 'flex';
  document.getElementById('file-info').textContent = '✅ SAP 데이터 자동 연동 — ' + preloaded.length.toLocaleString() + '건';
  generateReport();
})();
`);

// 2) b2b-profit-analysis
const profitData = parseProfitAnalysis();
console.log(`  b2b-profit-analysis: ${profitData.length}건`);
injectData('b2b-profit-analysis.html', `
(function() {
  const preloaded = ${JSON.stringify(profitData)};
  allRows = preloaded;
  const monthSet = new Set(preloaded.map(r => r.month).filter(m => m && m > 0));
  availableMonths = [1,2,3,4,5,6,7,8,9,10,11,12].filter(m => monthSet.has(m));
  const sel = document.getElementById('month-select');
  sel.innerHTML = availableMonths.map(m => '<option value="' + m + '">' + m + '월</option>').join('');
  sel.disabled = false;
  sel.value = availableMonths[availableMonths.length - 1];
  document.getElementById('gen-btn').disabled = false;
  document.querySelector('.upload-card').style.display = 'none';
  document.getElementById('file-info').style.display = 'flex';
  document.getElementById('file-info').textContent = '✅ SAP 데이터 자동 연동 — ' + preloaded.length.toLocaleString() + '건';
  generateReport();
})();
`);

// 3) b2b-target-actual
const fcstData = parseFcst();
const actualData = parseActual();
console.log(`  b2b-target-actual: 목표 ${fcstData.length}건 / 실적 ${actualData.length}건`);
injectData('b2b-target-actual.html', `
(function() {
  fcstRows = ${JSON.stringify(fcstData)};
  actualRows = ${JSON.stringify(actualData)};
  const monthSet = new Set();
  fcstRows.forEach(r => { if (r.month > 0) monthSet.add(r.month); });
  actualRows.forEach(r => { if (r.month > 0) monthSet.add(r.month); });
  availableMonths = [1,2,3,4,5,6,7,8,9,10,11,12].filter(m => monthSet.has(m));
  const sel = document.getElementById('month-select');
  sel.innerHTML = availableMonths.map(m => '<option value="' + m + '">' + m + '월</option>').join('');
  sel.disabled = false;
  sel.value = availableMonths[availableMonths.length - 1];
  document.getElementById('gen-btn').disabled = false;
  document.querySelector('.upload-card').style.display = 'none';
  document.getElementById('file-info').style.display = 'flex';
  document.getElementById('file-info').textContent = '✅ SAP 데이터 자동 연동 — 목표 ' + fcstRows.length.toLocaleString() + '건 / 실적 ' + actualRows.length.toLocaleString() + '건';
  generateReport();
})();
`);

// 4) commerce-dashboard
const commerceData = parseCommerce();
console.log(`  commerce-dashboard: ${commerceData.length}건`);
injectData('commerce-dashboard.html', `
(function() {
  const preloaded = ${JSON.stringify(commerceData)};
  allRows = preloaded;
  const FISCAL_ORDER = [4,5,6,7,8,9,10,11,12,1,2,3];
  const monthSet = new Set(preloaded.map(r => r.month).filter(m => m && m > 0));
  availableMonths = FISCAL_ORDER.filter(m => monthSet.has(m));
  const sel = document.getElementById('month-select');
  sel.innerHTML = '<option value="all">전체</option>' + availableMonths.map(m => '<option value="' + m + '">' + m + '월</option>').join('');
  sel.disabled = false;
  sel.value = availableMonths[availableMonths.length - 1];
  document.getElementById('gen-btn').disabled = false;
  document.querySelector('.upload-card').style.display = 'none';
  document.getElementById('file-info').style.display = 'flex';
  document.getElementById('file-info').textContent = '✅ SAP 데이터 자동 연동 — ' + preloaded.length.toLocaleString() + '건';
  generateReport();
})();
`);

// 5) offline-dashboard
const offlineInv   = parseOfflineInventory();
const offlineSales = parseOfflineSales();
console.log(`  offline-dashboard: 재고 ${offlineInv.length}건 / 판매 ${offlineSales.length}건`);
injectData('offline-dashboard.html', `
(function() {
  inventoryRows = ${JSON.stringify(offlineInv)};
  salesRows = ${JSON.stringify(offlineSales)};
  const FISCAL_ORDER = [4,5,6,7,8,9,10,11,12,1,2,3];
  const monthSet = new Set(salesRows.map(r => r.month).filter(m => m && m > 0));
  availableMonths = FISCAL_ORDER.filter(m => monthSet.has(m));
  document.getElementById('gen-btn').disabled = false;
  document.querySelector('.upload-card').style.display = 'none';
  document.getElementById('file-info').style.display = 'flex';
  document.getElementById('file-info').textContent = '✅ SAP 데이터 자동 연동 — 재고 ' + inventoryRows.length.toLocaleString() + '건, 판매 ' + salesRows.length.toLocaleString() + '건';
  generateReport();
})();
`);

// 6) md-inventory
const mdInvData = parseMdInventory();
console.log(`  md-inventory: ${mdInvData.length}건`);
injectData('md-inventory.html', `
(function() {
  rows = ${JSON.stringify(mdInvData)};
  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('report').style.display = 'block';
  document.getElementById('reset-btn').style.display = 'inline-block';
  buildReport();
  document.getElementById('report').style.display = 'block';
})();
`);

// 7) md-order-forecast
const forecastData = parseMdOrderForecast();
console.log(`  md-order-forecast: ${forecastData.length}건`);
injectData('md-order-forecast.html', `
(function() {
  ipData = ${JSON.stringify(forecastData)};
  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('report').style.display = 'block';
  document.getElementById('reset-btn').style.display = 'inline-block';
  buildReport();
  document.getElementById('report').style.display = 'block';
})();
`);

console.log('\n✅ 전체 임베딩 완료!');
