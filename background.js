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

// Generera random nonce
function generateNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

// Få Unix timestamp
function getTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

// URL encode enligt OAuth spec
function oauthEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

// Sortera och formatera parametrar
function sortAndFormatParams(params) {
  return Object.keys(params)
    .sort()
    .map(key => `${oauthEncode(key)}=${oauthEncode(params[key])}`)
    .join('&');
}

// Skapa signature base string
function createSignatureBaseString(method, url, params) {
  const baseUrl = url.split('?')[0];
  const paramString = sortAndFormatParams(params);
  
  return [
    method.toUpperCase(),
    oauthEncode(baseUrl),
    oauthEncode(paramString)
  ].join('&');
}

// Skapa signing key
function createSigningKey(consumerSecret, tokenSecret) {
  return `${oauthEncode(consumerSecret)}&${oauthEncode(tokenSecret || '')}`;
}

// HMAC-SHA1 signering
async function hmacSha1(message, key) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  
  // Konvertera till base64
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  
  return signatureBase64;
}

// Skapa OAuth signature
async function createOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
  const baseString = createSignatureBaseString(method, url, params);
  const signingKey = createSigningKey(consumerSecret, tokenSecret);
  return await hmacSha1(baseString, signingKey);
}

// Skapa OAuth Authorization header
async function createAuthorizationHeader(method, url, credentials, additionalParams = {}) {
  const oauthParams = {
    oauth_consumer_key: credentials.apiKey,
    oauth_token: credentials.tokenValue,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: getTimestamp(),
    oauth_nonce: generateNonce(),
    oauth_version: '1.0'
  };
  
  // Kombinera OAuth params med eventuella query params
  const allParams = { ...oauthParams, ...additionalParams };
  
  // Skapa signatur
  const signature = await createOAuthSignature(
    method,
    url,
    allParams,
    credentials.apiSecret,
    credentials.tokenSecret
  );
  
  oauthParams.oauth_signature = signature;
  
  // Bygg Authorization header
  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(key => `${oauthEncode(key)}="${oauthEncode(oauthParams[key])}"`)
    .join(', ');
  
  return authHeader;
}

// ============================================
// Bricklink API Functions
// ============================================

async function makeApiRequest(method, endpoint, credentials) {
  const baseUrl = 'https://api.bricklink.com/api/store/v1';
  const url = `${baseUrl}${endpoint}`;
  
  try {
    console.log(`🌐 Making API request: ${method} ${endpoint}`);
    const startTime = Date.now();
    
    // Extrahera query parameters från URL om de finns
    const urlObj = new URL(url);
    const queryParams = {};
    urlObj.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    
    // Skapa Authorization header
    console.log('🔐 Creating OAuth signature...');
    const authHeader = await createAuthorizationHeader(
      method,
      url,
      credentials,
      queryParams
    );
    
    const signatureTime = Date.now() - startTime;
    console.log(`✅ OAuth signature created in ${signatureTime}ms`);
    
    const fetchStartTime = Date.now();
    const response = await fetch(url, {
      method: method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });
    
    const fetchTime = Date.now() - fetchStartTime;
    console.log(`🌐 Fetch completed in ${fetchTime}ms (status: ${response.status})`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error ${response.status}:`, errorText);
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    const totalTime = Date.now() - startTime;
    console.log(`✅ API request completed in ${totalTime}ms total`);
    
    return data;
    
  } catch (error) {
    console.error('❌ API request error:', error);
    throw error;
  }
}

// Hämta hela inventory från Bricklink
async function fetchInventory(credentials) {
  try {
    console.log('🌐 Fetching inventory from Bricklink API...');
    const startTime = Date.now();
    
    const response = await makeApiRequest('GET', '/inventories', credentials);
    
    const duration = Date.now() - startTime;
    console.log(`✅ API request completed in ${duration}ms`);
    
    const inventory = response.data || [];
    console.log(`📦 Received ${inventory.length} inventory items`);
    
    return inventory;
  } catch (error) {
    console.error('❌ Failed to fetch inventory:', error);
    throw error;
  }
}

// Kolla om ett specifikt item finns i inventory
async function checkInventoryInBackground(itemType, itemNo) {
  try {
    // Hämta credentials
    const credentials = await chrome.storage.sync.get([
      'apiKey',
      'apiSecret',
      'tokenValue',
      'tokenSecret'
    ]);
    
    if (!credentials.apiKey || !credentials.apiSecret || 
        !credentials.tokenValue || !credentials.tokenSecret) {
      return { error: 'API credentials not configured' };
    }
    
    console.log(`Checking inventory for ${itemType} ${itemNo}`);
    
    // Hämta inventory från API
    const inventory = await fetchInventory(credentials);
    
    // Sök efter item i inventory
    const matchingItems = inventory.filter(item => {
      return item.item && 
             item.item.type === itemType && 
             item.item.no === itemNo;
    });
    
    if (matchingItems.length > 0) {
      // Räkna totalt antal
      const totalQuantity = matchingItems.reduce((sum, item) => {
        return sum + (item.quantity || 0);
      }, 0);
      
      // Gruppera efter färg och samla info
      const colorGroups = {};
      matchingItems.forEach(item => {
        const colorId = item.color_id || 0;
        const colorName = item.color_name || 'Ingen färg';
        const quantity = item.quantity || 0;
        
        if (!colorGroups[colorId]) {
          colorGroups[colorId] = {
            colorId: colorId,
            colorName: colorName,
            quantity: 0,
            entries: 0
          };
        }
        
        colorGroups[colorId].quantity += quantity;
        colorGroups[colorId].entries += 1;
      });
      
      // Konvertera till array och sortera efter antal (högst först)
      const colors = Object.values(colorGroups).sort((a, b) => b.quantity - a.quantity);
      
      console.log(`Found ${matchingItems.length} entries with total quantity: ${totalQuantity}`);
      console.log('Colors:', colors);
      
      return {
        found: true,
        quantity: totalQuantity,
        entries: matchingItems.length,
        colors: colors
      };
    }
    
    console.log('Item not found in inventory');
    return { found: false };
    
  } catch (error) {
    console.error('Error checking inventory:', error);
    return { 
      error: error.message,
      details: 'Se console för mer information'
    };
  }
}

// ============================================
// Message Listener
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.action);
  
  if (request.action === 'checkInventory') {
    // Wrapper för att säkerställa att vi svarar
    (async () => {
      try {
        const result = await checkInventoryInBackground(request.itemType, request.itemNo);
        console.log('✅ checkInventory result:', result);
        sendResponse(result);
      } catch (error) {
        console.error('❌ checkInventory error:', error);
        sendResponse({ error: error.message });
      }
    })();
    return true; // Håller meddelande-kanalen öppen för async svar
  }
  
  if (request.action === 'testApi') {
    (async () => {
      try {
        const result = await testApiConnection();
        console.log('✅ testApi result:', result);
        sendResponse(result);
      } catch (error) {
        console.error('❌ testApi error:', error);
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }
  
  if (request.action === 'getFullInventory') {
    console.log('📦 getFullInventory action triggered');
    
    // Wrapper för att säkerställa att vi svarar
    (async () => {
      try {
        const result = await getFullInventoryForList();
        console.log('✅ getFullInventory result:', result ? `${result.inventory?.length || 0} items` : 'error');
        sendResponse(result);
      } catch (error) {
        console.error('❌ getFullInventory catch error:', error);
        sendResponse({ error: error.message });
      }
    })();
    
    return true; // VIKTIGT: Håller kanalen öppen
  }
  
  console.warn('⚠️ Unknown action:', request.action);
  sendResponse({ error: 'Unknown action' });
  return false;
});

// Test API connection
async function testApiConnection() {
  try {
    const credentials = await chrome.storage.sync.get([
      'apiKey',
      'apiSecret',
      'tokenValue',
      'tokenSecret'
    ]);
    
    if (!credentials.apiKey) {
      return { success: false, message: 'API credentials not configured' };
    }
    
    // Testa med ett enkelt API-anrop
    const response = await makeApiRequest('GET', '/inventories?item_type=PART', credentials);
    
    return { 
      success: true, 
      message: 'API connection successful!',
      itemCount: response.data ? response.data.length : 0
    };
  } catch (error) {
    return { 
      success: false, 
      message: error.message 
    };
  }
}

// Hämta hela inventory för list-checking
async function getFullInventoryForList() {
  try {
    console.log('📦 getFullInventoryForList called');
    
    const credentials = await chrome.storage.sync.get([
      'apiKey',
      'apiSecret',
      'tokenValue',
      'tokenSecret'
    ]);
    
    if (!credentials.apiKey || !credentials.apiSecret || 
        !credentials.tokenValue || !credentials.tokenSecret) {
      console.error('❌ API credentials not configured');
      return { error: 'API credentials not configured' };
    }
    
    console.log('✅ Credentials found, fetching inventory...');
    
    // Använd cache om tillgänglig (funktionen definierad längre ner)
    const inventory = await getCachedInventory(credentials);
    
    console.log(`✅ Inventory fetched: ${inventory ? inventory.length : 0} items`);
    
    return { inventory: inventory };
    
  } catch (error) {
    console.error('❌ Error in getFullInventoryForList:', error);
    return { error: error.message };
  }
}

// ============================================
// Cache Management
// ============================================

// Hämta cached inventory eller hämta ny
async function getCachedInventory(credentials) {
  const now = Date.now();
  
  if (inventoryCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('📦 Using cached inventory');
    return inventoryCache;
  }
  
  console.log('🌐 Fetching fresh inventory from API');
  try {
    inventoryCache = await fetchInventory(credentials);
    cacheTimestamp = now;
    console.log(`✅ Fresh inventory cached: ${inventoryCache.length} items`);
    return inventoryCache;
  } catch (error) {
    console.error('❌ Error fetching inventory:', error);
    throw error;
  }
}

// Rensa cache när credentials ändras
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && (changes.apiKey || changes.tokenValue)) {
    console.log('🔄 Credentials changed, clearing cache');
    inventoryCache = null;
    cacheTimestamp = null;
  }
});