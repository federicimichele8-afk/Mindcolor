const https = require('https');
const { Pinecone } = require('@pinecone-database/pinecone');

const YOUTUBE_API_KEY = 'AIzaSyClJJb67PMDJSICDi20nQEz4iOCXtyE9bo';
const PINECONE_API_KEY = 'pcsk_5qy7ZK_BfVjz5gQLYCgRwqqy161eBZTDSDqHeQEiXDHgR7Je1VvJynqttMVxdJ4aug6v51';
const PINECONE_HOST = 'https://mindcolor-knowledge-kbu52di.svc.aped-4627-b74a.pinecone.io';
const CHANNEL_ID = 'UCnl-n7EHvZixecCh7cSpsZA';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function getAllVideos() {
  let videos = [];
  let pageToken = '';
  do {
    const url = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${CHANNEL_ID}&part=snippet&type=video&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}`;
    const data = await fetchJSON(url);
    if (data.items) videos = videos.concat(data.items);
    pageToken = data.nextPageToken || '';
    console.log(`Trovati ${videos.length} video...`);
  } while (pageToken);
  return videos;
}

async function ingest() {
  console.log('Scaricando video di Gianluca...');
  const videos = await getAllVideos();
  console.log(`Totale: ${videos.length} video`);

  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pc.index('mindcolor-knowledge', PINECONE_HOST);
  const ns = index.namespace('youtube');

  const records = videos.map(v => ({
    id: v.id.videoId,
    text: `Titolo: ${v.snippet.title}. Descrizione: ${v.snippet.description}. Data: ${v.snippet.publishedAt}`,
    title: v.snippet.title,
    url: `https://youtube.com/watch?v=${v.id.videoId}`,
    source: 'youtube'
  }));

  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    await ns.upsertRecords({ records: batch });
    console.log(`Caricati ${Math.min(i + 10, records.length)}/${records.length}`);
  }

  console.log('COMPLETATO! Tutti i video sono in Pinecone.');
}

ingest().catch(console.error);
