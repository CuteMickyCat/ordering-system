import { createRouter, createWebHistory } from 'vue-router'
import OrderForm from './components/OrderForm.vue'
import FoodIntro from './components/FoodIntro.vue'

const routes = [
  { path: '/', name: 'home', component: OrderForm },
  { path: '/food', name: 'food', component: FoodIntro }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})
