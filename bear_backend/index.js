// printer-bridge/index.js (Final Version with all fixes)
const axios = require('axios');

const API_BASE_URL = "https://line-ordering-backend-199532894970.asia-east1.run.app";
const POLLING_INTERVAL = 10000;

const escpos = require('escpos');
const USB = require('escpos-usb');

function realPrint(receiptText) {
  try {
    const device = new USB(); // 自動尋找第一個 USB 印表機
    device.open(function(error){
      if(error){
        console.error("❌ [錯誤] 無法開啟印表機:", error);
        return;
      }
      const printer = new escpos.Printer(device);

      device.write(Buffer.from('\x1b\x74\x1b', 'binary')); // 選擇字元代碼頁指令

      printer
        .font('a')
        .align('ct')
        .style('bu')
        .size(1, 1)
        .text('水最美-熊哥滷味')
        .text('')
        .align('lt')
        .style('normal')
        .text(receiptText)
        .cut()
        .close();
    });
  } catch(error) {
    console.error("❌ [錯誤] 找不到USB印表機或列印失敗:", error);
  }
}

function formatReceipt(order) {
  let receipt = `      *** 訂單明細 ***\n\n`;
  receipt += `訂單號: #${order.orderNumber}\n`;
  receipt += `客人: ${order.customerName}\n`;
  receipt += `電話: ${order.customerPhone}\n`;
  
  // 正確處理 Firestore Timestamp / ISO 字串 / 數字
  const createdAtDate = normalizeTimestamp(order.createdAt);
  receipt += `時間: ${createdAtDate ? createdAtDate.toLocaleString('sv-SE') : '-'}\n`;
  
  receipt += `====================\n`;
  
  order.items.forEach(item => {
    // 考慮中文字元寬度，稍微調整對齊
    const name = item.name.padEnd(10, ' ');
    const quantity = `x ${item.quantity}`;
    receipt += `${name}${quantity}\n`;
  });
  
  receipt += `====================\n`;
  
  if (order.notes) {
    receipt += `備註: ${order.notes}\n\n`;
  }
  
  receipt += `總金額: $${order.totalPrice}\n\n`;
  
  return receipt;
}

function normalizeTimestamp(ts) {
  if (!ts) return undefined;
  if (typeof ts === 'object') {
    if (typeof ts.toDate === 'function') {
      try { return ts.toDate(); } catch (_) {}
    }
    if (typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000);
    }
    if (typeof ts._seconds === 'number') {
      return new Date(ts._seconds * 1000);
    }
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

async function markOrderAsPrinted(orderId) {
  try {
    await axios.post(`${API_BASE_URL}/api/orders/${orderId}/mark-as-printed`);
    console.log(`[成功] 已將訂單 ${orderId} 標記為已列印。`);
  } catch (error) {
    console.error(`[失敗] 無法將訂單 ${orderId} 標記為已列印:`, error.message);
  }
}

async function checkAndPrintOrders() {
  console.log(`[檢查中...] 於 ${new Date().toLocaleTimeString()} 檢查待列印訂單...`);
  try {
    const response = await axios.get(`${API_BASE_URL}/api/orders/pending-print`);
    const ordersToPrint = response.data;

    if (ordersToPrint.length === 0) {
      console.log("[閒置中] 沒有需要列印的新訂單。");
      return;
    }

    console.log(`[發現] 找到 ${ordersToPrint.length} 筆新訂單！準備列印...`);

    for (const order of ordersToPrint) {
      const receiptText = formatReceipt(order);
      realPrint(receiptText);
      await markOrderAsPrinted(order.id);
      await new Promise(resolve => setTimeout(resolve, 1000)); 
    }

  } catch (error) {
    console.error("[錯誤] 檢查訂單時發生錯誤:", error.message);
  }
}

console.log("✅ 出單機橋接程式已啟動。");
console.log(`每 ${POLLING_INTERVAL / 1000} 秒會自動檢查一次新訂單。`);
checkAndPrintOrders();
setInterval(checkAndPrintOrders, POLLING_INTERVAL);