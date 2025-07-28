FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY web/package.json ./
RUN npm install --omit=dev

# Copy application code and static assets
COPY server/ ./
COPY public/ ./public/

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]