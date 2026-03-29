// wanted-list.js - Markerar items på Wanted list som finns i inventory

(function() {
  'use strict';

  let inventory = null;
  let processing = false;

  const COLOR_NAME_TO_ID = {
    'black': '11', 'blue': '7', 'bright green': '36', 'bright light blue': '105',
    'bright light orange': '110', 'bright light yellow': '103', 'bright pink': '104',
    'brown': '8', 'coral': '220', 'dark azure': '321', 'dark blue': '63',
    'dark bluish gray': '85', 'dark brown': '120', 'dark gray': '10', 'dark green': '80',
    'dark orange': '68', 'dark pink': '47', 'dark purple': '89', 'dark red': '59',
    'dark tan': '69', 'dark turquoise': '39', 'green': '6', 'lavender': '154',
    'light aqua': '152', 'light bluish gray': '86', 'light gray': '9', 'light green': '38',
    'light pink': '56', 'light purple': '93', 'light salmon': '26', 'light turquoise': '40',
    'light yellow': '33', 'lime': '34', 'magenta': '71', 'medium azure': '156',
    'medium blue': '42', 'medium dark pink': '94', 'medium lavender': '157',
    'medium orange': '31', 'olive green': '155', 'orange': '4', 'pearl gold': '115',
    'pink': '23', 'purple': '24', 'red': '5', 'reddish brown': '88', 'sand blue': '55',
    'sand green': '48', 'tan': '2', 'trans-black': '32', 'trans-bright green': '108',
    'trans-clear': '12', 'trans-dark blue': '14', 'trans-dark pink': '50',
    'trans-green': '20', 'trans-light blue': '15', 'trans-light green': '35',
    'trans-medium blue': '74', 'trans-neon green': '16', 'trans-neon orange': '18',
    'trans-neon yellow': '121', 'trans-orange': '98', 'trans-purple': '51',
    'trans-red': '17', 'trans-yellow': '19', 'white': '1', 'yellow': '3',
    'yellowish green': '158'
  };

  function parseItemUrl(url) {
    try {
      const params = new URLSearchParams(new URL(url, window.location.origin).search);
      let itemType = null, itemNo = null, colorId = null;
      if (params.has('P')) { itemType = 'PART'; itemNo = params.get('P'); }
      else if (params.has('S')) { itemType = 'SET'; itemNo = params.get('S'); }
      else if (params.has('M')) { itemType = 'MINIFIG'; itemNo = params.get('M'); }
      else if (params.has('G')) { itemType = 'GEAR'; itemNo = params.get('G'); }
      else if (params.has('B')) { itemType = 'BOOK'; itemNo = params.get('B'); }
      if (params.has('idColor') || params.has('ColorID')) {
        colorId = params.get('idColor') || params.get('ColorID');
      }
      return { itemType, itemNo, colorId };
    } catch (e) {
      return { itemType: null, itemNo: null, colorId: null };
    }
  }

  function findAllWantedItems() {
    const items = [];
    const links = document.querySelectorAll('a[href*="catalogitem.page"]');

    links.forEach(link => {
      const { itemType, itemNo, colorId: urlColorId } = parseItemUrl(link.href);
      if (!itemType || !itemNo) return;

      const row = link.closest('tr') ||
                  link.closest('div[class*="row"]') ||
                  link.closest('div[class*="item"]') ||
                  link.parentElement;
      if (!row) return;

      let colorId = urlColorId;
      let colorName = null;
      const rowText = row.textContent;

      for (const color of Object.keys(COLOR_NAME_TO_ID)) {
        if (new RegExp(`\\b${color}\\b`, 'i').test(rowText)) {
          colorName = color;
          colorId = COLOR_NAME_TO_ID[color];
          break;
        }
      }

      if (!colorId) {
        const colorLink = row.querySelector('a[href*="idColor"], a[href*="ColorID"]');
        if (colorLink) {
          const m = parseItemUrl(colorLink.href);
          if (m.colorId) { colorId = m.colorId; colorName = colorLink.textContent.trim(); }
        }
      }

      let quantityWanted = 1;
      for (const match of [
        rowText.match(/Qty:\s*(\d+)/i), rowText.match(/Wanted:\s*(\d+)/i),
        rowText.match(/Want:\s*(\d+)/i), rowText.match(/Quantity:\s*(\d+)/i),
        rowText.match(/(\d+)\s*x/i)
      ]) {
        if (match) { quantityWanted = parseInt(match[1]); break; }
      }

      items.push({ itemType, itemNo, colorId, colorName, quantityWanted, link });
    });

    const seen = new Set();
    return items.filter(item => {
      const key = `${item.itemType}-${item.itemNo}-${item.colorId || 'no-color'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getItemInventory(itemType, itemNo, colorId) {
    if (!inventory || !Array.isArray(inventory)) return { found: false, quantity: 0 };
    const matchingItems = inventory.filter(item => {
      if (!item.item || item.item.type !== itemType || item.item.no !== itemNo) return false;
      if (colorId) return item.color_id && item.color_id.toString() === colorId.toString();
      return true;
    });
    if (matchingItems.length === 0) return { found: false, quantity: 0 };
    return { found: true, quantity: matchingItems.reduce((s, i) => s + (i.quantity || 0), 0) };
  }

  // Fyll i ett React-kontrollerat input via nativa prototyp-settern
  function fillReactInput(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(input, value.toString());
    input.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`✅ Have-fält ifyllt med ${value}`);
  }

  // Hitta rätt rad i den aktuella DOM:en för ett givet item och fyll Have-fältet
  function fillHaveFieldForItem(itemNo, colorId, value) {
    // Hitta länken för detta item i nuvarande DOM (React kan ha re-renderat)
    const links = Array.from(document.querySelectorAll('a[href*="catalogitem.page"]'));
    const itemLink = links.find(link => {
      const { itemNo: no } = parseItemUrl(link.href);
      return no === itemNo;
    });

    if (!itemLink) {
      console.warn(`⚠️ Hittade inte länk för ${itemNo} i DOM:en`);
      return;
    }

    const row = itemLink.closest('tr') ||
                itemLink.closest('div[class*="row"]') ||
                itemLink.closest('div[class*="item"]') ||
                itemLink.parentElement;

    if (!row) {
      console.warn('⚠️ Hittade inte rad för item');
      return;
    }

    // Kolla om input redan finns (fältet redan aktiverat)
    const existingInput = row.querySelector('input');
    if (existingInput) {
      fillReactInput(existingInput, value);
      return;
    }

    // Hitta Have-fältet och aktivera det
    let haveTarget = null;

    // Försök 1: BrickLink's wl-hover-editable klass
    for (const el of row.querySelectorAll('.wl-hover-editable')) {
      if (/have/i.test(el.textContent)) { haveTarget = el; break; }
    }

    // Försök 2: cell/div som innehåller "Have" utan att vara en länk
    if (!haveTarget) {
      for (const el of row.querySelectorAll('td, span, div')) {
        if (/\bHave\b/i.test(el.textContent) && !el.querySelector('a') && el.children.length < 3) {
          haveTarget = el;
          break;
        }
      }
    }

    if (!haveTarget) {
      console.warn('⚠️ Hittade inte Have-fältet – loggar rad-HTML:');
      console.log(row.innerHTML.substring(0, 500));
      return;
    }

    // Vänta på att React renderar input-fältet efter klick
    const observer = new MutationObserver((mutations, obs) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const input = node.tagName === 'INPUT' ? node : node.querySelector('input');
          if (input) {
            obs.disconnect();
            setTimeout(() => fillReactInput(input, value), 50);
            return;
          }
        }
      }
    });

    observer.observe(row, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 3000);
    haveTarget.click();
  }

  // Bygg den fasta panelen med Fill-knappar (lever utanför React's DOM)
  function buildFillPanel(matchedItems) {
    // Ta bort eventuell gammal panel
    const old = document.getElementById('bricklink-fill-panel');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = 'bricklink-fill-panel';
    panel.style.cssText = `
      position: fixed !important;
      top: 60px !important;
      right: 16px !important;
      width: 260px !important;
      max-height: 80vh !important;
      overflow-y: auto !important;
      background: #fff !important;
      border: 2px solid #d1d5db !important;
      border-radius: 10px !important;
      box-shadow: 0 6px 20px rgba(0,0,0,0.15) !important;
      z-index: 2147483647 !important;
      font-family: Arial, sans-serif !important;
      font-size: 12px !important;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px 12px !important;
      background: #f9fafb !important;
      border-bottom: 1px solid #e5e7eb !important;
      border-radius: 8px 8px 0 0 !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
    `;
    header.innerHTML = `
      <span style="font-weight:bold;color:#111">⭐ Inventory (${matchedItems.length})</span>
      <button id="bl-panel-close" style="background:none;border:none;cursor:pointer;font-size:16px;color:#888;padding:0">✕</button>
    `;
    panel.appendChild(header);

    // Rader per item
    matchedItems.forEach(item => {
      const row = document.createElement('div');
      row.style.cssText = `
        padding: 7px 12px !important;
        border-bottom: 1px solid #f3f4f6 !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        gap: 6px !important;
      `;

      const isEnough = item.quantityOwned >= item.quantityWanted;
      const badgeColor = isEnough ? '#10b981' : '#f59e0b';
      const badgeText = isEnough
        ? `✓ ${item.quantityOwned}`
        : `⚠ ${item.quantityOwned}/${item.quantityWanted}`;

      row.innerHTML = `
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.itemNo} – ${item.colorName || ''}">
          <strong>${item.itemNo}</strong>
          ${item.colorName ? `<span style="color:#888"> ${item.colorName}</span>` : ''}
        </span>
        <span style="background:${badgeColor};color:white;padding:2px 6px;border-radius:4px;white-space:nowrap;font-weight:bold">
          ${badgeText}
        </span>
      `;

      const fillBtn = document.createElement('button');
      fillBtn.textContent = `Fill ${item.valueToSet}`;
      fillBtn.style.cssText = `
        background: #3b82f6 !important;
        color: white !important;
        border: none !important;
        padding: 4px 8px !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        font-size: 11px !important;
        font-weight: bold !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
      `;
      fillBtn.addEventListener('click', () => {
        fillHaveFieldForItem(item.itemNo, item.colorId, item.valueToSet);
        fillBtn.textContent = '✓';
        fillBtn.style.setProperty('background', '#10b981', 'important');
        setTimeout(() => {
          fillBtn.textContent = `Fill ${item.valueToSet}`;
          fillBtn.style.setProperty('background', '#3b82f6', 'important');
        }, 2000);
      });

      row.appendChild(fillBtn);
      panel.appendChild(row);
    });

    if (matchedItems.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px;color:#888;text-align:center';
      empty.textContent = 'Inga items från wanted list i inventory';
      panel.appendChild(empty);
    }

    document.body.appendChild(panel);

    document.getElementById('bl-panel-close').addEventListener('click', () => panel.remove());

    return panel;
  }

  // Huvudfunktion
  async function processPage() {
    if (processing) return;
    processing = true;

    console.log('⭐ Bricklink Wanted List Checker: Processing wanted list...');

    const result = await chrome.storage.sync.get(['apiKey', 'apiSecret', 'tokenValue', 'tokenSecret']);
    if (!result.apiKey || !result.apiSecret || !result.tokenValue || !result.tokenSecret) {
      console.log('⚠️ API-nycklar saknas');
      processing = false;
      return;
    }

    // Visa laddnings-indikator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'bricklink-loading';
    loadingDiv.style.cssText = `
      position: fixed !important; top: 60px !important; right: 16px !important;
      background: white !important; border: 2px solid #ddd !important;
      border-radius: 8px !important; padding: 12px 16px !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
      z-index: 2147483647 !important; font-family: Arial, sans-serif !important;
      font-size: 13px !important; color: #666 !important;
    `;
    loadingDiv.textContent = '⏳ Hämtar inventory...';
    document.body.appendChild(loadingDiv);

    try {
      let responseReceived = false;
      const timeout = setTimeout(() => {
        if (!responseReceived) {
          loadingDiv.textContent = '⚠️ Timeout';
          setTimeout(() => loadingDiv.remove(), 3000);
          processing = false;
        }
      }, 30000);

      chrome.runtime.sendMessage({ action: 'getFullInventory' }, response => {
        responseReceived = true;
        clearTimeout(timeout);
        loadingDiv.remove();

        if (!response || response.error) {
          console.error('❌', response ? response.error : 'No response');
          processing = false;
          return;
        }

        inventory = response.inventory;
        if (!inventory || !Array.isArray(inventory)) {
          console.error('❌ Ogiltigt inventory');
          processing = false;
          return;
        }

        console.log(`✅ Inventory hämtat: ${inventory.length} items`);

        const items = findAllWantedItems();
        console.log(`🔍 Hittade ${items.length} items i wanted list`);

        const matchedItems = [];

        items.forEach(item => {
          const inv = getItemInventory(item.itemType, item.itemNo, item.colorId);
          if (inv.found) {
            matchedItems.push({
              ...item,
              quantityOwned: inv.quantity,
              valueToSet: inv.quantity >= item.quantityWanted
                ? item.quantityWanted
                : inv.quantity
            });
          }
        });

        console.log(`✅ ${matchedItems.length} items med inventory-matchning`);
        buildFillPanel(matchedItems);
        processing = false;
      });
    } catch (error) {
      console.error('❌', error);
      loadingDiv.remove();
      processing = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processPage);
  } else {
    setTimeout(processPage, 1000);
  }

})();
