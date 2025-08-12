# --- Base Stage ---
# Use an official Node.js 18 runtime as a parent image
FROM node:18-slim AS base

# Set the working directory in the container
WORKDIR /app

# --- Dependencies Stage ---
# Copy package.json and package-lock.json to leverage Docker cache
FROM base AS dependencies
WORKDIR /app
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# --- Production Stage ---
# Copy dependencies from the previous stage and the rest of the app
FROM base AS production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# The application listens on port 3000
EXPOSE 3000

# The command to run the application
CMD ["node", "server.js"]