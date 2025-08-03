const fs = require('fs');
const path = require('path');
const { createRealtimeClient } = require('../public/js/apiClient.js');

const imagePath = path.join(__dirname, 'sample-image.png');

async function main() {
  // Create a dummy image file
  if (!fs.existsSync(imagePath)) {
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = 'black';
    ctx.font = '30px Arial';
    ctx.fillText('Test', 50, 100);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(imagePath, buffer);
  }

  const client = createRealtimeClient();

  client.onStatus(status => {
    console.log(`Connection status: ${status}`);
  });

  client.onError(error => {
    console.error('An error occurred:', error.message);
  });

  client.onMessage(message => {
    console.log('Received message:');
    console.log(JSON.stringify(message, null, 2));
    client.disconnect();
  });

  await client.connect();

  if (client.isConnected()) {
    console.log('CONNECTED via network');
    const imageStream = fs.createReadStream(imagePath);
    client.send(imageStream);
  }
}

main();
