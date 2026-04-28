(async () => {
  console.log('=== Testing genyt.net ===');
  const videoId = 'Mof3IpZtEX0';
  const url = 'https://www.genyt.net/watch?v=' + videoId;
  
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    }
  });
  
  console.log('Status:', res.status);
  const html = await res.text();
  
  const videoMatch = html.match(/https?:\/\/[^"'\\s]+\.mp4[^"'\\s]*/gi);
  console.log('MP4 URLs found:', videoMatch?.length || 0);
  if (videoMatch?.length > 0) {
    videoMatch.slice(0, 3).forEach(u => console.log('  ' + u.substring(0, 120)));
  }
  
  const dlMatch = html.match(/https?:\/\/[^"'\\s]*(?:download|dl|save)[^"'\\s]*/gi);
  console.log('Download URLs found:', dlMatch?.length || 0);
  if (dlMatch?.length > 0) {
    dlMatch.slice(0, 3).forEach(u => console.log('  ' + u.substring(0, 120)));
  }
  
  console.log('Page size:', (html.length / 1024).toFixed(1) + 'KB');
  console.log('Has download button:', html.includes('download') ? 'YES' : 'NO');
  console.log('Has API endpoint:', html.includes('/api/') ? 'YES' : 'NO');
  
  // Look for download links in HTML
  const linkMatch = html.match(/href="([^"]+download[^"]*)"/gi);
  if (linkMatch?.length > 0) {
    console.log('Download hrefs:');
    linkMatch.slice(0, 5).forEach(u => console.log('  ' + u.substring(0, 150)));
  }
  
  // Look for any video/stream URLs
  const streamMatch = html.match(/url["\s:=]+["'](https?:\/\/[^"'\\s]+)["']/gi);
  if (streamMatch?.length > 0) {
    console.log('Stream URLs:');
    streamMatch.slice(0, 3).forEach(u => console.log('  ' + u.substring(0, 150)));
  }
  
  // Check for JSON config
  const jsonMatch = html.match(/var\s+\w+\s*=\s*(\{[^}]*\})/gi);
  if (jsonMatch?.length > 0) {
    console.log('JS vars found:');
    jsonMatch.slice(0, 3).forEach(u => console.log('  ' + u.substring(0, 150)));
  }
})();
