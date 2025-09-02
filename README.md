# 水最美滷味線上下單系統

一個完整的線上滷味訂購系統，包含客戶端下單介面和商家後台管理系統。

## 功能特色

### 客戶端 (luwei-order-main)
- 🛒 線上點餐系統
- 📅 取餐時間選擇
- 💳 會員點數系統（首次下單送5000點）
- 🎁 滿200元可兌換王子麵
- 📱 響應式設計，支援手機版
- 🔍 訂單查詢功能
- 📢 重要公告頁面

### 後台管理 (frontend-dashboard)
- 📊 訂單管理（新進、製作中、待領取、已完成）
- ⏰ 取餐時間排序與倒數提醒
- 🔔 新訂單即時通知（音效+橫幅）
- 📦 商品管理（新增、編輯、刪除、庫存控制）
- 📅 休假日管理
- 👥 會員點數查詢
- 📈 銷售統計
- 🔍 歷史訂單查詢

### 後端 API (backend)
- 🚀 Node.js + Express
- 🔥 Firebase Firestore 資料庫
- 🌐 Cloud Run 部署
- 🔌 WebSocket 即時通知

## 技術架構

- **前端**: Vue.js 3 + Vite
- **後端**: Node.js + Express
- **資料庫**: Firebase Firestore
- **部署**: Firebase Hosting + Google Cloud Run
- **即時通訊**: WebSocket

## 部署網址

- **客戶端**: https://food-ordering-v2-469414.web.app
- **後台管理**: https://food-ordering-v2-469414.web.app/admin/

## 本地開發

### 客戶端
```bash
cd luwei-order-main
npm install
npm run dev
```

### 後台管理
```bash
cd frontend-dashboard
npm install
npm run dev
```

### 後端
```bash
cd backend
npm install
npm start
```

## 部署

### 客戶端和後台
```bash
# 建置客戶端
cd luwei-order-main
npm run build

# 建置後台
cd frontend-dashboard
npm run build

# 複製後台到客戶端目錄
cp -R frontend-dashboard/dist/* luwei-order-main/dist/admin/

# 部署到 Firebase
cd luwei-order-main
firebase deploy --only hosting
```

### 後端
```bash
cd backend
gcloud run deploy line-ordering-backend \
  --source . \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated
```

## 專案結構

```
line-ordering-system/
├── backend/                 # 後端 API
├── frontend-dashboard/      # 後台管理系統
├── luwei-order-main/        # 客戶端下單系統
└── README.md
```
