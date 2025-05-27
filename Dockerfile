FROM node:18
WORKDIR /app

# build tools for native deps
RUN apt-get update && \
    apt-get install -y python3 make g++ curl && \
    rm -rf /var/lib/apt/lists/*

# הגדרת משתני סביבה לonnxruntime
ENV npm_config_onnxruntime_binary_platform=linux-x64
ENV npm_config_build_from_source=true
ENV npm_config_target_arch=x64
ENV npm_config_target_platform=linux
ENV NODE_ENV=production
ENV npm_config_onnxruntime_node_gpu=0

# התקנת תלויות
COPY package*.json ./
RUN npm cache clean --force && \
    npm install --no-optional --production --unsafe-perm

# העתקת המודל
COPY public/object_detecion_model/road_damage_detection_last_version.onnx \
     public/object_detecion_model/road_damage_detection_last_version.onnx

# שאר הקוד
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
