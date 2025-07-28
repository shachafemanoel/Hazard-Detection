# —— Build stage —— 
FROM node:20-alpine AS builder

WORKDIR /app

# 1) העתק את כל התיקיות
COPY frontend/ ./frontend/
COPY server/   ./server/
COPY api/      ./api/

# 2) התקן תלויות Node ל-Express (server)
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# 3) התקן תלויות Python ל-FastAPI (api)
WORKDIR /app/api
COPY api/requirements.txt ./
RUN apk add --no-cache python3 py3-pip build-base \
  && pip3 install --no-cache-dir -r requirements.txt

# —— Runtime stage —— 
FROM node:20-alpine

WORKDIR /app

# העתק מה-builder
COPY --from=builder /app/server ./server
COPY --from=builder /app/api    ./api
COPY --from=builder /app/frontend ./frontend

# התקן פרוקסי להרצת שני התהליכים יחד
WORKDIR /app/server
RUN npm install --production npm-run-all http-proxy-middleware

# חשוף את פורט Railway יקשיב לו
ENV PORT=3000
EXPOSE 3000

# הרץ במקביל FastAPI על 8001 ו־Express על 3000
CMD ["sh","-c","npm run start:api & npm run start:web"]
