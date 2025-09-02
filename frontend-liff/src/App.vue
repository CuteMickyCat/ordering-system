<script setup>
import { ref, onMounted } from 'vue';
import liff from '@line/liff';
import axios from 'axios';

const products = ref([]);
const cart = ref({});
const message = ref('正在載入...');
const profile = ref(null);
const liffId = import.meta.env.VITE_LIFF_ID; // 於 .env 設定
const backendUrl = import.meta.env.VITE_BACKEND_URL; // 於 .env 設定

// 新增：預計領取時間與備註
const pickupTime = ref(''); // e.g. 18:30
const extraNotes = ref('');

onMounted(async () => {
  try {
    await liff.init({ liffId });
    if (!liff.isLoggedIn()) {
      message.value = '請在 LINE App 中開啟';
      // liff.login(); // or force login
      return;
    }
    profile.value = await liff.getProfile();
    const response = await axios.get(`${backendUrl}/api/products`);
    products.value = response.data;
    message.value = '';
  } catch (error) {
    console.error('LIFF/API Error:', error);
    message.value = '載入失敗，請稍後再試。';
  }
});

const addToCart = (product) => {
  if (!cart.value[product.id]) {
    cart.value[product.id] = { ...product, quantity: 0 };
  }
  cart.value[product.id].quantity++;
};

const totalPrice = () => {
  return Object.values(cart.value).reduce((sum, item) => sum + item.price * item.quantity, 0);
};

function buildNotes() {
  const parts = [];
  if (pickupTime.value) parts.push(`預計 ${pickupTime.value} 領取`);
  if (extraNotes.value) parts.push(extraNotes.value);
  return parts.join(' | ');
}

const placeOrder = async () => {
  if (Object.keys(cart.value).length === 0) {
    alert('購物車是空的！');
    return;
  }
  try {
    message.value = '正在送出訂單...';
    const orderData = {
      userId: profile.value.userId,
      displayName: profile.value.displayName,
      pictureUrl: profile.value.pictureUrl,
      totalPrice: totalPrice(),
      notes: buildNotes(),
      items: Object.values(cart.value).map(item => ({
        id: item.id, // Firestore document id
        name: item.name,
        quantity: item.quantity,
        price: item.price
      }))
    };
    await axios.post(`${backendUrl}/api/orders`, orderData);
    alert('訂單已成功送出！');
    liff.closeWindow();
  } catch (error) {
    console.error('Place order error:', error);
    alert('訂單送出失敗！');
    message.value = '';
  }
};
</script>

<template>
  <div class="container">
    <h1>點餐系統</h1>
    <p v-if="message">{{ message }}</p>
    <div v-if="profile">
      <p>你好, {{ profile.displayName }}</p>

      <div class="product-list">
        <h2>菜單</h2>
        <div v-for="p in products" :key="p.id" class="product-item">
          <span>{{ p.name }} - ${{ p.price }}</span>
          <button @click="addToCart(p)">+</button>
        </div>
      </div>

      <div class="cart" v-if="Object.keys(cart).length > 0">
        <h2>購物車</h2>
        <div class="pickup-row">
          <label>預計領取時間：</label>
          <input type="time" v-model="pickupTime" />
        </div>
        <div class="notes-row">
          <label>備註：</label>
          <textarea v-model="extraNotes" rows="2" placeholder="辣度、餐具數量等"></textarea>
        </div>
        <div v-for="item in Object.values(cart)" :key="item.id">
          {{ item.name }} x {{ item.quantity }}
        </div>
        <hr>
        <p>總金額: ${{ totalPrice() }}</p>
        <button @click="placeOrder" class="order-btn">送出訂單</button>
      </div>
    </div>
  </div>
</template>

<style>
/* 加上一些簡單的樣式 */
.container { padding: 1rem; }
.product-item { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
.cart { margin-top: 1.5rem; border: 1px solid #ccc; padding: 1rem; }
.order-btn { width: 100%; padding: 0.8rem; background-color: #00b900; color: white; border: none; font-size: 1rem; margin-top: 1rem; }
.pickup-row, .notes-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
.notes-row textarea { width: 100%; }
</style>