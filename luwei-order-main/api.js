(function (global) {
    const BASE = global.API_BASE_URL || "";
  
    async function getJson(url) {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error(`GET ${url} failed`);
      return res.json();
    }
  
    async function postJson(url, data) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "omit",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`POST ${url} failed: ${t}`);
      }
      return res.json().catch(() => ({}));
    }
  
    async function fetchProducts() {
      // 回傳格式: [{ id, name, price }]
      return getJson(`${BASE}/api/products`);
    }
  
    async function createOrder({ customerName, customerPhone, items, notes, pickupTime }) {
      // items 需為: [{ id, quantity }]
      return postJson(`${BASE}/api/orders`, {
        customerName,
        customerPhone,
        items,
        notes: notes || "",
        pickupTime: pickupTime || ""
      });
    }
  
    global.OrderAPI = { fetchProducts, createOrder };
  })(window);