// server.js - Corrected and Enhanced

var http = require('http');
var static = require('node-static');

// 1. Create a dedicated options object for the server.
var options = {
    // 2. Define custom MIME types to support modern web assets.
    mimetypes: {
        'mjs': 'application/javascript', // CRITICAL: For ES Modules
        'wasm': 'application/wasm',       // CRITICAL: For WebAssembly
        'onnx': 'application/octet-stream' // For serving the ML model file
    }
};

// 3. Create a new file server instance, passing the custom options.
var fileServer = new static.Server('./public', options);

// 4. Create the main HTTP server.
http.createServer(function (request, response) {
    request.addListener('end', function () {
        // Serve the file using the configured server.
        // The enhanced callback handles errors gracefully.
        fileServer.serve(request, response, function (err, result) {
            if (err) { // If an error occurs (e.g., file not found)
                console.error("Error serving " + request.url + " - " + err.message);

                // Respond to the client with the error status and headers.
                response.writeHead(err.status, err.headers);
                response.end();
            }
        });
    }).resume();
}).listen(8000);

console.log('✅ Server running with custom MIME types at http://localhost:8000/');
