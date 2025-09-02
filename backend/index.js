// backend/index.js (Phase 3 - Merged with Printer API)
const express = require('express');
const admin = require('firebase-admin');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

let db;
const app = express();
try {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  db = admin.firestore();
} catch (error) {
  console.error("Critical startup error occurred:", error);
  app.use((req, res, next) => res.status(500).send("Critical startup error"));
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(data) {
  const dataString = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(dataString);
    }
  });
}

wss.on('connection', ws => {
    console.log('A client connected via ws.');
    ws.on('close', () => console.log('A client disconnected.'));
});

app.use(cors());
app.use(express.json());

app.get('/api/products', async (req, res) => {
  try {
    // 修改：返回所有商品，包括售完的，讓前端可以顯示灰階
    const productsSnapshot = await db.collection('products').orderBy('name').get();
    const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).send("Error fetching products");
  }
});

// Admin: 取得所有商品（含上下架狀態）
app.get('/api/admin/products', async (req, res) => {
  try {
    const snapshot = await db.collection('products').orderBy('name').get();
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching all products:', error);
    res.status(500).send('Error fetching all products');
  }
});

// GET /api/admin/product-stats - Get product sales statistics for last 30 days
app.get('/api/admin/product-stats', async (req, res) => {
  try {
    // Last 30 days window
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch orders created in the last 30 days
    const ordersSnapshot = await db.collection('orders')
      .where('createdAt', '>=', thirtyDaysAgo)
      .get();

    const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Fetch products for name/price mapping
    const productsSnapshot = await db.collection('products').get();
    const products = {};
    productsSnapshot.docs.forEach(doc => { products[doc.id] = doc.data(); });

    // Aggregate stats; support orders with embedded items or items subcollection
    const stats = {};
    let totalRevenue = 0;

    // Helper to accumulate an item
    const accumulateItem = (item) => {
      if (!item || !item.productId) return;
      const productId = item.productId;
      const productName = products[productId]?.name || item.name || '未知商品';
      const quantity = parseInt(item.quantity) || 0;
      const price = typeof item.pricePerItem !== 'undefined' ? (parseFloat(item.pricePerItem) || 0) : (products[productId]?.price || 0);

      if (!stats[productId]) {
        stats[productId] = { productId, productName, totalQuantity: 0, totalRevenue: 0 };
      }
      stats[productId].totalQuantity += quantity;
      stats[productId].totalRevenue += quantity * price;
      totalRevenue += quantity * price;
    };

    // For each order, try embedded items first; otherwise fetch from subcollection
    const subcollectionFetches = [];
    for (const order of orders) {
      if (Array.isArray(order.items) && order.items.length > 0) {
        order.items.forEach(accumulateItem);
      } else {
        const p = db.collection('orders').doc(order.id).collection('items').get()
          .then(snap => snap.docs.forEach(d => accumulateItem(d.data())))
          .catch(() => {});
        subcollectionFetches.push(p);
      }
    }

    if (subcollectionFetches.length > 0) {
      await Promise.all(subcollectionFetches);
    }

    // Build sorted array and percentages
    const statsArray = Object.values(stats).sort((a, b) => b.totalQuantity - a.totalQuantity);
    statsArray.forEach(s => { s.percentage = totalRevenue > 0 ? (s.totalRevenue / totalRevenue) * 100 : 0; });

    res.status(200).json(statsArray);
  } catch (error) {
    console.error('Error fetching product stats:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// Admin: 取得所有訂單（含狀態）
app.get('/api/admin/orders', async (req, res) => {
  try {
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
    const orders = [];
    
    for (const doc of snapshot.docs) {
      const orderData = doc.data();
      const itemsSnapshot = await doc.ref.collection('items').get();
      const items = itemsSnapshot.docs.map(itemDoc => itemDoc.data());
      
      orders.push({
        id: doc.id,
        ...orderData,
        items: items,
        createdAt: orderData.createdAt ? orderData.createdAt.toDate ? orderData.createdAt.toDate() : orderData.createdAt : new Date()
      });
    }
    
    res.status(200).json(orders);
  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).send('Error fetching all orders');
  }
});

// GET one admin order with items
app.get('/api/admin/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const docRef = db.collection('orders').doc(orderId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return res.status(404).json({ error: 'Not Found' });
    const orderData = { id: docSnap.id, ...docSnap.data() };

    // Prefer embedded items; otherwise read subcollection
    let items = Array.isArray(orderData.items) ? orderData.items : [];
    if (!items || items.length === 0) {
      const itemsSnap = await docRef.collection('items').get();
      items = itemsSnap.docs.map(d => d.data());
      orderData.items = items;
    }

    return res.status(200).json(orderData);
  } catch (error) {
    console.error('Error fetching single admin order:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// Holidays API: compute current month's weekly off (Mondays) + extra holidays from Firestore
// GET /api/holidays?year=YYYY&month=MM (month 1-12). Defaults to current month
// Return only admin-defined extra holidays for the month
app.get('/api/holidays', async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year || String(now.getFullYear()), 10);
    const month = parseInt(req.query.month || String(now.getMonth() + 1), 10); // 1-12
    const monthZero = month - 1;

    // Query extra holidays stored as documents: { date: 'YYYY-MM-DD', note?: string, createdAt }
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
    const extraSnapshot = await db.collection('holidays').where('date', '>=', monthPrefix + '01').where('date', '<=', monthPrefix + '31').get();
    const extras = extraSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), kind: 'extra' }));

    const list = extras.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    res.status(200).json(list);
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).send('Error fetching holidays');
  }
});

// Admin: add extra holiday { date: 'YYYY-MM-DD', note? }
app.post('/api/admin/holidays', async (req, res) => {
  try {
    const { date, note } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).send('Invalid date, expected YYYY-MM-DD');
    }
    const data = { date: String(date), note: note ? String(note).trim() : '', createdAt: new Date() };
    const ref = await db.collection('holidays').add(data);
    res.status(201).json({ id: ref.id, ...data, kind: 'extra' });
  } catch (error) {
    console.error('Error adding holiday:', error);
    res.status(500).send('Error adding holiday');
  }
});

// Admin: list extra holidays (optionally filter year/month)
app.get('/api/admin/holidays', async (req, res) => {
  try {
    const { year, month } = req.query;
    let snapshot;
    if (year && month) {
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
      snapshot = await db.collection('holidays').where('date', '>=', monthPrefix + '01').where('date', '<=', monthPrefix + '31').get();
    } else {
      snapshot = await db.collection('holidays').orderBy('date', 'desc').limit(100).get();
    }
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), kind: 'extra' }));
    res.status(200).json(items);
  } catch (error) {
    console.error('Error listing holidays:', error);
    res.status(500).send('Error listing holidays');
  }
});

// Admin: delete extra holiday by id
app.delete('/api/admin/holidays/:holidayId', async (req, res) => {
  try {
    const { holidayId } = req.params;
    await db.collection('holidays').doc(holidayId).delete();
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).send('Error deleting holiday');
  }
});

// 客戶查詢訂單狀態（依電話號碼）
app.get('/api/orders/query/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    if (!phone) {
      return res.status(400).send('Phone number is required');
    }
    
    // 查詢該電話號碼的所有訂單（移除排序以避免複合索引需求）
    const snapshot = await db.collection('orders')
      .where('customerPhone', '==', phone)
      .get();
    
    if (snapshot.empty) {
      return res.status(404).json({ message: '找不到此電話號碼的訂單' });
    }
    
    const orders = [];
    for (const doc of snapshot.docs) {
      const orderData = doc.data();
      // 獲取訂單項目
      const itemsSnapshot = await doc.ref.collection('items').get();
      const items = itemsSnapshot.docs.map(itemDoc => itemDoc.data());
      
      orders.push({
        id: doc.id,
        ...orderData,
        items: items,
        createdAt: orderData.createdAt ? orderData.createdAt.toDate ? orderData.createdAt.toDate() : orderData.createdAt : new Date()
      });
    }
    
    // 過濾掉已完成的訂單，只保留進行中的訂單
    const activeOrders = orders.filter(order => order.status !== 'ARCHIVED');
    
    // 在記憶體中按創建時間排序（最新的在前）
    activeOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.status(200).json(activeOrders);
  } catch (error) {
    console.error('Error querying orders by phone:', error);
    res.status(500).send('Error querying orders');
  }
});

// Admin: 新增商品
app.post('/api/admin/products', async (req, res) => {
  try {
    const { name, price, isAvailable } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).send('Invalid name');
    }
    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice < 0) {
      return res.status(400).send('Invalid price');
    }
    const product = {
      name: name.trim(),
      price: numPrice,
      isAvailable: typeof isAvailable === 'boolean' ? isAvailable : true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const ref = await db.collection('products').add(product);
    res.status(201).json({ id: ref.id, ...product });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).send('Error creating product');
  }
});

// Admin: 切換商品是否可售（售完/開啟）
app.patch('/api/products/:productId/availability', async (req, res) => {
  const { productId } = req.params;
  const { isAvailable } = req.body || {};
  if (typeof isAvailable !== 'boolean') {
    return res.status(400).send('Missing boolean isAvailable');
  }
  try {
    const ref = db.collection('products').doc(productId);
    await ref.update({ isAvailable });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`Error updating product ${productId} availability:`, error);
    res.status(500).send('Error updating product availability');
  }
});

// Admin: 刪除商品
app.delete('/api/admin/products/:productId', async (req, res) => {
  const { productId } = req.params;
  try {
    await db.collection('products').doc(productId).delete();
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`Error deleting product ${productId}:`, error);
    res.status(500).send('Error deleting product');
  }
});

// Helper: get or create member by phone
async function getOrCreateMember(phone) {
  const membersCol = db.collection('members');
  const snap = await membersCol.where('phone', '==', phone).limit(1).get();
  if (snap.empty) {
    const newMember = { phone, points: 5000, firstBonusAwarded: true, createdAt: new Date(), updatedAt: new Date() }; // bonus on first online order
    const ref = await membersCol.add(newMember);
    return { id: ref.id, ...newMember, isNew: true };
  } else {
    const doc = snap.docs[0];
    const data = doc.data();
    return { id: doc.id, ...data, isNew: false };
  }
}

// Public: get member points by phone
app.get('/api/members/:phone', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').trim();
    if (!phone) return res.status(400).send('Invalid phone');
    const membersCol = db.collection('members');
    const snap = await membersCol.where('phone', '==', phone).limit(1).get();
    if (snap.empty) return res.status(200).json({ phone, points: 0 });
    const data = snap.docs[0].data();
    res.status(200).json({ phone: data.phone, points: Number(data.points) || 0 });
  } catch (e) {
    console.error('Error fetching member:', e);
    res.status(500).send('Error fetching member');
  }
});

app.post('/api/orders', async (req, res) => {
  const { customerName, customerPhone, items, notes, pickupTime, redeemWangZiMian } = req.body;
  if (!customerName || !customerPhone || !items || items.length === 0) {
    return res.status(400).send('Invalid order data (customerPhone is required)');
  }
  try {
    // Validate products & total
    const productIds = items.map(item => db.collection('products').doc(item.id));
    const productDocs = await db.getAll(...productIds);
    let calculatedTotalPrice = 0;
    const validatedItems = [];
    for (let i = 0; i < productDocs.length; i++) {
      const doc = productDocs[i];
      if (!doc.exists) throw new Error(`Product with ID ${items[i].id} not found.`);
      const productData = doc.data();
      const quantity = items[i].quantity;
      const price = productData.price;
      calculatedTotalPrice += price * quantity;
      validatedItems.push({ productId: doc.id, name: productData.name, quantity: quantity, pricePerItem: price });
    }

    // Member points
    const member = await getOrCreateMember(String(customerPhone).trim());
    // If existing member without first bonus, grant it now (first online order bonus)
    if (!member.isNew && !member.firstBonusAwarded) {
      const memberRef = db.collection('members').doc(member.id);
      const newPts = (Number(member.points) || 0) + 5000;
      await memberRef.update({ points: newPts, firstBonusAwarded: true, updatedAt: new Date() });
      member.points = newPts;
      member.firstBonusAwarded = true;
    }

    let finalNotesAppend = '';

    // Redemption: allow 100 points to exchange for free 王子麵 when total>=200
    let redeemed = false;
    if (redeemWangZiMian === true && calculatedTotalPrice >= 200 && (Number(member.points) || 0) >= 100) {
      // Deduct points and add free item
      redeemed = true;
      const memberRef = db.collection('members').doc(member.id);
      await memberRef.update({ points: Number(member.points) - 100, updatedAt: new Date() });
      member.points = Number(member.points) - 100;
      validatedItems.push({ productId: 'FREE_WANG_ZI_NOODLES', name: '王子麵（贈品）', quantity: 1, pricePerItem: 0 });
      finalNotesAppend = '（使用 100 點兌換王子麵）';
    }

    const orderNumber = customerPhone.length > 6 ? customerPhone.slice(-6) : customerPhone;

    // Derive pickupAt (Date) if client provided pickupTime like "YYYY-MM-DD HH:mm"
    let normalizedPickupSegment = '';
    let pickupAt = undefined;
    if (pickupTime) {
      const pickupStr = String(pickupTime).trim();
      // try parse full datetime first
      const isoTry = pickupStr.replace(' ', 'T');
      const dt = new Date(isoTry);
      if (!isNaN(dt.getTime())) {
        pickupAt = dt;
      }
      // extract time for notes
      const timeMatch = pickupStr.match(/\b(\d{1,2}:\d{2})\b/);
      const timeOnly = timeMatch ? timeMatch[1] : pickupStr;
      normalizedPickupSegment = `預計 ${timeOnly} 領取`;
    }
    const combinedNotesBase = (normalizedPickupSegment || '') + (notes ? (normalizedPickupSegment ? ' | ' : '') + notes : '');
    const combinedNotes = combinedNotesBase + (finalNotesAppend ? ` ${finalNotesAppend}` : '');

    const orderData = { 
        customerName, 
        customerPhone, 
        totalPrice: calculatedTotalPrice, 
        status: 'PENDING', 
        createdAt: new Date(), 
        orderNumber: orderNumber, 
        notes: combinedNotes,
        isPrinted: false,
        redeemedWangZiMian: redeemed,
        ...(pickupAt ? { pickupAt } : {})
    };
    const orderRef = await db.collection('orders').add(orderData);
    const batch = db.batch();
    const itemsRef = orderRef.collection('items');
    for (const item of validatedItems) {
      const itemRef = itemsRef.doc();
      batch.set(itemRef, item);
    }
    await batch.commit();
    const fullOrder = { id: orderRef.id, ...orderData, items: validatedItems };

    try {
      broadcast({ type: 'new_order', payload: fullOrder });
      console.log(`New order ${orderRef.id} (Order No: ${orderNumber}) pushed via ws.`);
    } catch (wsError) {
      console.log(`WebSocket notification failed for order ${orderRef.id}, but order was saved successfully.`);
    }

    res.status(201).json({ success: true, orderId: orderRef.id, calculatedTotal: calculatedTotalPrice, memberPoints: member.points });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).send('Error creating order');
  }
});

app.patch('/api/orders/:orderId/status', async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).send('Missing new status');
  try {
    const orderRef = db.collection('orders').doc(orderId);
    await orderRef.update({ status: status });
    console.log(`Order ${orderId} status updated to ${status}`);
    res.status(200).json({ success: true, message: `Order ${orderId} updated to ${status}` });
  } catch (error) {
    console.error(`Error updating order ${orderId}:`, error);
    res.status(500).send('Error updating order status');
  }
});

app.get('/api/orders/archived', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Avoid composite index: query by status only, filter and sort in memory
    const snap = await db.collection('orders')
      .where('status', '==', 'ARCHIVED')
      .get();

    const archived = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Normalize createdAt, filter last 30 days, sort desc by createdAt
    const normalize = (ts) => {
      if (!ts) return undefined;
      if (typeof ts?.toDate === 'function') { try { return ts.toDate(); } catch { return undefined; } }
      if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
      if (typeof ts?._seconds === 'number') return new Date(ts._seconds * 1000);
      const d = new Date(ts);
      return isNaN(d.getTime()) ? undefined : d;
    };

    const result = archived
      .map(o => ({ ...o, createdAt: normalize(o.createdAt) }))
      .filter(o => o.createdAt && o.createdAt >= thirtyDaysAgo)
      .sort((a, b) => b.createdAt - a.createdAt);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching archived orders:', error);
    res.status(500).send('Error fetching archived orders');
  }
});

// --- ✅ 新增給 Printer Bridge 使用的 API START ---
// GET /api/orders/pending-print - 現在會取得所有「新進訂單(PENDING)」且尚未列印的訂單
app.get('/api/orders/pending-print', async (req, res) => {
  try {
    const snapshot = await db.collection('orders')
      .where('status', '==', 'PENDING') // <--- 從 'IN_PROGRESS' 改為 'PENDING'
      .where('isPrinted', '==', false)
      .get();
      
    if (snapshot.empty) {
      return res.status(200).json([]);
    }

    const ordersPromises = snapshot.docs.map(async (doc) => {
      const orderData = doc.data();
      const itemsSnapshot = await db.collection('orders').doc(doc.id).collection('items').get();
      const items = itemsSnapshot.docs.map(itemDoc => itemDoc.data());
      return { id: doc.id, ...orderData, items };
    });

    const ordersWithItems = await Promise.all(ordersPromises);
    res.status(200).json(ordersWithItems);

  } catch (error) {
    console.error('Error fetching orders for printing:', error);
    res.status(500).send('Error fetching orders for printing');
  }
});

app.post('/api/orders/:orderId/mark-as-printed', async (req, res) => {
    const { orderId } = req.params;
    try {
        const orderRef = db.collection('orders').doc(orderId);
        await orderRef.update({ isPrinted: true });
        console.log(`Order ${orderId} marked as printed.`);
        res.status(200).json({ success: true, message: `Order ${orderId} marked as printed.`});
    } catch (error) {
        console.error(`Error marking order ${orderId} as printed:`, error);
        res.status(500).send('Error marking order as printed');
    }
});
// --- ✅ 新增給 Printer Bridge 使用的 API END ---

const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`Server with 'ws' library listening on port ${port}`);
});