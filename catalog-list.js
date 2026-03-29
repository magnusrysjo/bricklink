// catalog-list.js - Markerar items på listsidor som finns i inventory

(function() {
  'use strict';

  let inventory = null;
  let processing = false;

  // Extrahera item-typ och nummer från URL
  function parseItemUrl(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const params = new URLSearchParams(urlObj.search);
      
      let itemType = null;
      let itemNo = null;
      
      if (params.has('P')) {
        itemType = 'PART';
        itemNo = params.get('P');
      } else if (params.has('S')) {
        itemType = 'SET';
        itemNo = params.get('S');
      } else if (params.has('M')) {
        itemType = 'MINIFIG';
        itemNo = params.get('M');
      } else if (params.has('G')) {
        itemType = 'GEAR';
        itemNo = params.get('G');
      } else if (params.has('B')) {
        itemType = 'BOOK';
        itemNo = params.get('B');
      }
      
      return { itemType, itemNo };
    } catch (e) {
      return { itemType: null, itemNo: null };
    }
  }

  // Hitta alla item-länkar på sidan
  function findAllItemLinks() {
    const links = document.querySelectorAll('a[href*="catalogitem.page"]');
    const items = new Set();
    
    links.forEach(link => {
      const { itemType, itemNo } = parseItemUrl(link.href);
      if (itemType && itemNo) {
        items.add(JSON.stringify({ type: itemType, no: itemNo, link: link }));
      }
    });
    
    // Konvertera tillbaka från Set (för att ta bort duplicates)
    return Array.from(items).map(item => {
      const parsed = JSON.parse(item);
      // Hitta första matchande länken för detta item
      const matchingLink = Array.from(links).find(link => {
        const { itemType, itemNo } = parseItemUrl(link.href);
        return itemType === parsed.type && itemNo === parsed.no;
      });
      return {
        type: parsed.type,
        no: parsed.no,
        elements: Array.from(links).filter(link => {
          const { itemType, itemNo } = parseItemUrl(link.href);
          return itemType === parsed.type && itemNo === parsed.no;
        })
      };
    });
  }

  // Kolla om ett item finns i inventory
  function isInInventory(itemType, itemNo) {
    if (!inventory || !Array.isArray(inventory)) {
      return false;
    }
    
    return inventory.some(item => {
      return item.item && 
             item.item.type === itemType && 
             item.item.no === itemNo;
    });
  }

  // Räkna totalt antal av ett item i inventory
  function getInventoryCount(itemType, itemNo) {
    if (!inventory || !Array.isArray(inventory)) {
      return 0;
    }
    
    const matchingItems = inventory.filter(item => {
      return item.item && 
             item.item.type === itemType && 
             item.item.no === itemNo;
    });
    
    return matchingItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }

  // Markera ett element som "i inventory"
  function markElementAsOwned(element, count) {
    // Hitta närmaste container (oftast td eller div)
    const container = element.closest('td') || element.closest('div') || element.parentElement;
    
    if (!container) return;
    
    // Lägg till markering
    container.style.position = 'relative';
    
    // Skapa badge
    const badge = document.createElement('div');
    badge.className = 'bricklink-owned-badge';
    badge.innerHTML = `✓ ${count > 1 ? count + ' st' : ''}`;
    badge.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
      box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
      z-index: 1000;
      pointer-events: none;
      font-family: Arial, sans-serif;
    `;
    
    // Lägg till grön border
    container.style.border = '3px solid #10b981';
    container.style.borderRadius = '6px';
    container.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.3)';
    
    container.appendChild(badge);
  }

  // Skapa och visa status-indikator
  function createStatusIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'bricklink-list-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: white;
      border: 2px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: Arial, sans-serif;
      min-width: 220px;
      animation: slideIn 0.3s ease-out;
    `;
    
    indicator.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: #333; font-size: 14px;">
        📦 Inventory Check
      </div>
      <div id="bricklink-list-status" style="color: #666; font-size: 13px;">
        Laddar...
      </div>
    `;
    
    document.body.appendChild(indicator);
    return indicator;
  }

  // Uppdatera status
  function updateStatus(message, color = '#666') {
    const statusDiv = document.getElementById('bricklink-list-status');
    if (statusDiv) {
      statusDiv.innerHTML = message;
      statusDiv.style.color = color;
    }
  }

  // Huvudfunktion
  async function processPage() {
    if (processing) return;
    processing = true;
    
    console.log('🔍 Bricklink Inventory Checker: Processing catalog list page...');
    
    // Kolla API-nycklar
    const result = await chrome.storage.sync.get(['apiKey', 'apiSecret', 'tokenValue', 'tokenSecret']);
    
    if (!result.apiKey || !result.apiSecret || !result.tokenValue || !result.tokenSecret) {
      console.log('⚠️ API-nycklar saknas');
      processing = false;
      return;
    }
    
    console.log('✅ API-nycklar hittade');
    
    // Skapa status-indikator
    const indicator = createStatusIndicator();
    updateStatus('⏳ Hämtar inventory...');
    
    // Hämta inventory med timeout
    try {
      let responseReceived = false;
      
      // Sätt en timeout på 30 sekunder
      const timeout = setTimeout(() => {
        if (!responseReceived) {
          updateStatus('⚠️ Timeout - API svarar inte', '#f59e0b');
          console.error('❌ Timeout waiting for inventory');
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
        }
      }, 30000); // 30 sekunder
      
      chrome.runtime.sendMessage({ action: 'getFullInventory' }, response => {
        responseReceived = true;
        clearTimeout(timeout);
        
        // Kontrollera att response finns
        if (!response) {
          updateStatus('⚠️ Inget svar från background script', '#f59e0b');
          console.error('❌ No response from background script');
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
          return;
        }
        
        if (response.error) {
          updateStatus('⚠️ Kunde ej hämta inventory', '#f59e0b');
          console.error('❌ Error fetching inventory:', response.error);
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
          return;
        }
        
        inventory = response.inventory;
        
        // Kontrollera att inventory faktiskt innehåller data
        if (!inventory || !Array.isArray(inventory)) {
          updateStatus('⚠️ Inventory är tomt', '#f59e0b');
          console.error('❌ Invalid inventory data:', inventory);
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
          return;
        }
        
        console.log(`✅ Inventory hämtat: ${inventory.length} items`);
        updateStatus('🔍 Analyserar sidan...');
        
        // Hitta alla items på sidan
        const items = findAllItemLinks();
        console.log(`🔍 Hittade ${items.length} unika items på sidan`);
        
        let ownedCount = 0;
        
        // Kolla varje item
        items.forEach(item => {
          if (isInInventory(item.type, item.no)) {
            const count = getInventoryCount(item.type, item.no);
            ownedCount++;
            console.log(`✅ Äger: ${item.type} ${item.no} (${count} st)`);
            
            // Markera alla element för detta item
            item.elements.forEach(element => {
              markElementAsOwned(element, count);
            });
          }
        });
        
        // Uppdatera status
        if (ownedCount > 0) {
          updateStatus(
            `✅ ${ownedCount} av ${items.length} items i inventory`, 
            '#10b981'
          );
          console.log(`✅ Markerade ${ownedCount} items som ägda`);
        } else {
          updateStatus(
            `Inga items från denna lista i inventory`, 
            '#666'
          );
          console.log('ℹ️ Inga matchningar hittades');
        }
        
        // Ta bort indikator efter 5 sekunder
        setTimeout(() => {
          indicator.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => indicator.remove(), 300);
        }, 5000);
        
        processing = false;
      });
    } catch (error) {
      console.error('❌ Exception när meddelande skickades:', error);
      updateStatus('⚠️ Fel vid kommunikation', '#f59e0b');
      setTimeout(() => indicator.remove(), 5000);
      processing = false;
    }
  }

  // Kör när sidan är laddad
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processPage);
  } else {
    processPage();
  }

})();