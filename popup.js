// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  // Ladda sparade credentials
  const result = await chrome.storage.sync.get([
    'apiKey',
    'apiSecret',
    'tokenValue',
    'tokenSecret'
  ]);
  
  if (result.apiKey) {
    document.getElementById('apiKey').value = result.apiKey;
  }
  if (result.apiSecret) {
    document.getElementById('apiSecret').value = result.apiSecret;
  }
  if (result.tokenValue) {
    document.getElementById('tokenValue').value = result.tokenValue;
  }
  if (result.tokenSecret) {
    document.getElementById('tokenSecret').value = result.tokenSecret;
  }
  
  // Spara credentials
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiSecret = document.getElementById('apiSecret').value.trim();
    const tokenValue = document.getElementById('tokenValue').value.trim();
    const tokenSecret = document.getElementById('tokenSecret').value.trim();
    
    if (!apiKey || !apiSecret || !tokenValue || !tokenSecret) {
      showStatus('Vänligen fyll i alla fält', 'error');
      return;
    }
    
    await chrome.storage.sync.set({
      apiKey,
      apiSecret,
      tokenValue,
      tokenSecret
    });
    
    showStatus('API-nycklar sparade!', 'success');
  });
  
  // Testa API-anslutning
  document.getElementById('testBtn').addEventListener('click', async () => {
    const testBtn = document.getElementById('testBtn');
    testBtn.disabled = true;
    testBtn.textContent = 'Testar...';
    
    chrome.runtime.sendMessage({ action: 'testApi' }, response => {
      testBtn.disabled = false;
      testBtn.textContent = 'Testa API-anslutning';
      
      if (response.success) {
        showStatus(`✅ ${response.message} (${response.itemCount} items i inventory)`, 'success');
      } else {
        showStatus(`❌ ${response.message}`, 'error');
      }
    });
  });
});

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.innerHTML = message;
  statusDiv.className = `status ${type}`;
  
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, 5000);
  }
}