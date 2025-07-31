const fs = require('fs');
const path = require('path');

const folders = ['Agendas', 'Minutes', 'Packets'];
const manifest = {};

folders.forEach(folder => {
  const files = fs.readdirSync(folder).filter(f => f.endsWith('.pdf'));
  manifest[folder] = files.map(f => `${folder}/${f}`);
});

fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
