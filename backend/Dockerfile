# 使用官方 Node.js 18 的輕量級映像檔作為基礎
FROM node:18-slim

# 在容器內建立一個工作目錄
WORKDIR /usr/src/app

# 複製 package.json 和 package-lock.json
# 這樣做可以利用 Docker 的快取機制，只有在依賴項目變更時才重新安裝
COPY package*.json ./

# 安裝專案依賴
RUN npm install

# 將所有專案檔案複製到工作目錄
COPY . .

# Cloud Run expects the app to listen on $PORT (default 8080)
ENV PORT=8080
EXPOSE 8080

# 容器啟動時執行的指令
CMD ["node", "index.js"]