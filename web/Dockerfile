FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY web/package.json ./
RUN npm install --omit=dev

# Copy application code and static assets
COPY server/ ./
COPY public/ ./public/

# Set environment variables (Railway will override PORT)
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "routes/server.js"]