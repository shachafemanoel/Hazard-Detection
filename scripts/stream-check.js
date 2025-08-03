const fs = require('fs');
const path = require('path');
const { createRealtimeClient } = require('../public/js/apiClient.js');

const imagePath = path.join(__dirname, 'sample-image.png');

async function main() {
  // Create a dummy image file
  if (!fs.existsSync(imagePath)) {
    fs.writeFileSync(imagePath, 'dummy image data');
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
