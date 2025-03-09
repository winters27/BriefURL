// Default settings
const DEFAULT_SETTINGS = {
  service: 'is.gd',
  showNotifications: true
};

// API key for x.gd
const XGD_API_KEY = 'e4bf91de11beaf9dd288781e38850044';

// Initialize settings
function initializeSettings() {
  console.log("Initializing settings...");

  browser.storage.local.get()
    .then(settings => {
      console.log("Current settings:", settings);

      const newSettings = {};
      let needsUpdate = false;

      for (const key in DEFAULT_SETTINGS) {
        if (settings[key] === undefined) {
          newSettings[key] = DEFAULT_SETTINGS[key];
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        console.log("Saving default settings:", newSettings);
        return browser.storage.local.set(newSettings);
      }
    })
    .catch(error => {
      console.error("Error initializing settings:", error);
      return browser.storage.local.set(DEFAULT_SETTINGS);
    });
}

// Initialize settings on extension load
initializeSettings();

// Set up context menus
function createContextMenus() {
  browser.contextMenus.removeAll()
    .then(() => {
      console.log("Creating context menus");

      browser.contextMenus.create({
        id: "copy-shortened-link",
        title: "Copy Shortened Link",
        contexts: ["link"]
      });

      browser.contextMenus.create({
        id: "copy-shortened-current-url",
        title: "Copy Shortened Page URL",
        contexts: ["page", "frame"]
      });
    })
    .catch(error => console.error("Error creating context menus:", error));
}

// Create menus on extension install
createContextMenus();

// Keyboard shortcut handler
browser.commands.onCommand.addListener((command) => {
  if (command === "shortcut-shorten-url") {
    shortenCurrentPageUrl();
  }
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "copy-shortened-link") {
    shortenAndCopyUrl(info.linkUrl);
  } else if (info.menuItemId === "copy-shortened-current-url") {
    shortenCurrentPageUrl();
  }
});

// Get and shorten current tab URL
function shortenCurrentPageUrl() {
  browser.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {
      if (tabs[0] && tabs[0].url) {
        shortenAndCopyUrl(tabs[0].url);
      }
    })
    .catch(error => console.error("Error querying tabs:", error));
}

// Function to request URL shortening via different services
async function tryShorteningWithService(urlToShorten, service) {
  let apiUrl;
  let method = "GET";
  let headers = { "Accept": "application/json" };

  if (service === "x.gd") {
      apiUrl = `https://xgd.io/V1/shorten?url=${encodeURIComponent(urlToShorten)}&key=${XGD_API_KEY}`;
  } else if (service === "is.gd" || service === "v.gd") {
      apiUrl = `https://${service}/create.php?format=json&url=${encodeURIComponent(urlToShorten)}`;
  } else if (service === "anon.to") {
      return fetchAnonToUrl(urlToShorten);
  } else {
      throw new Error(`Unknown shortening service: ${service}`);
  }

  try {
      const response = await fetch(apiUrl, { method, headers });

      if (!response.ok) {
          throw new Error(`x.gd API Error ${response.status}: ${await response.text()}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text();

      if (contentType.includes("application/json")) {
          const data = JSON.parse(rawText);
          if (data.shorturl) return data.shorturl;
      }

      if (rawText.trim().startsWith("http")) return rawText.trim();

      throw new Error(`Unexpected response from ${service}`);
  } catch (error) {
      throw error;
  }
}


async function fetchAnonToUrl(originalUrl) {
  try {
      console.log(`Submitting URL to anon.to: ${originalUrl}`);

      // Step 1: Get CSRF token from anon.to
      const csrfResponse = await fetch("https://anon.to/", { method: "GET", credentials: "include" });
      const csrfText = await csrfResponse.text();
      const csrfTokenMatch = csrfText.match(/name="_token" value="(.+?)"/);
      const csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null;

      if (!csrfToken) {
          throw new Error("Failed to retrieve CSRF token from anon.to.");
      }

      console.log(`Extracted CSRF Token: ${csrfToken}`);

      // Step 2: Submit the URL to anon.to
      const formData = new FormData();
      formData.append("_token", csrfToken);
      formData.append("url", originalUrl);

      const response = await fetch("https://anon.to/shorten", {
          method: "POST",
          body: formData,
          credentials: "include",
          headers: {
              "X-Requested-With": "XMLHttpRequest"
          }
      });

      if (!response.ok) {
          throw new Error(`anon.to failed: ${response.status}`);
      }

      const responseData = await response.json();
      console.log(`anon.to Response JSON:`, responseData);

      if (!responseData.url) {
          throw new Error("anon.to response did not contain a shortened URL.");
      }

      const anonToShortUrl = responseData.url;
      console.log(`Extracted anon.to Short URL: ${anonToShortUrl}`);

      // Copy anon.to link to clipboard
      copyToClipboard(anonToShortUrl);

      return anonToShortUrl;

  } catch (error) {
      console.error("Error with anon.to:", error);
      throw error;
  }
}

// Main function to shorten & copy URL
async function shortenAndCopyUrl(urlToShorten) {
  try {
      if (!urlToShorten) throw new Error("No URL found");

      const settings = await browser.storage.local.get(DEFAULT_SETTINGS);
      const allServices = ["is.gd", "v.gd", "x.gd", "anon.to"];
      let selectedService = settings.service || "is.gd";

      // Find the index of the saved service in the list
      let startIndex = allServices.indexOf(selectedService);
      if (startIndex === -1) startIndex = 0; // Default to first if not found

      let servicesToTry = [
          ...allServices.slice(startIndex),  // Start from the selected service onward
          ...allServices.slice(0, startIndex) // Then try the ones before it
      ];

      let shortUrl;
      for (const service of servicesToTry) {
          try {
              console.log(`Trying ${service} to shorten the URL...`);
              shortUrl = await tryShorteningWithService(urlToShorten, service);
              console.log(`Success with ${service}: ${shortUrl}`);
              break; // Stop after the first success
          } catch (error) {
              console.error(`Service ${service} failed:`, error);
          }
      }

      if (!shortUrl) throw new Error("All shortening services failed.");

      await navigator.clipboard.writeText(shortUrl);
      console.log("Copied shortened URL to clipboard:", shortUrl);

      // ✅ User success notification
      browser.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-48.png",
          title: "URL Shortened",
          message: `Copied to clipboard: ${shortUrl}`,
      });

  } catch (error) {
      console.error("Error shortening URL:", error);
      
      // Notify user of failure
      browser.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-48.png",
          title: "URL Shortening Failed",
          message: error.message || "An unexpected error occurred.",
      });
  }
}


function copyToClipboard(text) {
  browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs.length === 0) {
          console.error("No active tab found.");
          return;
      }

      browser.tabs.executeScript(tabs[0].id, {
          code: `
              navigator.clipboard.writeText(${JSON.stringify(text)}).catch(err => console.error("Clipboard error:", err));
          `
      }).catch(err => console.error("Clipboard script execution error:", err));
  }).catch(err => console.error("Error querying active tab:", err));
}

// Function to notify user of success/failure
function notifyUser(message, url) {
  browser.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-48.png",
    title: "BriefURL",
    message: message + (url ? `\n${url}` : ""),
  });
}

