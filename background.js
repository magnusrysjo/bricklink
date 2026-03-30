// background.js - Med fullständig OAuth 1.0a implementering

// ============================================
// Cache Management Variables
// ============================================

const CACHE_DURATION = 5 * 60 * 1000; // 5 minuter
let inventoryCache = null;
let cacheTimestamp = null;

// ============================================
// OAuth 1.0a Helper Functions
// ============================================

function generateNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function getTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

function oauthEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

function sortAndFormatParams(params) {
  return Object.keys(params)
    .sort()
    .map(key => `${oauthEncode(key)}=${oauthEncode(params[key])}`)
    .join('&');
}

function createSignatureBaseString(method, url, params) {
  const baseUrl = url.split('?')[0];
  const paramString = sortAndFormatParams(params);
  return [
    method.toUpperCase(),
    oauthEncode(baseUrl),
    oauthEncode(paramString)
  ].join('&');
}

function createSigningKey(consumerSecret, tokenSecret) {
  return `${oauthEncode(consumerSecret)}&${oauthEncode(tokenSecret || '')}`;
}

async function hmacSha1(message, key) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function createOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
  const baseString = createSignatureBaseString(method, url, params);
  const signingKey = createSigningKey(consumerSecret, tokenSecret);
  return await hmacSha1(baseString, signingKey);
}

async function createAuthorizationHeader(method, url, credentials, additionalParams = {}) {
  const oauthParams = {
    oauth_consumer_key: credentials.apiKey,
    oauth_token: credentials.tokenValue,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: getTimestamp(),
    oauth_nonce: generateNonce(),
    oauth_version: '1.0'
  };

  const allParams = { ...oauthParams, ...additionalParams };

  const signature = await createOAuthSignature(
    method, url, allParams,
    credentials.apiSecret, credentials.tokenSecret
  );

  oauthParams.oauth_signature = signature;

  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(key => `${oauthEncode(key)}="${oauthEncode(oauthParams[key])}"`)
    .join(', ');
}

// ============================================
// Bricklink API Functions
// ============================================

// body används för PUT-anrop (JSON-objekt). Ingår ej i OAuth-signaturen
// eftersom Content-Type är application/json (inte form-urlencoded).
async function makeApiRequest(method, endpoint, credentials, body = null) {
  const baseUrl = 'https://api.bricklink.com/api/store/v1';
  const url = `${baseUrl}${endpoint}`;

  try {
    console.log(`🌐 Making API request: ${method} ${endpoint}`);
    const startTime = Date.now();

    const urlObj = new URL(url);
    const queryParams = {};
    urlObj.searchParams.forEach((value, key) => { queryParams[key] = value; });

    const authHeader = await createAuthorizationHeader(method, url, credentials, queryParams);

    const fetchOptions = {
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    };
    if (body !== null) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    console.log(`🌐 Fetch completed in ${Date.now() - startTime}ms (status: ${response.status})`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error ${response.status}:`, errorText);
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    // DELETE returnerar tom body
    if (method === 'DELETE') return {};

    const data = await response.json();
    console.log(`✅ API request completed in ${Date.now() - startTime}ms total`);
    return data;

  } catch (error) {
    console.error('❌ API request error:', error);
    throw error;
  }
}

async function fetchInventory(credentials) {
  const response = await makeApiRequest('GET', '/inventories', credentials);
  const inventory = response.data || [];
  console.log(`📦 Received ${inventory.length} inventory items`);
  return inventory;
}

async function checkInventoryInBackground(itemType, itemNo) {
  try {
    const credentials = await chrome.storage.sync.get(['apiKey','apiSecret','tokenValue','tokenSecret']);
    if (!credentials.apiKey || !credentials.apiSecret ||
        !credentials.tokenValue || !credentials.tokenSecret) {
      return { error: 'API credentials not configured' };
    }

    const inventory = await fetchInventory(credentials);
    const matchingItems = inventory.filter(item =>
      item.item && item.item.type === itemType && item.item.no === itemNo
    );

    if (matchingItems.length > 0) {
      const totalQuantity = matchingItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const colorGroups = {};
      matchingItems.forEach(item => {
        const colorId = item.color_id || 0;
        if (!colorGroups[colorId]) {
          colorGroups[colorId] = { colorId, colorName: item.color_name || 'Ingen färg', quantity: 0, entries: 0 };
        }
        colorGroups[colorId].quantity += item.quantity || 0;
        colorGroups[colorId].entries += 1;
      });
      const colors = Object.values(colorGroups).sort((a, b) => b.quantity - a.quantity);
      return { found: true, quantity: totalQuantity, entries: matchingItems.length, colors };
    }
    return { found: false };
  } catch (error) {
    return { error: error.message, details: 'Se console för mer information' };
  }
}

// Minska antalet i inventory för en lista av items.
// items: [{ itemType, itemNo, colorId, quantityToRemove }]
async function updateInventoryQuantities(items) {
  const credentials = await chrome.storage.sync.get(['apiKey','apiSecret','tokenValue','tokenSecret']);
  if (!credentials.apiKey || !credentials.apiSecret ||
      !credentials.tokenValue || !credentials.tokenSecret) {
    return { error: 'API credentials not configured' };
  }

  // Se till att vi har ett färskt inventory med inventory_id
  if (!inventoryCache) {
    inventoryCache = await fetchInventory(credentials);
    cacheTimestamp = Date.now();
  }

  let updatedCount = 0;
  const errors = [];

  for (const item of items) {
    const { itemType, itemNo, colorId, quantityToRemove } = item;

    // Hitta alla inventory-poster för detta item + färg
    const entries = inventoryCache.filter(inv => {
      if (!inv.item || inv.item.type !== itemType || inv.item.no !== itemNo) return false;
      if (colorId) return inv.color_id && inv.color_id.toString() === colorId.toString();
      return true;
    });

    if (entries.length === 0) {
      console.log(`⚠️ Inga inventory-poster för ${itemType} ${itemNo} färg ${colorId}`);
      continue;
    }

    let remaining = quantityToRemove;

    for (const entry of entries) {
      if (remaining <= 0) break;

      const toRemove = Math.min(remaining, entry.quantity);
      const newQuantity = entry.quantity - toRemove;

      try {
        if (newQuantity === 0) {
          await makeApiRequest('DELETE', `/inventories/${entry.inventory_id}`, credentials);
          console.log(`🗑️ Tog bort inventory-post ${entry.inventory_id} (${itemNo})`);
        } else {
          await makeApiRequest('PUT', `/inventories/${entry.inventory_id}`, credentials, { quantity: -toRemove });
          console.log(`✏️ Uppdaterade ${itemNo}: ${entry.quantity} → ${entry.quantity - toRemove}`);
        }
        remaining -= toRemove;
        updatedCount++;
      } catch (e) {
        console.error(`❌ Fel vid uppdatering av ${itemNo}:`, e);
        errors.push(`${itemNo}: ${e.message}`);
      }
    }
  }

  // Invalidera cache så nästa anrop hämtar färska data
  inventoryCache = null;
  cacheTimestamp = null;

  return { updatedCount, errors };
}

// ============================================
// Message Listener
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.action);

  if (request.action === 'checkInventory') {
    (async () => {
      try { sendResponse(await checkInventoryInBackground(request.itemType, request.itemNo)); }
      catch (error) { sendResponse({ error: error.message }); }
    })();
    return true;
  }

  if (request.action === 'testApi') {
    (async () => {
      try { sendResponse(await testApiConnection()); }
      catch (error) { sendResponse({ error: error.message }); }
    })();
    return true;
  }

  if (request.action === 'getFullInventory') {
    (async () => {
      try { sendResponse(await getFullInventoryForList()); }
      catch (error) { sendResponse({ error: error.message }); }
    })();
    return true;
  }

  if (request.action === 'updateInventoryQuantities') {
    (async () => {
      try { sendResponse(await updateInventoryQuantities(request.items)); }
      catch (error) { sendResponse({ error: error.message }); }
    })();
    return true;
  }

  sendResponse({ error: 'Unknown action' });
  return false;
});

async function testApiConnection() {
  try {
    const credentials = await chrome.storage.sync.get(['apiKey','apiSecret','tokenValue','tokenSecret']);
    if (!credentials.apiKey) return { success: false, message: 'API credentials not configured' };
    const response = await makeApiRequest('GET', '/inventories?item_type=PART', credentials);
    return { success: true, message: 'API connection successful!', itemCount: response.data ? response.data.length : 0 };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function getFullInventoryForList() {
  try {
    const credentials = await chrome.storage.sync.get(['apiKey','apiSecret','tokenValue','tokenSecret']);
    if (!credentials.apiKey || !credentials.apiSecret ||
        !credentials.tokenValue || !credentials.tokenSecret) {
      return { error: 'API credentials not configured' };
    }
    // Hämta alltid färsk data vid sidladdning och uppdatera cachen
    inventoryCache = await fetchInventory(credentials);
    cacheTimestamp = Date.now();
    return { inventory: inventoryCache };
  } catch (error) {
    return { error: error.message };
  }
}

async function getCachedInventory(credentials) {
  const now = Date.now();
  if (inventoryCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('📦 Using cached inventory');
    return inventoryCache;
  }
  console.log('🌐 Fetching fresh inventory from API');
  inventoryCache = await fetchInventory(credentials);
  cacheTimestamp = now;
  console.log(`✅ Fresh inventory cached: ${inventoryCache.length} items`);
  return inventoryCache;
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && (changes.apiKey || changes.tokenValue)) {
    console.log('🔄 Credentials changed, clearing cache');
    inventoryCache = null;
    cacheTimestamp = null;
  }
});
