<template>
  <div class="page">
    <div class="wrap">
      <header>
        <h1>水最美 - 熊哥滷味下單區</h1>
        <p><span class="diamond" aria-hidden="true"></span>如訂單稍多時，請等待一下。</p>
        <p><span class="diamond" aria-hidden="true"></span>目前皆自取，當場付款。</p>
        <p><span class="diamond" aria-hidden="true"></span>備註未填寫，附竹籤一支。</p>

        <div class="img"></div>
      </header>

      <!-- 訂單查詢系統 -->
      <div class="order-query-section">
        <h3>📋 查詢訂單狀態</h3>
        <div class="query-form">
          <input 
            type="tel" 
            v-model="queryPhone" 
            placeholder="輸入電話號碼" 
            class="query-input"
            maxlength="15"
          />
          <button @click="queryOrders" class="query-btn" :disabled="!queryPhone.trim()">
            查詢
          </button>
        </div>
        
        <!-- 查詢結果 -->
        <div v-if="queryResults.length > 0" class="query-results">
          <h4>您的訂單狀態：</h4>
          <div v-for="order in queryResults" :key="order.id" class="order-status-card">
            <div class="order-header">
              <span class="order-number">#{{ order.orderNumber }}</span>
              <span :class="getStatusClass(order.status)">{{ getStatusText(order.status) }}</span>
            </div>
            <div class="order-details">
              <p><strong>下單時間：</strong>{{ formatDate(order.createdAt) }}</p>
              <p><strong>取餐時間：</strong>{{ formatPickupDateTime(order) }}</p>
              <p><strong>總金額：</strong>NT.{{ fmt(order.totalPrice) }}</p>
              <div class="order-items">
                <strong>訂購項目：</strong>
                <ul>
                  <li v-for="item in order.items" :key="item.productId">
                    {{ item.name }} × {{ item.quantity }}
                  </li>
                </ul>
              </div>
              <p v-if="order.notes" class="order-notes">
                <strong>備註：</strong>{{ order.notes }}
              </p>
            </div>
          </div>
        </div>
        
        <!-- 查詢錯誤訊息 -->
        <div v-if="queryError" class="query-error">
          {{ queryError }}
        </div>
      </div>

      <main class="card" role="region" aria-labelledby="form-title">
        <h2 id="form-title" class="sr-only">下單表單</h2>
        <form @submit.prevent="submitOrder">
          <!-- 客戶資訊 -->
          <section class="grid grid-2" aria-labelledby="cust-info">
            <h3 id="cust-info" class="sr-only">客戶資訊</h3>

            <div>
              <label for="name">姓名</label>
              <input id="name" type="text" v-model.trim="form.name"
                     placeholder="請輸入您的姓名" required autocomplete="name" />
              <div class="hint error" v-if="errors.name">{{ errors.name }}</div>
            </div>

            <div>
              <label for="phone">電話</label>
              <input id="phone" type="tel" v-model.trim="form.phone" inputmode="tel"
                     placeholder="09xxxxxxxx" required autocomplete="tel" />
              <div class="hint">  僅作取貨聯繫用途（會員編號）｜會員點數：<strong>{{ isLoadingPoints ? '讀取中...' : memberPoints }}</strong><span v-if="canRedeem">（滿 200 可用 100 點換王子麵）</span></div>
              <div class="hint error" v-if="errors.phone">{{ errors.phone }}</div>
            </div>

            <div>
              <label for="pickup-date">取餐日期與時間 (必填)</label>
              <div class="grid grid-2">
                <input id="pickup-date" type="date" v-model="form.pickupDate" :min="todayStr" required aria-label="取餐日期" />
                
                <!-- 改為兩個下拉：時、分 -->
                <div class="grid grid-2" aria-label="取餐時間">
                    <select id="pickup-hour" v-model="form.pickupHour" required aria-label="取餐時" :disabled="hourOptions.length === 0" class="time-select">
                        <option disabled value="">時</option>
                        <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}</option>
                    </select>
                    
                    <select id="pickup-minute" v-model="form.pickupMinute" required aria-label="取餐分" :disabled="!form.pickupHour || minuteOptions.length === 0" class="time-select">
                        <option disabled value="">分</option>
                        <option v-for="m in minuteOptions" :key="m" :value="m">{{ m }}</option>
                    </select>
                </div>
              </div>
              <div class="hint">營業時段 12:00–21:00，僅提供 15 分鐘區段</div>
              <div class="hint error" v-if="errors.pickupDate">{{ errors.pickupDate }}</div>
              <div class="hint error" v-if="errors.pickupTime">{{ errors.pickupTime }}</div>
            </div>

            <div>
              <label for="note">備註（可選）</label>
              <input id="note" type="text" v-model.trim="form.note"
                     placeholder="大辣、小辣、不要餐具..." autocomplete="off" />
            </div>
          </section>

          <!-- 公告 -->
          <div class="announcement" role="status" aria-live="polite">
            公告：第一次下單送5000點，超過200元扣100點換一包王子麵
          </div>
          
          <!-- 菜單清單 -->
          <section class="menu" aria-labelledby="menu-title">
            <div class="menu-header">
              <h3 id="menu-title">滷味品項</h3>
              <span class="chip" aria-live="polite">合計：{{ totalQty }} 份</span>
            </div>

            <div class="item" v-for="(m, idx) in menu" :key="m.id" :class="{ 'unavailable': !m.isAvailable }">
              <div>
                {{ m.name }}
                <small class="price">NT.{{ fmt(m.price) }}</small>
              </div>
              <div class="controls" :aria-label="`調整 ${m.name} 份數`" :class="{ 'disabled': !m.isAvailable }">
                <button type="button" class="btn icon" @click="dec(idx)" :aria-label="`減少 ${m.name}`" :disabled="!m.isAvailable">-</button>
                <div class="qty" aria-live="polite">{{ m.qty }}</div>
                <button type="button" class="btn icon" @click="inc(idx)" :aria-label="`增加 ${m.name}`" :disabled="!m.isAvailable">+</button>
              </div>
            </div>

            <div class="total">
              合計：{{ totalQty }} 份 / NT.{{ fmt(totalPrice) }} 元 — <strong>取餐付款</strong>
            </div>
            <div v-if="canShowRedeem" class="redeem-box" :class="{ disabled: !redeemEnabled }" role="region" aria-label="點數兌換區">
              <div class="redeem-title">
                <span class="redeem-icon" aria-hidden="true">🎁</span>
                使用 100 點兌換王子麵
              </div>
              <label class="redeem-action">
                <input type="checkbox" v-model="redeemWangZiMian" :disabled="!redeemEnabled" aria-label="勾選使用 100 點兌換王子麵" />
                <span class="redeem-text" v-if="redeemEnabled">可使用（目前點數：{{ memberPoints }}）</span>
                <span class="redeem-text" v-else>點數不足（目前點數：{{ memberPoints }}，首次線上下單贈 5000 點）</span>
              </label>
            </div>
            <div class="hint error" v-if="errors.items">{{ errors.items }}</div>
          </section>

          <!-- 送出前錯誤區塊 -->
          <div v-if="errors.name || errors.phone || errors.pickupDate || errors.pickupTime || errors.items" class="form-errors" role="alert" aria-live="assertive">
            <ul>
              <li v-if="errors.name">{{ errors.name }}</li>
              <li v-if="errors.phone">{{ errors.phone }}</li>
              <li v-if="errors.pickupDate">{{ errors.pickupDate }}</li>
              <li v-if="errors.pickupTime">{{ errors.pickupTime }}</li>
              <li v-if="errors.items">{{ errors.items }}</li>
            </ul>
          </div>

          <!-- 送出 -->
          <div class="actions">
            <button
              type="submit"
              class="btn primary send"
              :disabled="isSubmitting"
              aria-describedby="submit-hint"
            >
              送出訂單
            </button>
          </div>
        </form>
      </main>

      <!-- 成功 Modal（未串 API 也可用） -->
      <div class="overlay" :class="{ show: showModal }" @click.self="closeModal" role="dialog" aria-labelledby="modal-title">
        <div class="modal" role="document">
          <h3 id="modal-title">下單成功 ✅</h3>
          <p class="mb">
            感謝您的訂購！<br>
            您的訂貨單號為電話後 6 碼：<br>
            <span class="order-number">#{{ orderNumber }}</span><br>
            取餐時間：<strong>{{ pickupDisplay }}</strong><br>
            合計：<strong>{{ totalQty }}</strong> 份 / <strong>NT.{{ fmt(totalPrice) }}</strong> 元（取餐付款）<br>
            會員剩餘點數：<strong>{{ memberPoints }}</strong>
          </p>

          <div v-if="summaryItems.length" class="scroll">
            <ul>
              <li v-for="it in summaryItems" :key="it.id">
                {{ it.name }} × {{ it.qty }} ＝ NT.{{ fmt(it.subtotal) }}
              </li>
            </ul>
          </div>


          <div v-if="form.note && form.note.trim()" class="order-notes" style="margin-top:0.5rem;">
            <strong>備註：</strong>{{ form.note }}
          </div>


          <div class="countdown-info">
            <p>頁面將在 <strong>{{ countdown }}</strong> 秒後自動重新載入</p>
          </div>

          <div class="modal-actions">
            <button class="btn" @click="closeModal">關閉</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted, watch } from 'vue'

const form = reactive({
  name: '',
  phone: '',
  pickupDate: '',
  pickupTime: '',
  // 新增時分下拉欄位
  pickupHour: '',
  pickupMinute: '',
  note: ''
})

// 會員點數
const memberPoints = ref(0)
const isLoadingPoints = ref(false)
const canShowRedeem = computed(() => totalPrice.value >= 200)
const redeemEnabled = computed(() => totalPrice.value >= 200 && memberPoints.value >= 100)
const redeemWangZiMian = ref(false)

async function fetchMemberPoints() {
  const phone = form.phone.trim()
  if (!phone) { memberPoints.value = 0; return }
  try {
    isLoadingPoints.value = true
    const res = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(phone)}`)
    if (!res.ok) throw new Error('points fetch failed')
    const data = await res.json()
    memberPoints.value = Number(data.points) || 0
  } catch (_) {
    memberPoints.value = 0
  } finally {
    isLoadingPoints.value = false
  }
}

watch(() => form.phone, (v) => {
  if ((v || '').trim().length >= 8) {
    fetchMemberPoints()
  } else {
    memberPoints.value = 0
  }
})

// 假日資料
const holidays = ref([])
const holidaySet = computed(() => new Set((holidays.value || []).map(h => h.date)))
async function loadHolidays() {
  try {
    const d = new Date()
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const res = await fetch(`${API_BASE_URL}/api/holidays?year=${y}&month=${m}`)
    if (!res.ok) throw new Error('holidays fetch failed')
    holidays.value = await res.json()
  } catch (_) {
    holidays.value = []
  }
}
onMounted(loadHolidays)

// 從後端讀取可售商品（只回傳 isAvailable=true）
const API_BASE_URL = window.API_BASE_URL || 'https://line-ordering-backend-199532894970.asia-east1.run.app'
const menu = ref([])
const isLoadingMenu = ref(false)
const menuError = ref('')
// 移除 pickupTimeEl，因為不再需要

async function loadMenu() {
  isLoadingMenu.value = true
  menuError.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/api/products`)
    if (!res.ok) throw new Error('載入菜單失敗')
    const products = await res.json() // [{ id, name, price }]
    console.log('API 返回的商品數據:', products) // 調試用
    menu.value = products.map(p => ({ 
      id: p.id, 
      name: p.name, 
      price: p.price, 
      qty: 0,
      isAvailable: p.isAvailable !== false // 如果沒有 isAvailable 屬性，預設為 true
    }))
    console.log('處理後的菜單數據:', menu.value) // 調試用
  } catch (e) {
    console.error(e)
    menuError.value = '菜單載入失敗，請稍後重試'
  } finally {
    isLoadingMenu.value = false
  }
}
onMounted(loadMenu)

const showModal = ref(false)
const isSubmitting = ref(false)
const errors = reactive({ name: '', phone: '', pickupDate: '', pickupTime: '', items: '' })
const countdown = ref(10) // 倒數計時改為 10 秒

const totalQty   = computed(() => menu.value.reduce((s, i) => s + (Number(i.qty) || 0), 0))
const totalPrice = computed(() => menu.value.reduce((s, i) => s + (i.qty * (i.price || 0)), 0))

function isValidPickupTimeInRange(t) {
  if (!t) return false
  const m = /^([0-2]\d):([0-5]\d)$/.exec(t)
  if (!m) return false
  const hh = Number(m[1]); const mm = Number(m[2])
  const minutes = hh * 60 + mm
  return minutes >= 12 * 60 && minutes <= 21 * 60 // 12:00–21:00
}

function buildPickupDate() {
  if (!form.pickupDate || !form.pickupTime) return null
  const dt = new Date(`${form.pickupDate}T${form.pickupTime}:00`)
  return isNaN(dt.getTime()) ? null : dt
}

function isPickupInFuture() {
  const dt = buildPickupDate()
  if (!dt) return false
  return dt.getTime() >= Date.now()
}

const canSubmit = computed(() => {
  const basic = form.name.trim().length > 0 && form.phone.trim().length > 0 && form.pickupDate && form.pickupTime && totalQty.value > 0
  const phoneOk = /^\d[\d\-\s]{7,14}$/.test(form.phone.trim())
  const timeOk = isValidPickupTimeInRange(form.pickupTime.trim())
  const futureOk = isPickupInFuture()
  return basic && phoneOk && timeOk && futureOk
})

function inc(idx) { menu.value[idx].qty++ }
function dec(idx) { menu.value[idx].qty = Math.max(0, menu.value[idx].qty - 1) }

function fmt(n) {
  try { return Number(n).toLocaleString('zh-TW') } catch { return n }
}

const summaryItems = computed(() =>
  {
    const items = menu.value
      .filter(m => m.qty > 0)
      .map(m => ({ id: m.id, name: m.name, qty: m.qty, subtotal: m.qty * m.price }));
    if (redeemWangZiMian.value) {
      items.push({ id: 'wangzimian-gift', name: '王子麵（贈品）', qty: 1, subtotal: 0 });
    }
    return items;
  }
)

async function submitOrder () {
  if (isSubmitting.value) return
  // 前端顯示哪個欄位有問題
  errors.name = form.name.trim() ? '' : '請輸入姓名'
  errors.phone = /^\d[\d\-\s]{7,14}$/.test(form.phone.trim()) ? '' : '請輸入有效的電話'
  errors.pickupDate = form.pickupDate ? (holidaySet.value.has(form.pickupDate) ? '該日期為公休，無法下單' : '') : '請選擇日期'
  errors.pickupTime = (form.pickupTime && isValidPickupTimeInRange(form.pickupTime.trim()) && isPickupInFuture()) ? '' : '請選擇有效且不早於現在的時間（11:00–21:00）'
  errors.items = totalQty.value > 0 ? '' : '請至少選擇一份品項'
  if (errors.name || errors.phone || errors.pickupDate || errors.pickupTime || errors.items) {
    return
  }
  try {
    isSubmitting.value = true
    const items = menu.value.filter(m => m.qty > 0).map(m => ({ id: m.id, quantity: m.qty }))
    const payload = {
      customerName: form.name.trim(),
      customerPhone: form.phone.trim(),
      pickupTime: `${form.pickupDate} ${form.pickupTime}`.trim(),
      notes: form.note?.trim() || '',
      items,
      redeemWangZiMian: redeemWangZiMian.value === true
    }
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(txt || '送出失敗')
    }
    const resJson = await res.json().catch(() => ({}))
    if (typeof resJson.memberPoints === 'number') {
      memberPoints.value = resJson.memberPoints
    }
    // 成功：顯示成功彈窗
    showModal.value = true
    countdown.value = 10
    
    // 開始倒數計時
    const timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(timer)
        window.location.reload()
      }
    }, 1000)
    
  } catch (e) {
    console.error(e)
    alert('訂單送出失敗，請稍後再試。')
  } finally {
    isSubmitting.value = false
  }
}

function closeModal () {
  showModal.value = false
  // 清空表單與選購數量
  form.name = ''
  form.phone = ''
  form.pickupTime = ''
  form.pickupHour = ''
  form.pickupMinute = ''
  form.note = ''
  menu.value = menu.value.map(m => ({ ...m, qty: 0 }))
}

function todayYMD () {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

onMounted(() => {
  if (!form.pickupDate) {
    // 若現在超過 21:00，預設日期改為明天
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    if (minutes > 21 * 60) {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      form.pickupDate = `${y}-${m}-${day}`
    } else {
      form.pickupDate = todayYMD()
    }
  }
})

const pickupDisplay = computed(() => {
  if (!form.pickupDate || !form.pickupTime) return ''
  const dt = new Date(`${form.pickupDate}T${form.pickupTime}:00`)
  if (isNaN(dt.getTime())) return `${form.pickupDate} ${form.pickupTime}`
  return dt.toLocaleString('zh-TW')
})

// 計算訂單號碼（手機後六碼）
const orderNumber = computed(() => {
  const phone = form.phone.trim()
  if (phone.length >= 6) {
    return phone.slice(-6)
  }
  return phone
})

const todayStr = computed(() => todayYMD())

// 新增時間選項計算
const BUSINESS_START = '12:00'
const BUSINESS_END = '21:00'
const STEP_MINUTES = 15

function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function minToHhmm(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0')
  const m = String(mins % 60).padStart(2, '0')
  return `${h}:${m}`
}

const hourOptions = computed(() => {
  const startH = Number(BUSINESS_START.split(':')[0]) // 11
  const endH = Number(BUSINESS_END.split(':')[0])   // 21
  const arr = []
  for (let h = startH; h <= endH; h++) {
    arr.push(String(h).padStart(2, '0'))
  }
  return arr
})

const minuteOptions = computed(() => {
  if (!form.pickupHour) return []
  const h = Number(form.pickupHour)
  const mins = [0, 15, 30, 45].map(n => String(n).padStart(2, '0'))
  
  // 21 點只提供 00 分（避免超出 21:00）
  if (h === Number(BUSINESS_END.split(':')[0])) return ['00']
  
  return mins
})

// 監聽時分變化，自動更新 pickupTime
watch(
  () => [form.pickupDate, form.pickupHour, form.pickupMinute],
  () => {
    // 若已選擇小時，但分鐘未選或不合法，預設為 '00'（若該小時允許）或取第一個可選分鐘
    if (form.pickupHour && (!form.pickupMinute || !minuteOptions.value.includes(form.pickupMinute))) {
      const defaultMinute = minuteOptions.value.includes('00')
        ? '00'
        : (minuteOptions.value[0] || '')
      form.pickupMinute = defaultMinute
      form.pickupTime = (form.pickupHour && defaultMinute) ? `${form.pickupHour}:${defaultMinute}` : ''
      if (!form.pickupTime) return
    }

    if (!form.pickupHour || !form.pickupMinute) {
      form.pickupTime = ''
      return
    }
    const hhmm = `${form.pickupHour}:${form.pickupMinute}`
    
    // 分選項因小時切換而失效的情況 → 重置
    if (!minuteOptions.value.includes(form.pickupMinute)) {
      const fallbackMinute = minuteOptions.value.includes('00') ? '00' : (minuteOptions.value[0] || '')
      form.pickupMinute = fallbackMinute
      form.pickupTime = (form.pickupHour && fallbackMinute) ? `${form.pickupHour}:${fallbackMinute}` : ''
      return
    }
    
    form.pickupTime = hhmm
  },
  { immediate: true }
)

// 訂單查詢系統
const queryPhone = ref('')
const queryResults = ref([])
const queryError = ref('')

function formatDate(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-TW', { hour: 'numeric', minute: 'numeric' })
}

function extractPickupTime(notes) {
  // 嘗試匹配不同的時間格式
  const patterns = [
    /預計\s*(\d{1,2}:\d{2})\s*領取/,  // "預計 14:30 領取"
    /取餐時間：(\d{1,2}:\d{2})/,      // "取餐時間：14:30"
    /(\d{1,2}:\d{2})/                // 任何時間格式
  ];
  
  for (const pattern of patterns) {
    const match = notes.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return '未指定';
}

function formatPickupDateTime(order) {
  // 正規化 Firestore/Date/字串時間戳
  function normalizeTs(ts) {
    if (!ts) return null
    if (typeof ts === 'object') {
      if (typeof ts.toDate === 'function') {
        try { return ts.toDate() } catch { return null }
      }
      if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000)
      if (typeof ts._seconds === 'number') return new Date(ts._seconds * 1000)
    }
    const d = new Date(ts)
    return isNaN(d.getTime()) ? null : d
  }

  // 1) 優先使用後端的 pickupAt（精確日期時間）
  const pt = order && order.pickupAt ? normalizeTs(order.pickupAt) : null
  if (pt) {
    const m = String(pt.getMonth() + 1).padStart(2, '0')
    const d = String(pt.getDate()).padStart(2, '0')
    const hh = String(pt.getHours()).padStart(2, '0')
    const mm = String(pt.getMinutes()).padStart(2, '0')
    return `${m}/${d} ${hh}:${mm}`
  }

  // 2) 後備：從備註抓完整日期+時間（YYYY-MM-DD HH:mm）
  const n = order && order.notes ? String(order.notes) : ''
  let mFull = n.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/)
  if (mFull && mFull[1] && mFull[2]) {
    const dt = new Date(`${mFull[1]}T${mFull[2]}:00`)
    if (!isNaN(dt.getTime())) {
      const mm2 = String(dt.getMonth() + 1).padStart(2, '0')
      const dd2 = String(dt.getDate()).padStart(2, '0')
      const hh2 = String(dt.getHours()).padStart(2, '0')
      const mi2 = String(dt.getMinutes()).padStart(2, '0')
      return `${mm2}/${dd2} ${hh2}:${mi2}`
    }
  }

  // 3) 最後備援：僅有 HH:mm，配上下單日期
  const timeOnly = order && order.notes ? extractPickupTime(order.notes) : ''
  const created = order && order.createdAt ? normalizeTs(order.createdAt) : new Date()
  if (!timeOnly || timeOnly === '未指定' || !created) return '未指定'
  const m = String(created.getMonth() + 1).padStart(2, '0')
  const day = String(created.getDate()).padStart(2, '0')
  return `${m}/${day} ${timeOnly}`
}

function getStatusClass(status) {
  switch (status) {
    case 'PENDING':
      return 'status-pending'
    case 'IN_PROGRESS':
      return 'status-in-progress'
    case 'COMPLETED':
      return 'status-completed'
    case 'ARCHIVED':
      return 'status-archived'
    default:
      return 'status-unknown'
  }
}

function getStatusText(status) {
  switch (status) {
    case 'PENDING':
      return '新進訂單'
    case 'IN_PROGRESS':
      return '製作中'
    case 'COMPLETED':
      return '待領取'
    case 'ARCHIVED':
      return '已完成'
    default:
      return '未知狀態'
  }
}

async function queryOrders() {
  if (!queryPhone.value.trim()) {
    queryError.value = '請輸入電話號碼'
    queryResults.value = []
    return
  }
  queryError.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/api/orders/query/${queryPhone.value.trim()}`)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(txt || '查詢失敗')
    }
    const orders = await res.json()
    queryResults.value = orders
  } catch (e) {
    console.error(e)
    queryError.value = '查詢失敗，請稍後再試。'
    queryResults.value = []
  }
}
</script>


<style scoped>
.hint.error { color: #e11d48; }

/* 兌換區樣式 */
.redeem-box {
  margin-top: 0.5rem;
  padding: 0.75rem 0.9rem;
  border: 2px solid #16a34a;
  background: #f0fdf4;
  border-radius: 10px;
}
.redeem-box.disabled {
  border-color: #9ca3af;
  background: #f3f4f6;
}
.redeem-title {
  font-weight: 700;
  color: #065f46;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}
.redeem-box.disabled .redeem-title { color: #4b5563; }
.redeem-icon { font-size: 1.1rem; }
.redeem-action {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #065f46;
}
.redeem-box.disabled .redeem-action { color: #4b5563; }
.redeem-text { font-size: 0.95rem; }

.time-select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background-color: white;
  font-size: 0.875rem;
  width: 100%;
}

.time-select:disabled {
  background-color: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.time-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* 不可用商品的灰階樣式 */
.item.unavailable {
  opacity: 0.5;
  filter: grayscale(100%);
  color: #6b7280;
}

.item.unavailable .price {
  color: #9ca3af;
}

.controls.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.controls.disabled .btn {
  background-color: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.controls.disabled .qty {
  color: #9ca3af;
}

/* 訂單號碼樣式 */
.order-number {
  display: inline-block;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 1.25rem;
  font-weight: bold;
  margin: 0.5rem 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* 訂單查詢系統樣式 */
.order-query-section {
  background-color: #f9fafb;
  padding: 1rem;
  border-radius: 0.5rem;border-radius: 16px;box-sizing: border-box; border:5px solid #8ed23f;
  margin: 5px 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.order-query-section h3 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
  color: #4b5563;
}

.query-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  align-items: center;
}

.query-input {
  flex-grow: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: #374151;
  max-width: 200px;
}

.query-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.query-btn {
  padding: 0.5rem 1rem;
  background-color: #4f46e5;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  white-space: nowrap;
}

.query-btn:hover:not(:disabled) {
  background-color: #4338ca;
}

.query-btn:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
  color: #6b7280;
}

.query-results {
  margin-top: 1rem;
}

.query-results h4 {
  margin-bottom: 0.5rem;
  color: #4b5563;
  font-size: 0.875rem;
}

.order-status-card {
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #f3f4f6;
}

.order-number {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.order-status {
  font-weight: 600;
  color: #4b5563;
}

.order-details p {
  margin-bottom: 0.25rem;
  color: #4b5563;
  font-size: 0.875rem;
}

.order-details strong {
  color: #374151;
}

.order-items ul {
  list-style: none;
  padding: 0;
  margin: 0.25rem 0;
}

.order-items li {
  margin-bottom: 0.125rem;
  color: #4b5563;
  font-size: 0.875rem;
}

.order-notes {
  margin-top: 0.5rem;
  font-style: italic;
  color: #6b7280;
  font-size: 0.875rem;
}

/* 訂單狀態樣式 */
.status-pending {
  color: #f59e0b;
  font-weight: bold;
  background-color: #fef3c7;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.status-in-progress {
  color: #3b82f6;
  font-weight: bold;
  background-color: #dbeafe;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.status-completed {
  color: #10b981;
  font-weight: bold;
  background-color: #d1fae5;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.status-archived {
  color: #6b7280;
  font-weight: bold;
  background-color: #f3f4f6;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.status-unknown {
  color: #9ca3af;
  font-weight: bold;
  background-color: #f9fafb;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.query-error {
  color: #e11d48;
  font-weight: bold;
  margin-top: 1rem;
  text-align: center;
}

/* 倒數計時樣式 */
.countdown-info {
  text-align: center;
  margin: 1rem 0;
  padding: 0.75rem;
  background-color: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 0.5rem;
  color: #000000; /* 改為黑色 */
}

.countdown-info p {
  margin: 0;
  font-size: 0.875rem;
  color: #000000; /* 確保文字是黑色 */
}

.countdown-info strong {
  color: #dc2626; /* 倒數數字保持紅色 */
  font-size: 1.125rem;
  font-weight: 700;
}

.form-errors {
  margin: 0.75rem 0;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 0.5rem;
}
.form-errors ul { margin: 0; padding-left: 1rem; }
.form-errors li { line-height: 1.6; }

.announcement {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  background: #fffbeb;
  border: 1px solid #fef3c7;
  color: #92400e;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  text-align: center;
  font-weight: 500;
}

.mini-announcement {
  margin-left: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: #fffbeb;
  border: 1px solid #fef3c7;
  color: #92400e;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  white-space: nowrap;
}
/* 讓合計貼齊最右側 */
.menu-header .chip { margin-left: auto; }
@media (max-width: 640px) {
  .mini-announcement {
    display: block;
    margin: 0.5rem 0 0;
    white-space: normal;
  }
}
.gift-line { color: #ffffff; margin: 0.5rem 0 0; }
.gift-line strong { color: #ffffff; }
</style>