// Default settings
const DEFAULT_SETTINGS = {
    service: 'is.gd',
    showNotifications: true
  };
  
  // Initialize settings
  function initializeSettings() {
    console.log("Initializing settings...");
    
    // Use local storage instead of sync
    browser.storage.local.get()
      .then(settings => {
        console.log("Current settings:", settings);
        
        const newSettings = {};
        let needsUpdate = false;
        
        // Check if any setting is missing
        for (const key in DEFAULT_SETTINGS) {
          if (settings[key] === undefined) {
            newSettings[key] = DEFAULT_SETTINGS[key];
            needsUpdate = true;
          }
        }
        
        // If any settings are missing, save the defaults
        if (needsUpdate) {
          console.log("Saving default settings:", newSettings);
          return browser.storage.local.set(newSettings);
        }
      })
      .catch(error => {
        console.error("Error initializing settings:", error);
        // If there's an error, set all defaults
        console.log("Error occurred, setting all defaults");
        return browser.storage.local.set(DEFAULT_SETTINGS);
      });
  }
  
  // Initialize settings when extension loads
  initializeSettings();
  
  // Set up context menus
  function createContextMenus() {
    // Remove any existing menus to prevent duplicates
    browser.contextMenus.removeAll()
      .then(() => {
        console.log("Creating context menus");
        
        // Create context menu for links on webpages
        browser.contextMenus.create({
          id: "copy-shortened-link",
          title: "Copy Shortened Link",
          contexts: ["link"]
        });
  
        // Create context menu for the page (will work with URL bar)
        browser.contextMenus.create({
          id: "copy-shortened-current-url",
          title: "Copy Shortened Page URL",
          contexts: ["page", "frame"]
        });
      })
      .catch(error => {
        console.error("Error creating context menus:", error);
      });
  }
  
  // Create context menus when extension is installed
  createContextMenus();
  
  // Add keyboard shortcut handler
  browser.commands.onCommand.addListener((command) => {
    if (command === "shortcut-shorten-url") {
      shortenCurrentPageUrl();
    }
  });
  
  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "copy-shortened-link") {
      // For links on the page
      shortenAndCopyUrl(info.linkUrl);
    } else if (info.menuItemId === "copy-shortened-current-url") {
      // For current page URL (address bar)
      shortenCurrentPageUrl();
    }
  });
  
  // Function to get and shorten the current page URL
  function shortenCurrentPageUrl() {
    browser.tabs.query({active: true, currentWindow: true})
      .then(tabs => {
        if (tabs[0] && tabs[0].url) {
          shortenAndCopyUrl(tabs[0].url);
        }
      })
      .catch(error => {
        console.error("Error querying tabs:", error);
      });
  }
  
  // Get the API URL based on settings
  async function getApiUrl(urlToShorten) {
    try {
      const settings = await browser.storage.local.get(DEFAULT_SETTINGS);
      console.log("Retrieved settings for API call:", settings);
      
      let apiUrl = `https://${settings.service}/create.php?format=json&url=${encodeURIComponent(urlToShorten)}`;
      
      return { apiUrl, settings };
    } catch (error) {
      console.error("Error getting settings:", error);
      // Fallback to defaults if there's any error
      return { 
        apiUrl: `https://is.gd/create.php?format=json&url=${encodeURIComponent(urlToShorten)}`,
        settings: DEFAULT_SETTINGS
      };
    }
  }
  
  // Function to shorten URL with better compatibility
  async function shortenAndCopyUrl(urlToShorten) {
    try {
      if (!urlToShorten) {
        throw new Error("No URL found");
      }
  
      console.log("Shortening URL:", urlToShorten);
      
      // Get API URL and settings
      const { apiUrl, settings } = await getApiUrl(urlToShorten);
      console.log("Using API URL:", apiUrl);
      
      // Call the URL shortening API
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("API response:", data);
  
      if (data.shorturl) {
        // Try to use clipboard API, with fallback
        try {
          // Try the standard clipboard API
          await navigator.clipboard.writeText(data.shorturl);
          console.log("Copied to clipboard using navigator.clipboard");
        } catch (clipboardError) {
          console.error("Clipboard API failed:", clipboardError);
          console.log("Falling back to content script injection");
          
          // Fallback to content script injection for clipboard access
          await browser.tabs.executeScript({
            code: `
              function copyToClipboard(text) {
                const input = document.createElement('textarea');
                input.style.position = 'fixed';
                input.style.opacity = 0;
                input.value = text;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                return true;
              }
              copyToClipboard("${data.shorturl.replace(/"/g, '\\"')}");
            `
          });
          console.log("Copied to clipboard using content script injection");
        }
        
        // Show a notification if enabled
        if (settings.showNotifications) {
          browser.notifications.create({
            type: "basic",
            title: "URL Shortened",
            message: `Copied to clipboard: ${data.shorturl}`,
            iconUrl: "icons/icon-48.png"
          });
        }
        
        console.log("Successfully shortened URL:", data.shorturl);
      } else {
        throw new Error(data.errormessage || "Failed to shorten URL");
      }
    } catch (error) {
      console.error("Error shortening URL:", error);
      
      // Get settings to check if notifications are enabled
      try {
        const settings = await browser.storage.local.get(DEFAULT_SETTINGS);
        
        // Show error notification if enabled
        if (settings.showNotifications) {
          browser.notifications.create({
            type: "basic",
            title: "URL Shortening Error",
            message: error.message || "An unexpected error occurred",
            iconUrl: "icons/icon-48.png"
          });
        }
      } catch (settingsError) {
        console.error("Error retrieving settings for notification:", settingsError);
        
        // If we can't even get settings, show notification anyway
        browser.notifications.create({
          type: "basic",
          title: "URL Shortening Error",
          message: error.message || "An unexpected error occurred",
          iconUrl: "icons/icon-48.png"
        });
      }
    }
  }