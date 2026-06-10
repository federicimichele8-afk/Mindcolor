const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const YOUTUBE_API_KEY = 'AIzaSyClJJb67PMDJSICDi20nQEz4iOCXtyE9bo';
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHANNEL_ID = 'UCnl-n7EHvZixecCh7cSpsZA';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'voyage-3', input: [text], input_type: 'document' });
    const options = {
      hostname: 'api.voyageai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + VOYAGE_API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.data) resolve(parsed.data[0].embedding);
          else reject(new Error(JSON.stringify(parsed)));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
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

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const content = `Titolo: ${v.snippet.title}. Descrizione: ${v.snippet.description}. Data: ${v.snippet.publishedAt}`;
    try {
      const embedding = await getEmbedding(content);
      await supabase.from('knowledge_base').insert({
        content,
        embedding,
        metadata: { title: v.snippet.title, url: `https://youtube.com/watch?v=${v.id.videoId}`, source: 'youtube' }
      });
      console.log(`[${i+1}/${videos.length}] ${v.snippet.title}`);
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.error(`Errore su ${v.snippet.title}:`, e.message);
    }
  }
  console.log('COMPLETATO!');
}

ingest().catch(console.error);
