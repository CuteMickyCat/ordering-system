<template>
  <div class="food-intro">
    <header class="hero" :style="{ backgroundImage: `url(${imgHero})` }">
      <div class="hero-content">
        <h1>水最美・熊哥滷味</h1>
        <p class="subtitle">一碗好湯、一道好味，來自每天的堅持。</p>
      </div>
    </header>

    <section class="story card holiday">
      <h2>休假公告</h2>
      <p class="note">以下為本月預定公休日，若遇臨時調整會於此更新，敬請見諒。</p>
      <ul class="holiday-list">
        <li v-for="h in holidays" :key="h.date + (h.id || '')">
          <span class="date">{{ h.date }}</span>
          <span v-if="h.kind==='weekly'">（每週一固定公休）</span>
          <span v-else-if="h.note">— {{ h.note }}</span>
        </li>
        <li v-if="holidays.length===0">本月尚無休假資訊</li>
      </ul>
    </section>

    <section class="features grid">
      <div class="card">
        <h3>嚴選食材</h3>
        <p>使用的食材均為台灣在地食材，新鮮又安心。每天採買，當天備料；賣完就收，不隔夜。</p>
      </div>
      <div class="card">
        <h3>黃金比例滷汁</h3>
        <p>多種香料細火慢滷，鹹香平衡、回甘耐吃。</p>
      </div>
      <div class="card">
        <h3>現點現燙</h3>
        <p>接單後現燙，保持最佳口感與溫度。</p>
      </div>
    </section>

    <section class="signature card">
      <h2>招牌必點</h2>
      <ul>
        <li>甜不辣（外Q內軟，吸滿滷汁）</li>
        <li>豆干（扎實彈牙，越嚼越香）</li>
        <li>米血糕（軟糯綿密，人氣王）</li>
        <li>雞翅（入味多汁，吮指回味）</li>
      </ul>
    </section>

    <section class="card demon-slayer">
      <h2>小劇場｜鬼殺隊的深夜滷味</h2>
      <div class="demon-row">
        <div class="demon-text">
          <p>
            熊哥從小在傳統市場長大，跟著媽媽學會挑菜、備料與入味的祕訣。
            多年後，他把記憶裡的味道帶回來，每天只選新鮮食材，慢火熬煮滷汁，
            用最單純的方式，做出每一份安心的滷味。
          </p>
          <p>
            傍晚收攤前，熊哥總會留下一鍋滷汁，等著那群總在夜裡奔走的客人——鬼殺隊。
            炭治郎最愛米血糕的柔軟與回甘，彌豆子則偏好吸滿滷汁的甜不辣；
            伊之助每次都豪邁加點雞翅，說是補充體力最有感；
            善逸嘴上說怕黑，但對滷豆干的香氣總是毫無抵抗力，邊吃邊碎念：「有這個，我就有勇氣了。」
          </p>
          <p>
            因為煮給隊員們吃，慢慢學會了滷之呼吸。
          </p>
          <p>
            熊哥說，做吃的，就像他們守護人們一樣——要專注、要誠實，也要每天反覆練習。
            一鍋滷味，讓出任務的人在回程的路上，能記起家的味道，這就夠了。
          </p>
        </div>
        <img :src="imgDemon" alt="鬼殺隊深夜滷味" class="demon-img" loading="lazy" />
      </div>
    </section>

    <!-- 圖片集 -->
    <section class="gallery">
      <div class="card">
        <h2>料理故事・照片集</h2>
        <div class="gallery-grid">
          <figure class="gallery-item">
            <img
              :src="img2"
              alt="熊哥滷味料理照片"
              loading="lazy"
            />
            <figcaption>黃金比例滷汁，溫潤入味、回甘不膩。</figcaption>
          </figure>
        </div>
      </div>
    </section>

    <footer class="cta">
      <router-link class="btn" to="/"> ↩ 回到線上下單</router-link>
    </footer>
  </div>
</template>

<script setup>
import imgHero from '../assets/Gemini_Generated_Image_s1oz1ss1oz1ss1oz_new.png'
import imgDemon from '../assets/Gemini_Generated_Image_cofvtecofvtecofv.png'
import img2 from '../assets/Gemini_Generated_Image_707zd2707zd2707z.png'
import { ref, onMounted } from 'vue'

const holidays = ref([])
function yyyymm() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth()+1 }
}
async function loadHolidays() {
  try {
    const { y, m } = yyyymm()
    const res = await fetch(`${window.API_BASE_URL || ''}/api/holidays?year=${y}&month=${m}`)
    if (!res.ok) throw new Error('fetch holidays failed')
    holidays.value = await res.json()
  } catch (e) {
    console.warn('holidays load failed', e)
    holidays.value = []
  }
}
onMounted(loadHolidays)
</script>

<style scoped>
.food-intro { max-width: 960px; margin: 0 auto; width:98% }
.hero { 
  position: relative;
  text-align: left; 
  padding: 3rem 1rem; 
  background-repeat: no-repeat; 
  background-position: right center; 
  background-size: 36% auto; 
  overflow: hidden;
}

.hero::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.66) 30%, rgba(255,255,255,0) 60%);
  pointer-events: none;
}
.hero-content { position: relative; max-width: 560px; }
.hero h1 { margin: 0 0 0.5rem; font-size: clamp(1.5rem, 2.2vw + 1rem, 2.25rem); color: #111827; letter-spacing: 0.3px; }
.hero .subtitle { margin: 0; color: #374151; font-size: clamp(0.95rem, 0.6vw + 0.8rem, 1.125rem); line-height: 1.65; }

.card { box-shadow: 0 0 2px 2px rgba(0, 0, 0, 0.06);background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1rem; margin:5px 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 1rem; }

/* 小劇場圖片靠右 */
.demon-slayer .demon-img { display: block; margin-left: auto; width: min(60%, 520px); border-radius: 12px; }
.demon-row { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
.demon-text { flex: 1 1 280px; }

/* 圖片集樣式 */
.gallery .gallery-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px,1fr)); gap: 1rem; }
.gallery-item { margin: 0; }
.gallery-item img { width: 100%; height: auto; border-radius: 10px; display: block; }
.gallery-item figcaption { margin-top: 0.5rem; color: #4b5563; font-size: 0.95rem; }

/* 每月休假公告 */
.holiday .note { color: #6b7280; margin: 0.25rem 0 0.75rem; }
.holiday-list { margin: 0; padding-left: 1rem; }
.holiday-list li { margin: 0.25rem 0; }
.holiday .date { background: #fef3c7; color: #92400e; padding: 0.1rem 0.35rem; border-radius: 6px; }

@media (max-width: 640px) {
  .hero {
    padding: 0; 
    overflow: visible; 
    background-size: contain;
  }
  .hero p{width:48%;}
  .hero-content { max-width: 100%; }
  .hero h1 { line-height: 1.35; word-break: break-word; white-space: normal; }
  .grid{gap:0}
}
footer .btn{float:right}
.btn {display: inline-block; background: #739e38; color: #fff; padding: 0.6rem 20px; border-radius: 45px; text-decoration: none;border:none; }
.btn:hover { background: #4338ca; }
</style>
