#!/usr/bin/env node
/**
 * Notion 게시판 동기화 스크립트
 * 노션 DB에서 글을 가져와 board.json으로 저장합니다.
 *
 * 필요한 환경변수:
 *   NOTION_TOKEN — Notion Integration 시크릿 토큰
 *
 * GitHub Secrets에 NOTION_TOKEN을 추가하면 자동으로 실행됩니다.
 * (Settings → Secrets and variables → Actions → New repository secret)
 */

const https = require('https');
const fs    = require('fs');

const DATABASE_ID = 'e1820c46cd2a4e3599abc8fdac85ae50';
const TOKEN       = process.env.NOTION_TOKEN;

if (!TOKEN) {
  console.error('❌ NOTION_TOKEN 환경변수가 없습니다.');
  process.exit(1);
}

function notionPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.notion.com',
      path,
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch(e) { reject(new Error(buf)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function text(prop) {
  if (!prop) return '';
  if (prop.type === 'title')        return prop.title.map(t => t.plain_text).join('');
  if (prop.type === 'rich_text')    return prop.rich_text.map(t => t.plain_text).join('');
  if (prop.type === 'select')       return prop.select?.name || '';
  if (prop.type === 'created_time') return prop.created_time;
  return '';
}

async function main() {
  const res = await notionPost(`/v1/databases/${DATABASE_ID}/query`, {
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 30,
  });

  if (res.object === 'error') {
    console.error('Notion API 오류:', res.message);
    process.exit(1);
  }

  const posts = res.results
    .map(page => ({
      id:       page.id,
      url:      page.url,
      title:    text(page.properties['제목']),
      content:  text(page.properties['내용']),
      category: text(page.properties['카테고리']),
      author:   text(page.properties['작성자']),
      date:     text(page.properties['날짜']),
    }))
    .filter(p => p.title);

  fs.writeFileSync(
    'board.json',
    JSON.stringify(posts, null, 2),
    'utf8'
  );
  console.log(`✅ board.json 업데이트 — ${posts.length}개 글`);
}

main().catch(e => { console.error(e); process.exit(1); });
