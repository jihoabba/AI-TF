#!/usr/bin/env node
/**
 * AX TF — 인덱스 자동 빌드 스크립트
 *
 * reports/, idea/, meeting-notes/ 폴더의 HTML 파일을 스캔하여
 * 각 파일의 <meta name="tf-*"> 태그를 읽고 index.html의
 * [TF-DOCS-START] ~ [TF-DOCS-END] 구간을 자동으로 업데이트합니다.
 *
 * 사용법:
 *   node scripts/build-index.js
 *
 * 새 파일 추가 방법:
 *   1. HTML 파일에 아래 메타 태그를 추가
 *   2. 해당 폴더(reports/ idea/ meeting-notes/)에 파일 저장
 *   3. git push → GitHub Actions가 자동으로 index.html 갱신
 *
 * 필수 메타 태그:
 *   <meta name="tf-type"   content="report|idea|meeting">
 *   <meta name="tf-title"  content="문서 제목">
 *   <meta name="tf-desc"   content="짧은 설명">
 *   <meta name="tf-date"   content="YYYY-MM-DD">
 *   <meta name="tf-tags"   content="태그1,태그2">
 *
 * report 전용:
 *   <meta name="tf-slides" content="10">
 *
 * meeting 전용:
 *   <meta name="tf-attendees"   content="이름1,이름2">
 *   <meta name="tf-meeting-num" content="001">
 *
 * idea 전용:
 *   <meta name="tf-status" content="Draft|Review|Done">
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const FOLDERS = [
  { dir: 'reports',       type: 'report'  },
  { dir: 'idea',          type: 'idea'    },
  { dir: 'meeting-notes', type: 'meeting' },
];

const SKIP_FILES = ['placeholder.html'];

// <meta name="..." content="..."> 값 추출
function getMeta(html, name) {
  const re = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, 'i');
  const m  = html.match(re);
  if (m) return m[1].trim();
  // 속성 순서가 반대인 경우도 처리
  const re2 = new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+name=["']${name}["']`, 'i');
  const m2  = html.match(re2);
  return m2 ? m2[1].trim() : null;
}

const docs = [];

for (const folder of FOLDERS) {
  const folderPath = path.join(ROOT, folder.dir);
  if (!fs.existsSync(folderPath)) continue;

  const files = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.html') && !SKIP_FILES.includes(f))
    .sort();

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const html = fs.readFileSync(filePath, 'utf8');

    const title = getMeta(html, 'tf-title');
    const date  = getMeta(html, 'tf-date');

    if (!title || !date) {
      console.warn(`  ⚠ 스킵: ${folder.dir}/${file} (tf-title 또는 tf-date 없음)`);
      continue;
    }

    const type = getMeta(html, 'tf-type') || folder.type;
    const desc = getMeta(html, 'tf-desc') || '';
    const tags = (getMeta(html, 'tf-tags') || type).split(',').map(t => t.trim()).filter(Boolean);

    const doc = {
      type,
      id:   path.basename(file, '.html'),
      title,
      desc,
      file: `${folder.dir}/${file}`,
      date,
      tags,
    };

    if (type === 'report') {
      const slides = parseInt(getMeta(html, 'tf-slides') || '0', 10);
      doc.slides = slides || 0;
    }

    if (type === 'meeting') {
      const raw = getMeta(html, 'tf-attendees') || '';
      doc.attendees  = raw.split(',').map(a => a.trim()).filter(Boolean);
      doc.meetingNum = getMeta(html, 'tf-meeting-num') || '000';
    }

    if (type === 'idea') {
      doc.status = getMeta(html, 'tf-status') || 'Draft';
    }

    docs.push(doc);
    console.log(`  ✓ ${folder.dir}/${file} → [${type}] ${title}`);
  }
}

// 날짜 내림차순 정렬
docs.sort((a, b) => new Date(b.date) - new Date(a.date));

// index.html 업데이트
const indexPath = path.join(ROOT, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

const docsJson   = JSON.stringify(docs);
const newContent =
  `  // [TF-DOCS-START] — 자동 생성 영역, scripts/build-index.js가 관리합니다\n` +
  `  const docs = ${docsJson};\n` +
  `  // [TF-DOCS-END]`;

const START_MARKER = '// [TF-DOCS-START]';
const END_MARKER   = '// [TF-DOCS-END]';

const startIdx = indexHtml.indexOf(START_MARKER);
const endIdx   = indexHtml.indexOf(END_MARKER);

if (startIdx === -1 || endIdx === -1) {
  console.error('❌ index.html에서 [TF-DOCS-START] / [TF-DOCS-END] 마커를 찾을 수 없습니다.');
  process.exit(1);
}

indexHtml =
  indexHtml.slice(0, startIdx) +
  newContent +
  indexHtml.slice(endIdx + END_MARKER.length);

fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log(`\n✅ index.html 업데이트 완료 — 총 ${docs.length}개 문서`);
