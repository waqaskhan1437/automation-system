(async () => {
  console.log('=== Testing savefrom.net / ssyoutube ===');
  const videoId = 'Mof3IpZtEX0';
  
  // Try savefrom API
  console.log('\n--- Attempt 1: savefrom.net API ---');
  try {
    const api1 = `https://worker.savefrom.net/savefrom.php?${new URLSearchParams({
      sf_url: 'https://www.youtube.com/watch?v=' + videoId,
      sf_submit: '',
      new: '2',
      lang: 'en',
      app: '',
      country: 'en',
      os: 'Windows',
      browser: 'Chrome',
      channel: '',
      url: 'https://www.youtube.com/watch?v=' + videoId,
      _ts: Date.now(),
    })}`;
    
    const res1 = await fetch(api1, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://en.savefrom.net/',
      }
    });
    console.log('Status:', res1.status);
    const text1 = await res1.text();
    console.log('Response length:', text1.length);
    console.log('Response preview:', text1.substring(0, 500));
    
    if (text1.includes('"url"')) {
      const urlMatch = text1.match(/"url"\s*:\s*"([^"]+)"/g);
      if (urlMatch) {
        console.log('URLs found:', urlMatch.length);
        urlMatch.forEach(u => console.log('  ' + u.substring(0, 150)));
      }
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Try ssyoutube.com directly
  console.log('\n--- Attempt 2: ssyoutube.com redirect ---');
  try {
    const res2 = await fetch('https://ssyoutube.com/watch?v=' + videoId, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    console.log('Status:', res2.status);
    console.log('Redirect:', res2.headers.get('location') || 'none');
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Try cobalt.tools API (open source, no auth)
  console.log('\n--- Attempt 3: cobalt.tools API ---');
  try {
    const res3 = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=' + videoId,
        vCodec: 'h264',
        vQuality: '720',
        aFormat: 'mp3',
        isAudioOnly: false,
        isNoTTWatermark: true,
      })
    });
    console.log('Status:', res3.status);
    const json3 = await res3.json();
    console.log('Response:', JSON.stringify(json3).substring(0, 500));
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Try y2mate style API
  console.log('\n--- Attempt 4: y2mate.is API ---');
  try {
    const res4 = await fetch('https://www.y2mate.com/mates/analyzeV2/ajax', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.y2mate.com/youtube/' + videoId,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({
        q: 'https://www.youtube.com/watch?v=' + videoId,
        vt: 'home',
      })
    });
    console.log('Status:', res4.status);
    const text4 = await res4.text();
    console.log('Response length:', text4.length);
    console.log('Response preview:', text4.substring(0, 500));
  } catch (e) {
    console.log('Error:', e.message);
  }
})();
