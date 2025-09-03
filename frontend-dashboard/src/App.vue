<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';

const newOrders = ref([]);
const inProgressOrders = ref([]);
const completedOrders = ref([]);
const archivedOrders = ref([]);
const countdownTick = ref(0);
let tickTimer;
function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
const rangeStart = ref(''); // YYYY-MM-DD
const rangeEnd = ref('');   // YYYY-MM-DD
const phoneQuery = ref('');
const phoneOrders = ref([]);
const isLoadingPhoneOrders = ref(false);
const phoneQueryError = ref('');
const activeTab = ref('orders'); // 'orders' | 'products' | 'holidays' | 'statistics' | 'customer' | 'orderQuery'
const isLoadingArchived = ref(false);
// 非阻塞提醒：顯示一個可關閉的橫幅，累計新訂單數
const newOrderBatchCount = ref(0);
const showNewOrderBanner = ref(false);
// 去重：避免同一張訂單被重複加入
const knownOrderIds = new Set();

// Holidays state
const holidays = ref([]);
const holiYear = ref(new Date().getFullYear());
const holiMonth = ref(new Date().getMonth() + 1); // 1-12
const newHolidayDate = ref(''); // YYYY-MM-DD
const newHolidayNote = ref('');

function ymPrefix(y, m) {
  return `${y}-${String(m).padStart(2, '0')}-`;
}

async function fetchHolidays() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/holidays?year=${holiYear.value}&month=${holiMonth.value}`);
    if (!res.ok) throw new Error('holidays fetch failed');
    holidays.value = await res.json();
  } catch (e) {
    console.error('載入休假日失敗', e);
    holidays.value = [];
  }
}

async function addHoliday() {
  if (!newHolidayDate.value || !/^\d{4}-\d{2}-\d{2}$/.test(newHolidayDate.value)) {
    alert('請輸入正確日期（YYYY-MM-DD）');
    return;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/holidays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newHolidayDate.value, note: newHolidayNote.value.trim() })
    });
    if (!res.ok) throw new Error('add failed');
    newHolidayDate.value = '';
    newHolidayNote.value = '';
    await fetchHolidays();
  } catch (e) {
    console.error('新增休假日失敗', e);
    alert('新增休假日失敗');
  }
}

async function deleteHoliday(h) {
  if (!h.id || h.kind !== 'extra') return; // weekly 不可刪
  if (!confirm(`確定刪除加休 ${h.date}${h.note ? `（${h.note}）` : ''}？`)) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/holidays/${h.id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    await fetchHolidays();
  } catch (e) {
    console.error('刪除休假日失敗', e);
    alert('刪除休假日失敗');
  }
}

// 新增：載入所有現有訂單
async function loadAllOrders() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/orders`);
    if (!response.ok) throw new Error('Failed to fetch orders');
    const orders = await response.json();
    
    // 清空現有訂單與已知訂單集合
    newOrders.value = [];
    inProgressOrders.value = [];
    completedOrders.value = [];
    knownOrderIds.clear(); // 重新初始化已知訂單集合
    
    // 根據狀態分類訂單
    orders.forEach(order => {
      order.createdAt = normalizeTimestamp(order.createdAt) || new Date();
      knownOrderIds.add(order.id); // 標記為已知訂單
      
      switch (order.status) {
        case 'PENDING':
          newOrders.value.push(order);
          break;
        case 'IN_PROGRESS':
          inProgressOrders.value.push(order);
          break;
        case 'COMPLETED':
          completedOrders.value.push(order);
          break;
      }
    });
    
    console.log(`載入了 ${orders.length} 筆訂單`);
  } catch (error) {
    console.error('載入訂單失敗:', error);
  }
}

// 音效：使用 Web Audio API 在新訂單時提示一聲
const audioContext = ref(null);
function initAudio() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  if (!audioContext.value) {
    audioContext.value = new Ctor();
  }
  if (audioContext.value && audioContext.value.state === 'suspended') {
    audioContext.value.resume();
  }
}
function playNewOrderSound() {
  try {
    initAudio();
    const ctx = audioContext.value;
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5 tone
    const t = ctx.currentTime;
    // Attack
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
    // Sustain
    gain.gain.setValueAtTime(0.1, t + 0.9);
    // Release
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(t + 1.2);
  } catch (e) {
    console.warn('播放新訂單音效失敗:', e);
  }
}

// 將各種型態的 Firestore/字串/數字時間戳轉為 Date；無法解析則回傳 undefined
function normalizeTimestamp(ts) {
  if (!ts) return undefined;
  // Firestore Timestamp 可能為 { seconds, nanoseconds } 或 {_seconds, _nanoseconds} 或有 toDate()
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

// 解析備註中的「預計 HH:MM 領取」，並回傳時間與其下一次發生的 Date
function parsePickupFromNotes(notes) {
  if (!notes) return null;
  const m = String(notes).match(/預計\s*(\d{1,2}:\d{2})\s*領取/);
  if (!m) return null;
  const timeStr = m[1];
  const [hStr, minStr] = timeStr.split(':');
  const now = new Date();
  const dt = new Date(now);
  dt.setSeconds(0, 0);
  dt.setHours(parseInt(hStr, 10), parseInt(minStr, 10));
  if (dt.getTime() < now.getTime()) {
    // 若時間已過，視為明天同一時間
    dt.setDate(dt.getDate() + 1);
  }
  return { timeStr, date: dt };
}

function minutesUntil(date) {
  if (!date) return Infinity;
  return Math.round((date.getTime() - Date.now()) / 60000);
}

function pickupInfo(order) {
  // 讀取心跳，讓組件每 30 秒重算一次倒數
  const _tick = countdownTick.value; // eslint-disable-line no-unused-vars
  const parsed = parsePickupFromNotes(order.notes);
  if (!parsed) return null;
  const mins = minutesUntil(parsed.date);
  const className = mins <= 30 ? 'pickup-soon' : 'pickup-later';
  return { time: parsed.timeStr, className, mins };
}

function restNotes(notes) {
  if (!notes) return '';
  // 去掉「預計 HH:MM 領取」與前後分隔符號
  return String(notes).replace(/\s*\|\s*/g, ' | ').replace(/預計\s*\d{1,2}:\d{2}\s*領取\s*\|?\s*/,'').trim();
}

function compareByPickup(a, b) {
  const ap = parsePickupFromNotes(a.notes);
  const bp = parsePickupFromNotes(b.notes);
  const aTime = ap ? ap.date.getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : Infinity);
  const bTime = bp ? bp.date.getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : Infinity);
  return aTime - bTime;
}

const sortedNewOrders = computed(() => [...newOrders.value].sort(compareByPickup));
const sortedInProgress = computed(() => [...inProgressOrders.value].sort(compareByPickup));
const sortedCompleted = computed(() => [...completedOrders.value].sort(compareByPickup));

const API_BASE_URL = "https://line-ordering-backend-199532894970.asia-east1.run.app";
const WSS_URL = "wss://line-ordering-backend-199532894970.asia-east1.run.app";

onMounted(() => {
  // 載入所有現有訂單
  loadAllOrders();
  // 預設日期區間：今天往前推 30 天
  if (!rangeEnd.value) rangeEnd.value = toYMD(new Date());
  if (!rangeStart.value) rangeStart.value = toYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  // 啟動心跳：每 30 秒觸發一次，讓倒數分鐘自動更新
  tickTimer = setInterval(() => { countdownTick.value++; }, 30000);
  
  // 音效解鎖（需要用戶互動）
  document.addEventListener('click', initAudio, { once: true });
  
  // 全域按鈕點擊監聽器：隱藏新訂單橫幅
  document.addEventListener('click', () => {
    if (showNewOrderBanner.value) {
      showNewOrderBanner.value = false;
      newOrderBatchCount.value = 0;
    }
  });

  const connectWebSocket = () => {
    const ws = new WebSocket(WSS_URL);
    ws.onopen = () => console.log("✅ WebSocket 連線成功！");

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'new_order') {
        const order = message.payload;
        order.createdAt = normalizeTimestamp(order.createdAt) || new Date();
        // 只在未出現過時才加入清單，並更新非阻塞提醒計數
        if (!knownOrderIds.has(order.id)) {
          knownOrderIds.add(order.id);
          newOrders.value.unshift(order);
          newOrderBatchCount.value += 1;
          showNewOrderBanner.value = true;
          playNewOrderSound();
        }
      }
    };

    ws.onclose = () => {
      console.log("❌ WebSocket 連線已關閉，準備在 3 秒後重連...");
      setTimeout(connectWebSocket, 3000);
    };
    ws.onerror = (error) => {
      console.error("WebSocket 發生錯誤:", error);
      ws.close();
    };
  }
  connectWebSocket();

  onBeforeUnmount(() => {
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
    document.removeEventListener('click', onAnyButtonClick, true);
    if (tickTimer) clearInterval(tickTimer);
  });
});

// 顯示於同一清單：若有電話查詢結果則優先顯示，否則顯示日期查詢結果
const displayedOrders = computed(() => {
  return (phoneQuery.value && phoneOrders.value.length >= 0)
    ? phoneOrders.value
    : archivedOrders.value;
});

// ... (其他所有函數 acceptOrder, completeOrder 等都保持不變)
async function acceptOrder(order) { await updateOrderStatus(order, 'IN_PROGRESS', newOrders, inProgressOrders); }
async function completeOrder(order) { await updateOrderStatus(order, 'COMPLETED', inProgressOrders, completedOrders); }
async function archiveOrder(orderToArchive) { await updateOrderStatus(orderToArchive, 'ARCHIVED', completedOrders, archivedOrders, false); }
async function fetchArchivedOrders() {
  isLoadingArchived.value = true;
  archivedOrders.value = [];
  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/archived`);
    if (!response.ok) throw new Error('Failed to fetch archived orders');
    const data = await response.json();
    let list = data.map(order => ({
      ...order,
      createdAt: normalizeTimestamp(order.createdAt)
    }));
    // Client-side date range filter
    if (rangeStart.value) {
      const startMs = new Date(`${rangeStart.value}T00:00:00`).getTime();
      list = list.filter(o => o.createdAt && o.createdAt.getTime() >= startMs);
    }
    if (rangeEnd.value) {
      const endMs = new Date(`${rangeEnd.value}T23:59:59`).getTime();
      list = list.filter(o => o.createdAt && o.createdAt.getTime() <= endMs);
    }
    archivedOrders.value = list;
  } catch (error) {
    console.error("查詢歷史訂單失敗:", error);
    alert('查詢歷史訂單失敗！');
  } finally {
    isLoadingArchived.value = false;
  }
}

// 依電話查詢歷史訂單（使用管理端 API，包含 ARCHIVED），並套用日期區間
async function fetchOrdersByPhone() {
  const raw = (phoneQuery.value || '').trim();
  if (!raw) { phoneOrders.value = []; phoneQueryError.value=''; return; }
  isLoadingPhoneOrders.value = true;
  phoneQueryError.value = '';
  phoneOrders.value = [];
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/orders`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let list = (data || []).map(o => ({ ...o, createdAt: normalizeTimestamp(o.createdAt) || undefined }));
    // 日期區間
    if (rangeStart.value) {
      const startMs = new Date(`${rangeStart.value}T00:00:00`).getTime();
      list = list.filter(o => o.createdAt && o.createdAt.getTime() >= startMs);
    }
    if (rangeEnd.value) {
      const endMs = new Date(`${rangeEnd.value}T23:59:59`).getTime();
      list = list.filter(o => o.createdAt && o.createdAt.getTime() <= endMs);
    }
    list = list.filter(o => o.status === 'ARCHIVED');
    const q = raw.replace(/\s+/g, '');
    phoneOrders.value = list.filter(o => String(o.customerPhone || '').replace(/\s+/g, '').includes(q));
    if (phoneOrders.value.length === 0) {
      alert('歐歐找不到訂單，請稍後再試');
    }
  } catch (e) {
    console.error('依電話查詢訂單失敗', e);
    phoneQueryError.value = '歐歐找不到訂單，請稍後再試';
  } finally {
    isLoadingPhoneOrders.value = false;
  }
}
async function updateOrderStatus(order, newStatus, fromArray, toArray, addToUi = true) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) throw new Error(`更新訂單狀態失敗`);
    fromArray.value = fromArray.value.filter(o => o.id !== order.id);
    if (addToUi) {
        order.status = newStatus;
        toArray.value.unshift(order);
    }
  } catch (error) {
    console.error(`更新訂單至 ${newStatus} 時發生錯誤:`, error);
    alert(`無法更新訂單`);
  }
}

// 批次操作：全部同意（將整欄位的訂單一次移到下一狀態）
async function acceptAllNewOrders() {
  const snapshot = [...newOrders.value];
  for (const order of snapshot) {
    await updateOrderStatus(order, 'IN_PROGRESS', newOrders, inProgressOrders);
  }
}

async function completeAllInProgress() {
  const snapshot = [...inProgressOrders.value];
  for (const order of snapshot) {
    await updateOrderStatus(order, 'COMPLETED', inProgressOrders, completedOrders);
  }
}

async function archiveAllCompleted() {
  const snapshot = [...completedOrders.value];
  for (const order of snapshot) {
    await updateOrderStatus(order, 'ARCHIVED', completedOrders, archivedOrders, false);
  }
}

// 產品管理
const products = ref([]);
const productSearch = ref('');
const confirmDeleteId = ref(null);
const newProductName = ref('');
const newProductPrice = ref('');
async function fetchAllProducts() {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/admin/products`);
    if (!resp.ok) throw new Error('fetch products failed');
    products.value = await resp.json();
  } catch (e) {
    console.error('載入產品失敗', e);
    alert('載入產品失敗');
  }
}
async function createProduct() {
  const name = newProductName.value.trim();
  const price = Number(newProductPrice.value);
  if (!name) { alert('請輸入商品名稱'); return; }
  if (!Number.isFinite(price) || price < 0) { alert('請輸入正確價格'); return; }
  try {
    const resp = await fetch(`${API_BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price, isAvailable: true })
    });
    if (!resp.ok) throw new Error('create product failed');
    const created = await resp.json();
    products.value.unshift({ id: created.id, name, price, isAvailable: true });
    newProductName.value = '';
    newProductPrice.value = '';
  } catch (e) {
    console.error('新增商品失敗', e);
    alert('新增商品失敗');
  }
}
async function toggleProductAvailability(p) {
  const prev = p.isAvailable;
  p.isAvailable = !prev; // optimistic
  try {
    const resp = await fetch(`${API_BASE_URL}/api/products/${p.id}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: p.isAvailable })
    });
    if (!resp.ok) throw new Error('update availability failed');
  } catch (e) {
    p.isAvailable = prev; // rollback
    console.error('更新商品狀態失敗', e);
    alert('更新商品狀態失敗');
  }
}

async function deleteProduct(p) {
  if (!confirm(`確定刪除商品「${p.name}」？此動作無法還原。`)) return;
  const prev = [...products.value];
  products.value = products.value.filter(x => x.id !== p.id);
  try {
    const resp = await fetch(`${API_BASE_URL}/api/admin/products/${p.id}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('delete failed');
  } catch (e) {
    console.error('刪除商品失敗', e);
    alert('刪除商品失敗');
    products.value = prev; // rollback
  }
}

const filteredProducts = computed(() => {
  const q = productSearch.value.trim().toLowerCase();
  if (!q) return products.value;
  return products.value.filter(p => String(p.name).toLowerCase().includes(q));
});

function requestDelete(p) {
  if (confirmDeleteId.value !== p.id) {
    confirmDeleteId.value = p.id;
    setTimeout(() => { if (confirmDeleteId.value === p.id) confirmDeleteId.value = null; }, 4000);
    return;
  }
  deleteProduct(p);
  confirmDeleteId.value = null;
}

function cancelDeletePrompt() {
  confirmDeleteId.value = null;
}

// Member points lookup
const mpPhone = ref('');
const mpPoints = ref(null);
const mpLoading = ref(false);
const showArchivedModal = ref(false);
const selectedArchivedOrder = ref(null);

// Product Statistics
const productStats = ref([]);
const isLoadingStats = ref(false);

function getLocalYMD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

const statsRangeText = computed(() => {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return `${getLocalYMD(start)} – ${getLocalYMD(now)}`;
});

async function fetchProductStats() {
  isLoadingStats.value = true;
  productStats.value = [];
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/product-stats`);
    if (!response.ok) throw new Error('Failed to fetch product stats');
    const data = await response.json();
    productStats.value = data;
  } catch (e) {
    console.error('載入產品統計失敗', e);
    alert('載入產品統計失敗');
  } finally {
    isLoadingStats.value = false;
  }
}

function showArchivedOrderDetails(order) {
  selectedArchivedOrder.value = null;
  showArchivedModal.value = true;
  // Fetch full details
  fetch(`${API_BASE_URL}/api/admin/orders/${order.id}`)
    .then(res => res.json())
    .then(data => {
      // Normalize createdAt
      data.createdAt = normalizeTimestamp(data.createdAt) || new Date();
      selectedArchivedOrder.value = data;
    })
    .catch(err => {
      console.error('載入訂單詳情失敗', err);
      // Fallback to existing order data
      selectedArchivedOrder.value = order;
    });
}

function closeArchivedModal() {
  showArchivedModal.value = false;
  selectedArchivedOrder.value = null;
}

async function lookupMemberPoints() {
  const raw = (mpPhone.value || '').trim();
  if (!raw) { mpPoints.value = null; return; }
  // Normalize phone: keep digits and plus sign only
  const phone = raw.replace(/[^\d+]/g, '');
  mpLoading.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(phone)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    mpPoints.value = Number(data.points) || 0;
  } catch (e) {
    console.error('查詢點數失敗', e);
    mpPoints.value = null;
    alert('查詢點數失敗，請稍後再試');
  } finally {
    mpLoading.value = false;
  }
}
</script>

<template>
  <div class="dashboard-container">
    <header class="dashboard-header">
      <h1>水最美 - 熊哥滷味管理後台</h1>
      <div class="tab-buttons">
        <button @click="activeTab = 'orders'" :class="{ active: activeTab === 'orders' }">訂單</button>
        <button @click="activeTab='products'; fetchAllProducts()" :class="{ active: activeTab === 'products' }">商品</button>
        <button @click="activeTab = 'holidays'" :class="{ active: activeTab === 'holidays' }">休假日</button>
        <button @click="activeTab='statistics'; fetchProductStats()" :class="{ active: activeTab === 'statistics' }">商品統計</button>
        <button @click="activeTab='customer'" :class="{ active: activeTab === 'customer' }">點數查詢</button>
        <button @click="activeTab='orderQuery'" :class="{ active: activeTab === 'orderQuery' }">歷史訂單查詢</button>
      </div>
    </header>

    <div v-if="showNewOrderBanner" class="toast-banner">
      <span>🔔 有 {{ newOrderBatchCount }} 筆新訂單</span>
      <button class="toast-close" @click="showNewOrderBanner = false; newOrderBatchCount = 0;">關閉</button>
    </div>

    <main v-if="activeTab==='orders'" class="kanban-board">
      <div class="column">
        <h2 class="column-title">新進訂單 ({{ newOrders.length }})
          <button class="batch-btn" @click="acceptAllNewOrders">全部接受</button>
        </h2>
        <div class="order-list">
                      <div v-for="order in sortedNewOrders" :key="order.id" class="order-card">
              <h3>訂單 #{{ order.orderNumber }}</h3>
              <p><strong>客人:</strong> {{ order.customerName }} {{ order.customerPhone }}</p>
              <p v-if="order.createdAt"><strong>時間:</strong> {{ order.createdAt.toLocaleString('sv-SE') }}</p>
              <p><strong>總金額:</strong> ${{ order.totalPrice }}</p>
            <ul><li v-for="(item, index) in order.items" :key="index">{{ item.name }} x {{ item.quantity }}</li></ul>
            <div v-if="order.notes" class="notes-section">
              <p>
                <span v-if="pickupInfo(order)" :class="pickupInfo(order).className">預計 {{ pickupInfo(order).time }} 領取（{{ pickupInfo(order).mins }} 分）</span>
                <span v-if="pickupInfo(order) && restNotes(order.notes)"> | </span>
                <span v-if="restNotes(order.notes)">{{ restNotes(order.notes) }}</span>
              </p>
            </div>
            <div class="actions"><button class="accept-btn" @click="acceptOrder(order)">接受訂單</button></div>
          </div>
        </div>
      </div>
      <div class="column">
        <h2 class="column-title">製作中 ({{ inProgressOrders.length }})
          <button class="batch-btn" @click="completeAllInProgress">全部完成</button>
        </h2>
        <div class="order-list">
                      <div v-for="order in sortedInProgress" :key="order.id" class="order-card">
              <h3>訂單 #{{ order.orderNumber }}</h3>
              <p><strong>客人:</strong> {{ order.customerName }} {{ order.customerPhone }}</p>
              <p v-if="order.createdAt"><strong>時間:</strong> {{ order.createdAt.toLocaleString('sv-SE') }}</p>
              <p><strong>總金額:</strong> ${{ order.totalPrice }}</p>
            <ul><li v-for="(item, index) in order.items" :key="index">{{ item.name }} x {{ item.quantity }}</li></ul>
            <div v-if="order.notes" class="notes-section">
              <p>
                <span v-if="pickupInfo(order)" :class="pickupInfo(order).className">預計 {{ pickupInfo(order).time }} 領取（{{ pickupInfo(order).mins }} 分）</span>
                <span v-if="pickupInfo(order) && restNotes(order.notes)"> | </span>
                <span v-if="restNotes(order.notes)">{{ restNotes(order.notes) }}</span>
              </p>
            </div>
            <div class="actions"><button class="complete-btn" @click="completeOrder(order)">完成製作</button></div>
          </div>
        </div>
      </div>
      <div class="column">
        <h2 class="column-title">待領取 ({{ completedOrders.length }})
          <button class="batch-btn" @click="archiveAllCompleted">全部領取</button>
        </h2>
        <div class="order-list">
                       <div v-for="order in sortedCompleted" :key="order.id" class="order-card">
              <h3>訂單 #{{ order.orderNumber }}</h3>
              <p><strong>客人:</strong> {{ order.customerName }} {{ order.customerPhone }}</p>
              <p v-if="order.createdAt"><strong>時間:</strong> {{ order.createdAt.toLocaleString('sv-SE') }}</p>
              <p><strong>總金額:</strong> ${{ order.totalPrice }}</p>
            <ul><li v-for="(item, index) in order.items" :key="index">{{ item.name }} x {{ item.quantity }}</li></ul>
            <div v-if="order.notes" class="notes-section">
              <p>
                <span v-if="pickupInfo(order)" :class="pickupInfo(order).className">預計 {{ pickupInfo(order).time }} 領取（{{ pickupInfo(order).mins }} 分）</span>
                <span v-if="pickupInfo(order) && restNotes(order.notes)"> | </span>
                <span v-if="restNotes(order.notes)">{{ restNotes(order.notes) }}</span>
              </p>
            </div>
            <div class="actions"><button class="archive-btn" @click="archiveOrder(order)">客人已領取</button></div>
          </div>
        </div>
      </div>
    </main>

    <main v-else-if="activeTab==='products'" class="products-board">
      <div class="products-header">
        <h2>商品管理</h2>
        <div class="product-create">
          <input placeholder="商品名稱" v-model="newProductName" />
          <input type="number" min="0" step="1" placeholder="價格" v-model="newProductPrice" />
          <button @click="createProduct">新增商品</button>
        </div>
      </div>
      <div class="product-search">
        <input placeholder="搜尋食材/商品" v-model="productSearch" />
      </div>
      <div class="products-list">
        <div v-for="p in filteredProducts" :key="p.id" class="product-row">
          <div class="product-name">{{ p.name }}</div>
          <div class="product-price">${{ p.price }}</div>
          <div class="product-availability">
            <label>
              <input type="checkbox" :checked="p.isAvailable" @change="toggleProductAvailability(p)" /> 可售
            </label>
            <span :class="p.isAvailable ? 'avail-on' : 'avail-off'">{{ p.isAvailable ? '上架中' : '售完/關閉' }}</span>
            <div class="row-actions">
              <button v-if="confirmDeleteId!==p.id" class="ghost-btn" title="更多" @click="requestDelete(p)">刪除</button>
              <div v-else class="confirm-delete">
                <button class="ghost-btn" @click="cancelDeletePrompt">取消</button>
                <button class="danger-btn" @click="requestDelete(p)">確認刪除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <main v-else-if="activeTab==='holidays'" class="holidays-board">
      <div class="holi-controls">
        <div>
          年份
          <input type="number" v-model.number="holiYear" min="2020" max="2100" style="width: 6rem" />
          月份
          <input type="number" v-model.number="holiMonth" min="1" max="12" style="width: 4rem" />
          <button @click="fetchHolidays">重新載入</button>
        </div>
        <div class="holi-add">
          <input type="date" v-model="newHolidayDate" />
          <input type="text" v-model="newHolidayNote" placeholder="說明（選填）" />
          <button @click="addHoliday">新增加休</button>
        </div>
      </div>
      <div class="holi-list">
        <div v-if="holidays.length === 0">本月尚無休假資訊</div>
        <div v-for="h in holidays" :key="h.date + (h.id || '')" class="holi-row" :class="h.kind">
          <div class="date">{{ h.date }}</div>
          <div class="kind">{{ h.kind==='weekly' ? '固定：每週一' : '加休' }}</div>
          <div class="note">{{ h.note || '' }}</div>
          <div class="ops">
            <button v-if="h.kind==='extra'" @click="deleteHoliday(h)">刪除</button>
          </div>
        </div>
      </div>
    </main>
    <main v-else-if="activeTab==='statistics'" class="statistics-board">
      <h2>商品銷售統計（{{ statsRangeText }}）</h2>
      <div class="stats-controls">
        <button @click="fetchProductStats" :disabled="isLoadingStats">
          {{ isLoadingStats ? '載入中...' : '重新整理統計' }}
        </button>
      </div>
      <div v-if="productStats.length > 0" class="stats-table">
        <div class="stats-header">
          <span class="rank">排名</span>
          <span class="product-name">商品名稱</span>
          <span class="quantity">銷售數量</span>
          <span class="revenue">銷售金額</span>
          <span class="percentage">佔比</span>
        </div>
        <div v-for="(stat, index) in productStats" :key="stat.productId" class="stats-row" :class="{ 'top-3': index < 3 }">
          <span class="rank">{{ index + 1 }}</span>
          <span class="product-name">{{ stat.productName }}</span>
          <span class="quantity">{{ stat.totalQuantity }}</span>
          <span class="revenue">${{ stat.totalRevenue.toFixed(2) }}</span>
          <span class="percentage">{{ stat.percentage.toFixed(1) }}%</span>
        </div>
      </div>
      <div v-else-if="!isLoadingStats" class="no-stats">
        <p>尚無銷售資料</p>
      </div>
    </main>

    <main v-else-if="activeTab==='customer'" class="customer-board">
      <h2>點數查詢</h2>
      <div class="mp-lookup">
        <input placeholder="輸入電話查詢點數" v-model="mpPhone" @keyup.enter="lookupMemberPoints" />
        <button @click="lookupMemberPoints">查詢點數</button>
        <span class="mp-result" aria-live="polite">
          <template v-if="mpLoading">讀取中...</template>
          <template v-else-if="mpPoints!==null">剩餘點數：{{ mpPoints }}</template>
        </span>
      </div>
    </main>

    <main v-else-if="activeTab==='orderQuery'" class="order-query-board">
      <div class="date-range-controls">
        <label>起始日
          <input type="date" v-model="rangeStart" />
        </label>
        <label>結束日
          <input type="date" v-model="rangeEnd" />
        </label>
        <button @click="fetchArchivedOrders" :disabled="isLoadingArchived">{{ isLoadingArchived ? '讀取中...' : '查詢訂單' }}</button>
      </div>
      <div class="phone-query">
        <input placeholder="輸入電話查詢訂單（排除已完成）" v-model="phoneQuery" @keyup.enter="fetchOrdersByPhone" />
        <button @click="fetchOrdersByPhone" :disabled="isLoadingPhoneOrders">{{ isLoadingPhoneOrders ? '查詢中...' : '電話查詢' }}</button>
        <span class="error" v-if="phoneQueryError">{{ phoneQueryError }}</span>
      </div>
      <div class="archive-list">
        <div v-if="displayedOrders.length === 0 && !isLoadingArchived && !isLoadingPhoneOrders">沒有紀錄</div>
        <div v-if="displayedOrders.length > 0" class="archived-orders">
          <div v-for="order in displayedOrders" :key="order.id" class="archived-order" @click="showArchivedOrderDetails(order)">
            <strong>訂單 #{{ order.orderNumber }}</strong> - {{ order.customerName }} ({{ order.customerPhone }}) - {{ order.createdAt ? order.createdAt.toLocaleString('sv-SE') : '' }} - 狀態：{{ order.status }}
          </div>
        </div>
      </div>
    </main>

    <!-- Archived Order Details Modal -->
    <div v-if="showArchivedModal" class="modal-overlay" @click="closeArchivedModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>訂單詳情 #{{ selectedArchivedOrder?.orderNumber }}</h3>
          <button class="close-btn" @click="closeArchivedModal">&times;</button>
        </div>
        <div class="modal-body" v-if="selectedArchivedOrder">
          <div class="order-info">
            <p><strong>客人:</strong> {{ selectedArchivedOrder.customerName }} ({{ selectedArchivedOrder.customerPhone }})</p>
            <p><strong>時間:</strong> {{ selectedArchivedOrder.createdAt.toLocaleString('sv-SE') }}</p>
            <p><strong>總金額:</strong> ${{ selectedArchivedOrder.totalPrice }}</p>
            <p><strong>狀態:</strong> {{ selectedArchivedOrder.status }}</p>
          </div>
          <div class="products-list">
            <h4>購買產品:</h4>
            <ul>
              <li v-for="(item, index) in selectedArchivedOrder.items" :key="index">
                {{ item.name }} × {{ item.quantity }} = ${{ (item.pricePerItem * item.quantity).toFixed(2) }}
              </li>
            </ul>
          </div>
          <div v-if="selectedArchivedOrder.notes" class="notes-section">
            <h4>備註:</h4>
            <p>{{ selectedArchivedOrder.notes }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
html, body { margin: 0; padding: 0; font-family: sans-serif; background-color: #202124; color: #e8eaed; }
.dashboard-container { max-width: 1200px; margin: 0 auto; padding: 1rem; padding-top: 140px; }
.dashboard-header { 
  background: #202124; 
  padding: 1.5rem; 
  border-radius: 8px; 
  margin-bottom: 2rem; 
  text-align: center;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  box-shadow: 0 2px 6px rgba(0,0,0,0.35);
}
.dashboard-header h1 { 
  margin: 0 0 1.5rem 0; 
  color: #8ab4f8; 
  font-size: 2rem;
}
.tab-buttons { 
  display: flex; 
  gap: 0.5rem; 
  justify-content: center; 
  flex-wrap: wrap;
}
.tab-buttons button { 
  background: #3c4043; 
  color: #e8eaed; 
  border: 1px solid #5f6368; 
  padding: 0.75rem 1.5rem; 
  border-radius: 6px; 
  cursor: pointer; 
  font-size: 1rem;
  transition: all 0.2s;
}
.tab-buttons button:hover { 
  background: #5f6368; 
  border-color: #8ab4f8;
}
.tab-buttons button.active { 
  background: #8ab4f8; 
  color: #202124; 
  border-color: #8ab4f8;
}
.kanban-board { display: flex; flex-direction: row; flex-grow: 1; padding: 1rem; gap: 1rem; overflow-x: auto; min-height: 100vh; }
.column { flex: 0 0 320px; background-color: #282a2d; border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; }
.column-title { flex-shrink: 0; margin-top: 0; color: #e8eaed; padding-bottom: 0.5rem; border-bottom: 2px solid #5f6368; }
.order-list { flex-grow: 1; overflow-y: auto; }
.order-card { background-color: #3c4043; color: #e8eaed; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; border: 1px solid #5f6368; }
.order-card h3 { margin-top: 0; color: #8ab4f8; }
.order-card ul { padding-left: 1.2rem; margin-bottom: 1rem; }
.notes-section { margin-top: 1rem; padding: 0.75rem; background-color: rgba(255, 251, 230, 0.1); border-left: 4px solid #f9bf2d; border-radius: 4px; }
.notes-section p { margin-top: 0.25rem; margin-bottom: 0; white-space: pre-wrap; }
.pickup-time { color: #ff4d4f; font-weight: 600; }
.pickup-soon { color: #ff4d4f; font-weight: 600; }
.pickup-later { color: #60a5fa; font-weight: 600; }
.actions button { width: 100%; padding: 0.75rem; border: none; border-radius: 4px; color: white; font-size: 1rem; cursor: pointer; }
.accept-btn { background-color: #34a853; }
.complete-btn { background-color: #4285f4; }
.archive-btn { background-color: #5f6368; }
.batch-btn { margin-left: 0.5rem; padding: 0.25rem 0.5rem; font-size: 0.85rem; background-color: #5f6368; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.toast-banner { position: sticky; top: 0; z-index: 1000; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 1rem; background-color: #1e3a8a; color: #fff; }
.toast-close { background: transparent; border: 1px solid #93c5fd; color: #93c5fd; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; }
.archive-section { flex-shrink: 0; background-color: #202124; color: white; padding: 1rem; border-top: 1px solid #5f6368; }
.archive-section button { padding: 0.5rem 1rem; margin-bottom: 1rem; cursor: pointer; background-color: #5f6368; color: white; border: none; border-radius: 4px; }
.archive-list { height: 360px; overflow-y: auto; background-color: #282a2d; border: 1px solid #5f6368; border-radius: 6px; padding: 0.75rem; }
.order-query-board { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
.date-range-controls { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.date-range-controls input { background: #3c4043; border: 1px solid #5f6368; color: #e8eaed; padding: 0.4rem 0.6rem; border-radius: 4px; height: 2.25rem; }
.date-range-controls button { background: #5f6368; color: #fff; border: none; border-radius: 4px; padding: 0.5rem 0.8rem; cursor: pointer; height: 2.25rem; }
.phone-query { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.phone-query input { background: #3c4043; border: 1px solid #5f6368; color: #e8eaed; padding: 0.4rem 0.6rem; border-radius: 4px; height: 2.25rem; }
.phone-query button { background: #5f6368; color: #fff; border: none; border-radius: 4px; padding: 0.5rem 0.8rem; cursor: pointer; height: 2.25rem; }
.phone-query .error { color: #f87171; }
.order-card-small { background-color: #3c4043; padding: 0.5rem; margin-bottom: 0.5rem; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }

/* Tabs */
.tabs { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.tabs button { background: #5f6368; color: #fff; border: none; border-radius: 4px; padding: 0.4rem 0.75rem; cursor: pointer; }
.tabs button.active { background: #8ab4f8; color: #202124; }

/* Products */
.products-board { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.products-list { display: flex; flex-direction: column; gap: 0.5rem; }
.product-row { display: grid; grid-template-columns: minmax(360px, 2fr) 160px 360px; align-items: center; gap: 1rem; background: #282a2d; border: 1px solid #5f6368; border-radius: 6px; padding: 0.75rem; }
.product-name { color: #e8eaed; }
.product-price { color: #e8eaed; }
.product-availability { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.avail-on { color: #34a853; font-weight: 600; }
.avail-off { color: #f87171; font-weight: 600; }
.products-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.product-create { display: inline-flex; gap: 0.5rem; align-items: center; }
.product-create input { background: #3c4043; border: 1px solid #5f6368; color: #e8eaed; padding: 0.4rem 0.6rem; border-radius: 4px; }
.product-create button { background: #34a853; color: #fff; border: none; border-radius: 4px; padding: 0.45rem 0.8rem; cursor: pointer; }
.product-search input { background: #3c4043; border: 1px solid #5f6368; color: #e8eaed; padding: 0.4rem 0.6rem; border-radius: 4px; width: 100%; max-width: 480px; }
.row-actions { display: inline-flex; gap: 0.5rem; align-items: center; }
.ghost-btn { background: transparent; border: 1px solid #5f6368; color: #e8eaed; padding: 0.35rem 0.6rem; border-radius: 4px; cursor: pointer; }
.confirm-delete { display: inline-flex; gap: 0.5rem; align-items: center; }
.danger-btn { background: #dc2626; color: #fff; border: none; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; }

/* Holidays */
.holidays-board { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.holi-controls { display: flex; flex-direction: column; gap: 0.75rem; }
.holi-controls > div { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.holi-controls input { background: #3c4043; border: 1px solid #5f6368; color: #e8eaed; padding: 0.5rem 0.6rem; border-radius: 4px; height: 2.25rem; }
.holi-controls input[type="number"] { width: 6rem; }
.holi-controls button { background: #5f6368; color: #fff; border: none; border-radius: 4px; padding: 0.5rem 0.8rem; cursor: pointer; height: 2.25rem; }
.holi-add { display: inline-flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.holi-list { display: flex; flex-direction: column; gap: 0.5rem; }
.holi-row { display: grid; grid-template-columns: 140px 140px 1fr 100px; gap: 0.5rem; align-items: center; background: #282a2d; border: 1px solid #5f6368; border-radius: 6px; padding: 0.5rem; }
.holi-row .date { color: #e8eaed; }
.holi-row .kind { color: #8ab4f8; }
.holi-row.weekly .kind { color: #f9bf2d; }
.holi-row .note { color: #e8eaed; }
.holi-row .ops button { background: #dc2626; color: #fff; border: none; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; }
.mp-lookup { margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center; justify-content: center; }
.mp-lookup input { background: #3c4043; border: 1px solid #5f6368; color: #e8eaed; padding: 0.5rem 0.6rem; border-radius: 4px; width: 220px; font-size: 1rem; height: 1.15rem; position: relative; top: -2px; }
.mp-lookup button { background: #5f6368; color: #fff; border: none; border-radius: 4px; padding: 0.5rem 0.8rem; cursor: pointer; font-size: 1rem; height: 2.25rem; }
.mp-lookup .mp-result { color: #e8eaed; }
  
  /* Archived Order Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .modal-content {
    background: #202124;
    border-radius: 8px;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    border: 1px solid #5f6368;
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #5f6368;
  }
  
  .modal-header h3 {
    margin: 0;
    color: #8ab4f8;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: #9aa0a6;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }
  
  .close-btn:hover {
    background: #5f6368;
    color: #e8eaed;
  }
  
  .modal-body {
    padding: 1rem;
  }
  
  .order-info p {
    margin: 0.5rem 0;
    color: #e8eaed;
  }
  
  .products-list h4 {
    margin: 1rem 0 0.5rem 0;
    color: #8ab4f8;
  }
  
  .products-list ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .products-list li {
    background: rgba(139, 195, 74, 0.1);
    border: 1px solid rgba(139, 195, 74, 0.3);
    border-radius: 4px;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    color: #8bc34a;
    font-weight: 500;
  }
  
  .notes-section h4 {
    margin: 1rem 0 0.5rem 0;
    color: #f9bf2d;
  }
  
  .notes-section p {
    margin: 0;
    color: #e8eaed;
    white-space: pre-wrap;
  }
  
  /* Archived Orders Clickable */
  .archived-order {
    cursor: pointer;
    padding: 0.9rem 1rem;
    border: 1px solid #5f6368;
    border-radius: 6px;
    margin-bottom: 0.6rem;
    background: #3c4043;
    color: #e8eaed;
    transition: background-color 0.2s;
  }
  
  .archived-order:hover {
    background: #5f6368;
  }
  
  .archived-order strong {
    color: #8ab4f8;
  }

/* Statistics */
.statistics-board { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.stats-controls { display: flex; justify-content: center; margin-bottom: 1rem; }
.stats-controls button { 
  background: #8ab4f8; 
  color: #202124; 
  border: none; 
  border-radius: 6px; 
  padding: 0.75rem 1.5rem; 
  cursor: pointer; 
  font-size: 1rem; 
  font-weight: 600;
  transition: background-color 0.2s;
}
.stats-controls button:hover { background: #aecbfa; }
.stats-controls button:disabled { background: #5f6368; color: #9aa0a6; cursor: not-allowed; }

.stats-table { 
  background: #282a2d; 
  border-radius: 8px; 
  overflow: hidden; 
  border: 1px solid #5f6368;
}
.stats-header { 
  background: #3c4043; 
  color: #e8eaed; 
  font-weight: 600; 
  text-align: left; 
  padding: 1rem; 
  border-bottom: 1px solid #5f6368;
  display: grid;
  grid-template-columns: 80px 2fr 120px 120px 100px;
  gap: 1rem;
}
.stats-header .rank { text-align: center; }
.stats-header .product-name { text-align: left; padding-right: 1rem; }
.stats-header .quantity,
.stats-header .revenue,
.stats-header .percentage { text-align: center; }
.stats-row { 
  display: grid; 
  grid-template-columns: 80px 2fr 120px 120px 100px; 
  align-items: center; 
  padding: 1rem; 
  border-bottom: 1px solid #5f6368; 
  transition: background-color 0.2s;
}
.stats-row:hover { background: #3c4043; }
.stats-row:last-child { border-bottom: none; }
.stats-row.top-3 { background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: #fff; }
.stats-row.top-3:hover { background: linear-gradient(135deg, #1e40af, #2563eb); }

.stats-row .rank { 
  font-weight: 700; 
  color: #8ab4f8; 
  text-align: center;
  font-size: 1.1rem;
}
.stats-row.top-3 .rank { color: #fff; }

.stats-row .product-name { 
  color: #e8eaed; 
  font-weight: 500;
  padding-right: 1rem;
}
.stats-row.top-3 .product-name { color: #fff; }

.stats-row .quantity { 
  font-weight: 600; 
  color: #8bc34a; 
  text-align: center;
}
.stats-row.top-3 .quantity { color: #a5f3fc; }

.stats-row .revenue { 
  font-weight: 600; 
  color: #f9bf2d; 
  text-align: center;
}
.stats-row.top-3 .revenue { color: #fef3c7; }

.stats-row .percentage { 
  font-weight: 600; 
  color: #4285f4; 
  text-align: center;
}
.stats-row.top-3 .percentage { color: #bfdbfe; }

.no-stats { 
  text-align: center; 
  padding: 3rem; 
  color: #9aa0a6; 
  background: #282a2d; 
  border-radius: 8px; 
  border: 1px solid #5f6368;
}
</style>