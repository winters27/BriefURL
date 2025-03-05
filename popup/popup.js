// Default settings
const DEFAULT_SETTINGS = {
  service: 'is.gd',
  showNotifications: true
};

// Load settings when popup opens
document.addEventListener('DOMContentLoaded', loadSettings);

// Add save button listener
document.getElementById('saveButton').addEventListener('click', saveSettings);

// Load settings from storage
function loadSettings() {
  console.log("Loading settings...");
  
  // Use local storage instead of sync
  browser.storage.local.get(DEFAULT_SETTINGS)
    .then(settings => {
      console.log("Settings loaded:", settings);
      
      // Set service radio button
      const serviceRadio = document.querySelector(`input[name="service"][value="${settings.service}"]`);
      if (serviceRadio) {
        serviceRadio.checked = true;
      } else {
        document.getElementById('isGd').checked = true;
      }
      
      // Set notifications checkbox
      document.getElementById('showNotifications').checked = Boolean(settings.showNotifications);
    })
    .catch(error => {
      console.error("Error loading settings:", error);
      // If there's an error, set defaults
      document.getElementById('isGd').checked = true;
      document.getElementById('showNotifications').checked = true;
      
      // Show error in the popup
      showStatus('Error loading settings', true);
    });
}

// Save settings to storage
function saveSettings() {
  // Get values safely with defaults if something goes wrong
  let service = 'is.gd';
  try {
    const checkedRadio = document.querySelector('input[name="service"]:checked');
    if (checkedRadio) {
      service = checkedRadio.value;
    }
  } catch (e) {
    console.error("Error getting service value:", e);
  }
  
  let showNotifications = true;
  try {
    showNotifications = Boolean(document.getElementById('showNotifications').checked);
  } catch (e) {
    console.error("Error getting notifications value:", e);
  }
  
  // Create settings object
  const settings = {
    service: service,
    showNotifications: showNotifications
  };
  
  console.log("Saving settings:", settings);
  
  // Use local storage instead of sync
  browser.storage.local.set(settings)
    .then(() => {
      console.log("Settings saved successfully");
      showStatus('Settings saved!', false);
    })
    .catch(error => {
      console.error("Error saving settings:", error);
      showStatus('Error saving settings!', true);
    });
}

// Helper function to show status messages
function showStatus(message, isError) {
  const status = document.getElementById('status');
  status.textContent = message;
  
  if (isError) {
    status.style.color = '#cc0000';
  } else {
    status.style.color = '#008000';
  }
  
  status.classList.add('show');
  
  setTimeout(() => {
    status.classList.remove('show');
  }, 2000);
}