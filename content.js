// content.js

(function() {
  'use strict';

  // Extrahera item info från URLen
  function getItemInfoFromUrl() {
    const url = window.location.href;
    // URL format: https://www.bricklink.com/v2/catalog/catalogitem.page?P=3001 (del)
    // eller: https://www.bricklink.com/v2/catalog/catalogitem.page?S=10255-1 (set)
    // eller: https://www.bricklink.com/v2/catalog/catalogitem.page?M=sw0001 (minifig)
    
    const urlParams = new URLSearchParams(window.location.search);
    
    let itemType = null;
    let itemNo = null;
    
    if (urlParams.has('P')) {
      itemType = 'PART';
      itemNo = urlParams.get('P');
    } else if (urlParams.has('S')) {
      itemType = 'SET';
      itemNo = urlParams.get('S');
    } else if (urlParams.has('M')) {
      itemType = 'MINIFIG';
      itemNo = urlParams.get('M');
    } else if (urlParams.has('G')) {
      itemType = 'GEAR';
      itemNo = urlParams.get('G');
    } else if (urlParams.has('B')) {
      itemType = 'BOOK';
      itemNo = urlParams.get('B');
    }
    
    return { itemType, itemNo };
  }

  // Skapa indikator-element
  function createIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'bricklink-inventory-indicator';
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
      min-width: 240px;
      max-width: 320px;
    `;
    
    indicator.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: #333; font-size: 14px;">
        📦 Inventory Check
      </div>
      <div id="bricklink-status" style="color: #666; font-size: 13px;">
        Kollar...
      </div>
      <div id="bricklink-details" style="margin-top: 8px; font-size: 11px; color: #999; line-height: 1.4;">
      </div>
    `;
    
    document.body.appendChild(indicator);
    return indicator;
  }

  // Uppdatera indikatorns status
  function updateIndicator(status, data = {}) {
    const statusDiv = document.getElementById('bricklink-status');
    const detailsDiv = document.getElementById('bricklink-details');
    
    if (!statusDiv) return;
    
    if (status === 'checking') {
      statusDiv.innerHTML = '⏳ Kollar inventory...';
      statusDiv.style.color = '#666';
      if (detailsDiv) {
        detailsDiv.innerHTML = `Söker efter ${data.itemType || ''} ${data.itemNo || ''}`;
      }
    } else if (status === 'found') {
      statusDiv.innerHTML = `✅ Du har denna!`;
      statusDiv.style.color = '#22c55e';
      if (detailsDiv) {
        let details = `<strong>Totalt: ${data.quantity || 0} st</strong>`;
        
        // Visa färginformation om det finns
        if (data.colors && data.colors.length > 0) {
          details += '<br><br><div style="margin-top: 6px; font-size: 12px;">';
          
          if (data.colors.length === 1) {
            details += `<strong>Färg:</strong> ${data.colors[0].colorName}`;
          } else {
            details += '<strong>Färger:</strong><br>';
            data.colors.forEach((color, index) => {
              const colorDot = getColorDot(color.colorId);
              details += `<div style="margin-top: 4px; display: flex; align-items: center;">`;
              details += `${colorDot} <span style="margin-left: 6px;">${color.colorName}: ${color.quantity} st</span>`;
              if (color.entries > 1) {
                details += ` <span style="color: #999; font-size: 10px;">(${color.entries} poster)</span>`;
              }
              details += `</div>`;
            });
          }
          
          details += '</div>';
        }
        
        detailsDiv.innerHTML = details;
        detailsDiv.style.color = '#22c55e';
      }
    } else if (status === 'not_found') {
      statusDiv.innerHTML = '❌ Finns ej i inventory';
      statusDiv.style.color = '#ef4444';
      if (detailsDiv) {
        detailsDiv.innerHTML = 'Ingen match hittades';
        detailsDiv.style.color = '#ef4444';
      }
    } else if (status === 'error') {
      statusDiv.innerHTML = '⚠️ Kunde ej kolla';
      statusDiv.style.color = '#f59e0b';
      if (detailsDiv) {
        detailsDiv.innerHTML = data.error || 'Kontrollera API-nycklar i extensionen';
        detailsDiv.style.color = '#f59e0b';
      }
    } else if (status === 'no_api') {
      statusDiv.innerHTML = '⚙️ API-nycklar saknas';
      statusDiv.style.color = '#3b82f6';
      if (detailsDiv) {
        detailsDiv.innerHTML = 'Klicka på extensionen för att konfigurera';
        detailsDiv.style.color = '#3b82f6';
      }
    }
  }

  // Hämta färgindikator baserat på Bricklink color ID
  function getColorDot(colorId) {
    // Bricklink färg-mappning (vanligaste färgerna)
    const colorMap = {
      1: '#05131D',    // White
      2: '#C91A09',    // Tan
      3: '#FFC91F',    // Yellow
      4: '#F75C00',    // Orange
      5: '#C91A09',    // Red
      6: '#469BC3',    // Green
      7: '#0055BF',    // Blue
      8: '#958A73',    // Brown
      9: '#6C6E68',    // Light Gray
      10: '#595D60',   // Dark Gray
      11: '#0A3463',   // Dark Green
      15: '#EEEEEE',   // White
      19: '#958A73',   // Tan
      21: '#DE378B',   // Bright Pink
      25: '#F75C00',   // Orange
      36: '#6C6E68',   // Trans-Clear
      85: '#D67572',   // Dark Bluish Gray
      86: '#958A73',   // Light Bluish Gray
    };
    
    const hexColor = colorMap[colorId] || '#999999';
    return `<span style="display: inline-block; width: 12px; height: 12px; background-color: ${hexColor}; border: 1px solid #ccc; border-radius: 2px;"></span>`;
  }

  // Kolla inventory via Bricklink API
  async function checkInventory(itemType, itemNo) {
    try {
      // Hämta API credentials från storage
      const result = await chrome.storage.sync.get(['apiKey', 'apiSecret', 'tokenValue', 'tokenSecret']);
      
      if (!result.apiKey || !result.apiSecret || !result.tokenValue || !result.tokenSecret) {
        updateIndicator('no_api');
        return;
      }

      // Skicka meddelande till background script för att göra API-anrop
      chrome.runtime.sendMessage({
        action: 'checkInventory',
        itemType: itemType,
        itemNo: itemNo
      }, response => {
        console.log('Response from background:', response);
        
        if (response.error) {
          updateIndicator('error', { error: response.details || response.error });
        } else if (response.found) {
          updateIndicator('found', {
            quantity: response.quantity,
            entries: response.entries,
            colors: response.colors
          });
        } else {
          updateIndicator('not_found');
        }
      });
      
    } catch (error) {
      console.error('Error checking inventory:', error);
      updateIndicator('error', { error: error.message });
    }
  }

  // Huvudfunktion
  function init() {
    const { itemType, itemNo } = getItemInfoFromUrl();
    
    if (!itemType || !itemNo) {
      console.log('Ingen giltig item-URL hittades');
      return;
    }
    
    console.log(`🔍 Hittade ${itemType}: ${itemNo}`);
    
    // Skapa och visa indikator
    createIndicator();
    updateIndicator('checking', { itemType, itemNo });
    
    // Kolla inventory
    checkInventory(itemType, itemNo);
  }

  // Kör när sidan laddats
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Lyssna på URL-ändringar (för single-page navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      
      // Ta bort gamla indikatorn
      const oldIndicator = document.getElementById('bricklink-inventory-indicator');
      if (oldIndicator) {
        oldIndicator.remove();
      }
      
      // Kör init igen
      setTimeout(init, 500);
    }
  }).observe(document, { subtree: true, childList: true });
  
})();