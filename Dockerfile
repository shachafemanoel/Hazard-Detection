FROM node:18
WORKDIR /app

RUN apt-get update && \
    apt-get install -y python3 make g++ curl && \
    rm -rf /var/lib/apt/lists/*

ENV npm_config_onnxruntime_node_gpu=0
ENV npm_config_onnxruntime_binary_platform=linux-x64
ENV npm_config_build_from_source=true
ENV npm_config_target_arch=x64
ENV npm_config_target_platform=linux
ENV NODE_ENV=production

COPY package*.json ./

RUN npm cache clean --force

# התקנת onnxruntime-node בלי סקריפטים (כדי למנוע טעויות CUDA)
RUN npm install onnxruntime-node@1.22.0 --no-optional --ignore-scripts

# התקנת שאר התלויות ללא סקריפטים
RUN npm install --production --unsafe-perm

COPY public/object_detecion_model/model_18_7.onnx public/object_detecion_model/model_18_7.onnx


COPY . .

EXPOSE 3000
CMD ["npm", "start"]
