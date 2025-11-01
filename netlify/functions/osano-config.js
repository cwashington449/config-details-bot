/**
 * Osano Config Details Bot - Netlify Function
 *
 * A Slack bot that fetches and displays Osano CMP configuration details.
 * Uses asynchronous processing to avoid Slack's 3-second timeout.
 *
 * @version 2.0.0
 * @author Chris Washington
 */

const fetch = require('node-fetch');

// Regex to find the osano.js URL in a script tag or just a raw URL
const OSANO_URL_REGEX = /https?:\/\/cmp\.osano\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/osano\.js/;
const FETCH_TIMEOUT_MS = 50000; // 50 seconds - increased for slow Osano API responses

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
 * Process the request asynchronously and send the result to Slack's response_url.
 * This function runs in the background after we've acknowledged the slash command.
 * @param {string} text - The text from the slash command
 * @param {string} response_url - Slack's webhook URL to send the delayed response
 */
async function processRequest(text, response_url) {
    try {
        // 1. Validate and extract the osano.js URL
        const match = text.trim().match(OSANO_URL_REGEX);
        if (!match) {
            throw new Error('Sorry, I couldn\'t find a valid Osano URL in that text. Please paste the full script tag or the `osano.js` URL.');
        }

        const osanoUrl = match[0];
        const configUrl = osanoUrl.replace('/osano.js', '/config.json');

        // 2. Fetch the config.json with timeout protection
        console.log(`Fetching config from: ${configUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const configResponse = await fetch(configUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Osano-Config-Bot/2.0'
            }
        });
        clearTimeout(timeoutId);
        console.log(`Config fetch completed with status: ${configResponse.status}`);

        if (!configResponse.ok) {
            const statusText = configResponse.statusText || 'Unknown error';
            throw new Error(`Failed to fetch config.json. Server responded with status: ${configResponse.status} (${statusText})`);
        }
        
        const configData = await configResponse.json();
        
        // Validate that we received valid configuration data
        if (!configData || typeof configData !== 'object') {
            throw new Error('Invalid configuration data received from Osano.');
        }

        // 3. Generate the human-readable summary
        console.log('Generating config summary...');
        const responseText = generateConfigSummary(configData);

        // 4. Send the result back to Slack via response_url
        console.log('Sending response to Slack...');
        const slackResponse = await fetch(response_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                response_type: 'in_channel',
                text: responseText
            })
        });
        
        if (!slackResponse.ok) {
            console.error(`Failed to send to Slack: ${slackResponse.status} ${slackResponse.statusText}`);
        } else {
            console.log('Successfully sent response to Slack');
        }

    } catch (error) {
        console.error('Error in processRequest:', error);
        
        // Send error message to Slack via response_url
        const errorMessage = error.name === 'AbortError'
            ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds while fetching Osano configuration. The Osano API may be slow or unavailable. Please try again.`
            : error.message;

        try {
            console.log(`Sending error to Slack: ${errorMessage}`);
            const errorResponse = await fetch(response_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    response_type: 'in_channel',
                    text: `:warning: *Error:* ${errorMessage}`
                })
            });
            
            if (!errorResponse.ok) {
                console.error(`Failed to send error to Slack: ${errorResponse.status} ${errorResponse.statusText}`);
            } else {
                console.log('Successfully sent error message to Slack');
            }
        } catch (err) {
            console.error('Failed to send error to Slack:', err);
        }
    }
}

/**
 * This is the main Netlify Function handler.
 * It's what Netlify runs when Slack hits our URL.
 */
exports.handler = async (event, context) => {
    // Prevent function from timing out while background work completes
    context.callbackWaitsForEmptyEventLoop = false;
    
    // 1. Check if it's a POST request (Slack commands are POST)
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // 2. Parse and validate the incoming data from Slack
        const body = new URLSearchParams(event.body);
        const text = body.get('text');
        const response_url = body.get('response_url');
        const user_name = body.get('user_name') || 'Unknown User';
        const channel_name = body.get('channel_name') || 'Unknown Channel';

        // Log the request for debugging
        console.log(`Request from ${user_name} in #${channel_name}: ${text}`);

        if (!text || !response_url) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    response_type: 'ephemeral',
                    text: ':warning: Missing required parameters. Please provide an Osano URL.'
                })
            };
        }

        // 3. Start processing in the background
        // We don't await this so we can return immediately to Slack
        // The context.callbackWaitsForEmptyEventLoop = false ensures it completes
        setImmediate(() => {
            processRequest(text, response_url).catch(error => {
                console.error('Unhandled error in processRequest:', error);
            });
        });

        // 4. Immediately return acknowledgment to Slack (within 3 seconds)
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                response_type: 'in_channel',
                text: ':hourglass_flowing_sand: Fetching Osano configuration details...'
            })
        };

    } catch (error) {
        console.error('Error in handler:', error);
        
        // Return error response
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                response_type: 'ephemeral',
                text: `:warning: *Error:* ${error.message}`
            })
        };
    }
};

