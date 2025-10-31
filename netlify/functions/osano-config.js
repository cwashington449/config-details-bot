// --- Re-usable helper functions from our HTML file ---

// Regex to find the osano.js URL in a script tag or just a raw URL
const srcRegex = /https?:\/\/cmp\.osano\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/osano\.js/;

/**
 * Safely get a nested value from an object.
 * @param {object} obj - The object to search.
 * @param {string} path - The dot-notation path (e.g., "ui.logo").
 * @param {*} defaultValue - The value to return if not found.
 * @returns {*} The found value or the default.
 */
function getValue(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    return value !== undefined ? value : defaultValue;
}

/**
 * Formats a raw value for display.
 * @param {*} value - The raw value from the JSON.
 * @param {string} type - The format type (e.g., "boolean", "mode").
 * @returns {string} The formatted string.
 */
function formatValue(value, type) {
    if (type === 'boolean') {
        return value ? 'True' : 'False';
    }
    if (type === 'mode') {
        return value === 'permissive' ? 'Permissive' :
               value === 'production' ? 'Strict' :
               value === 'debug' ? 'Discovery/Listener' :
               'N/A';
    }
    if (type === 'ccpa') {
        return value === false ? 'Template 3 (Opt-in)' :
               value === true ? 'Template 1 (Opt-out)' :
               'N/A';
    }
    if (type === 'join') {
        return Array.isArray(value) && value.length > 0 ? value.join(', ') : 'N/A';
    }
    if (type === 'blank') {
        return '(N/A)';
    }
    if (value === 'N/A' || value === '' || value === null) {
        return 'N/A';
    }
    return value;
}

/**
 * Generates the Slack mrkdwn summary from the config JSON.
 * @param {object} data - The fetched config.json.
 * @returns {string} A string formatted for Slack.
 */
function generateConfigSummary(data) {
    let summary = [];

    // Helper to add a line to the summary
    const addLine = (label, value, type) => {
        const formattedValue = formatValue(getValue(data, label, 'N/A'), type);
        summary.push(`*${value}:* ${formattedValue}`);
    };
    
    // Helper to add a title
    const addTitle = (title) => summary.push(`\n*${title}*`);

    // --- Build the Summary ---
    addTitle('Account Details');
    addLine('customerId', 'Account ID');
    addLine('configId', 'Config ID');
    addLine('domains', 'Domains', 'join');

    addTitle('Compliance Mode');
    addLine('mode', 'Mode', 'mode');

    addTitle('Banner Links');
    addLine('policyLinkText', 'Link Text');
    addLine('storagePolicyHref', 'Link URL');
    addLine('additionalLinks', 'Additional Links', 'join');

    addTitle('Frameworks');
    addLine('gpcSupport', 'Support GPC', 'boolean');
    addLine('dntSupport', 'Support Do Not Track', 'boolean');
    addLine('iabEnabled', 'IAB TCF', 'boolean');
    summary.push(`*IAB US Privacy String:* (N/A)`); // Placeholder
    addLine('googleConsent', 'Google Consent Mode', 'boolean');

    addTitle('Performance');
    addLine('codeSplitting', 'Split Payload', 'boolean');

    addTitle('Experience');
    addLine('forcedClassifyEnabled', 'Block List', 'boolean');
    addLine('forceManagePreferences', 'First Layer Categories', 'boolean');
    addLine('managePreferencesEnabled', 'Manage Preferences Enabled', 'boolean');
    addLine('ccpaRelaxed', 'US State Banner Format', 'ccpa');
    addLine('crossDomain', 'Cross Domain Support', 'boolean');

    addTitle('Banner Behavior');
    addLine('allowTimeout', 'Banner Timeout', 'boolean');
    addLine('timeoutSeconds', 'Timeout (Seconds)');
    addLine('policyLinkInDrawer', 'Show Links in Drawer', 'boolean');

    // --- Collapsible Sections (as simple text lists) ---
    // Note: Slack mrkdwn doesn't have tables, so lists are cleaner.

    // Scripts
    const scripts = getValue(data, 'scripts', {});
    const scriptKeys = Object.keys(scripts);
    addTitle(`Scripts (${scriptKeys.length})`);
    if (scriptKeys.length > 0) {
        scriptKeys.forEach(key => summary.push(`• \`${key}\` (${scripts[key]})`));
    } else {
        summary.push('No scripts classified.');
    }

    // Cookies
    const cookies = getValue(data, 'cookies', {});
    const cookieKeys = Object.keys(cookies);
    const disclosures = getValue(data, 'disclosures', []);
    addTitle(`Cookies (${cookieKeys.length})`);
    summary.push(`*Disclosing Cookies:* ${formatValue(disclosures.length > 0, 'boolean')}`);
    if (cookieKeys.length > 0) {
        cookieKeys.forEach(key => {
            const c = cookies[key];
            summary.push(`• \`${key}\`: ${c.classification} (Provider: ${c.provider || 'N/A'}, Expiry: ${c.expiry || 'N/A'})`);
        });
    } else {
        summary.push('No cookies classified.');
    }

    // iFrames
    const iframes = getValue(data, 'iframes', {});
    const iframeKeys = Object.keys(iframes);
    addTitle(`iFrames (${iframeKeys.length})`);
    addLine('iframeBlocking', 'iFrame Blocking Mode');
    if (iframeKeys.length > 0) {
        iframeKeys.forEach(key => summary.push(`• \`${key}\` (${iframes[key]})`));
    } else {
        summary.push('No iFrames classified.');
    }

    // IAB Vendors
    const vendors = getValue(data, 'iab.tcf.v2.vendors', {});
    const vendorKeys = Object.keys(vendors);
    addTitle(`IAB Vendors (${vendorKeys.length})`);
    if (vendorKeys.length > 0) {
        vendorKeys.forEach(key => summary.push(`• Vendor ID: \`${key}\``));
    } else {
        summary.push('No IAB vendors disclosed.');
    }

    // Note: We'll skip the palette/color section for Slack as it's less useful without visuals.
    
    return summary.join('\n');
}

/**
 * This is the main async function that does all the work.
 * We run this *after* sending the initial "Thinking..." response.
 * @param {string} text - The input text from the user.
 * @param {string} response_url - The temporary URL Slack gives us to send the final message.
 */
async function processRequest(text, response_url) {
    let responseText = '';

    try {
        // 1. Find the osano.js URL
        const match = text.match(srcRegex);
        if (!match) {
            responseText = 'Sorry, I couldn\'t find a valid Osano URL in that text. Please paste the full script tag or the `osano.js` URL.';
            throw new Error(responseText);
        }

        const osanoUrl = match[0];
        const configUrl = osanoUrl.replace('/osano.js', '/config.json');

        // 2. Fetch the config.json
        const configResponse = await fetch(configUrl);
        if (!configResponse.ok) {
            responseText = `Failed to fetch config.json. Server responded with status: ${configResponse.status}`;
            throw new Error(responseText);
        }
        
        const configData = await configResponse.json();

        // 3. Generate the human-readable summary
        responseText = generateConfigSummary(configData);

    } catch (error) {
        console.error('Error in processRequest:', error);
        // Use the specific error message if we set one, otherwise a generic one
        if (!responseText) {
            responseText = `An error occurred: ${error.message}`;
        }
    }

    // 4. Send the final, formatted message back to Slack
    await fetch(response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            response_type: 'in_channel', // 'in_channel' or 'ephemeral' (just for the user)
            text: responseText
        })
    });
}

/**
 * This is the main Netlify Function handler.
 * It's what Netlify runs when Slack hits our URL.
 */
exports.handler = async (event) => {
    // 1. Check if it's a POST request (Slack commands are POST)
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // 2. Parse the incoming data from Slack
        // Slack sends data as 'application/x-www-form-urlencoded'
        const body = new URLSearchParams(event.body);
        const text = body.get('text');
        const response_url = body.get('response_url');

        if (!text || !response_url) {
            return { statusCode: 400, body: 'Bad Request: Missing text or response_url' };
        }

        // 3. Handle Slack's 3-second rule!
        // We *don't* await processRequest. We call it and let it run in the 
        // background. This lets us send the "Thinking..." response immediately.
        processRequest(text, response_url).catch(console.error);

        // 4. Send the *immediate* "Thinking..." response.
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                response_type: 'ephemeral', // 'ephemeral' means "only you can see this"
                text: 'Got it! Fetching the Osano config now...'
            })
        };

    } catch (error) {
        console.error('Error in handler:', error);
        return {
            statusCode: 200, // Always send 200 to Slack, even on error
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                response_type: 'ephemeral',
                text: `A critical error occurred: ${error.message}`
            })
        };
    }
};