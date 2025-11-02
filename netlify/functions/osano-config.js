/**
 * Osano Config Details Bot - Netlify Function
 *
 * A Slack bot that fetches and displays Osano CMP configuration details.
 * Processes synchronously and sends result via Slack's response_url.
 *
 * @version 2.0.1
 * @author Chris Washington
 */

const fetch = require('node-fetch');

// Regex to find the osano.js URL in a script tag or just a raw URL
const OSANO_URL_REGEX = /https?:\/\/cmp\.osano\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/osano\.js/;
const FETCH_TIMEOUT_MS = 30000; // 30 seconds

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
 * Generates Slack Block Kit blocks from the config JSON.
 * @param {object} data - The fetched config.json.
 * @returns {Array} Array of Slack Block Kit blocks.
 */
function generateConfigBlocks(data) {
    const blocks = [];
    
    // Helper to create a field object
    const createField = (label, value, type) => {
        const formattedValue = formatValue(getValue(data, label, 'N/A'), type);
        return {
            type: "mrkdwn",
            text: `*${value}:*\n${formattedValue}`
        };
    };

    // Header
    blocks.push({
        type: "header",
        text: {
            type: "plain_text",
            text: "🔍 Osano Configuration Details",
            emoji: true
        }
    });

    // Account Details Section
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: "*📋 Account Details*"
        }
    });
    blocks.push({
        type: "section",
        fields: [
            createField('customerId', 'Account ID'),
            createField('configId', 'Config ID'),
            createField('domains', 'Domains', 'join')
        ]
    });
    blocks.push({ type: "divider" });

    // Compliance Mode
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: "*⚖️ Compliance Mode*"
        }
    });
    blocks.push({
        type: "section",
        fields: [
            createField('mode', 'Mode', 'mode')
        ]
    });
    blocks.push({ type: "divider" });

    // Banner Links
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: "*🔗 Banner Links*"
        }
    });
    blocks.push({
        type: "section",
        fields: [
            createField('policyLinkText', 'Link Text'),
            createField('storagePolicyHref', 'Link URL'),
            createField('additionalLinks', 'Additional Links', 'join')
        ]
    });
    blocks.push({ type: "divider" });

    // Frameworks
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: "*🛡️ Privacy Frameworks*"
        }
    });
    blocks.push({
        type: "section",
        fields: [
            createField('gpcSupport', 'GPC Support', 'boolean'),
            createField('dntSupport', 'Do Not Track', 'boolean'),
            createField('iabEnabled', 'IAB TCF', 'boolean'),
            createField('googleConsent', 'Google Consent Mode', 'boolean')
        ]
    });
    blocks.push({ type: "divider" });

    // Performance
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: "*⚡ Performance*"
        }
    });
    blocks.push({
        type: "section",
        fields: [
            createField('codeSplitting', 'Split Payload', 'boolean')
        ]
    });
    blocks.push({ type: "divider" });

    // Experience
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: "*✨ User Experience*"
        }
    });
    blocks.push({
        type: "section",
        fields: [
            createField('forcedClassifyEnabled', 'Block List', 'boolean'),
            createField('forceManagePreferences', 'First Layer Categories', 'boolean'),
            createField('managePreferencesEnabled', 'Manage Preferences', 'boolean'),
            createField('ccpaRelaxed', 'US State Format', 'ccpa'),
            createField('crossDomain', 'Cross Domain', 'boolean')
        ]
    });
    blocks.push({ type: "divider" });

    // Banner Behavior
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: "*⏱️ Banner Behavior*"
        }
    });
    blocks.push({
        type: "section",
        fields: [
            createField('allowTimeout', 'Banner Timeout', 'boolean'),
            createField('timeoutSeconds', 'Timeout (Seconds)'),
            createField('policyLinkInDrawer', 'Links in Drawer', 'boolean')
        ]
    });
    blocks.push({ type: "divider" });

    // Scripts - Collapsible
    const scripts = getValue(data, 'scripts', {});
    const scriptKeys = Object.keys(scripts);
    const scriptPreview = scriptKeys.slice(0, 5);
    const hasMoreScripts = scriptKeys.length > 5;
    
    let scriptsText = `*📜 Scripts (${scriptKeys.length})*\n`;
    if (scriptKeys.length === 0) {
        scriptsText += '_No scripts classified_';
    } else {
        scriptPreview.forEach(key => {
            scriptsText += `• \`${key}\` - ${scripts[key]}\n`;
        });
        if (hasMoreScripts) {
            scriptsText += `_...and ${scriptKeys.length - 5} more_`;
        }
    }
    
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: scriptsText
        }
    });
    
    if (scriptKeys.length > 5) {
        blocks.push({
            type: "context",
            elements: [{
                type: "mrkdwn",
                text: "💡 _Showing first 5 scripts. Use Osano dashboard for full list._"
            }]
        });
    }
    blocks.push({ type: "divider" });

    // Cookies - Collapsible
    const cookies = getValue(data, 'cookies', {});
    const cookieKeys = Object.keys(cookies);
    const disclosures = getValue(data, 'disclosures', []);
    const cookiePreview = cookieKeys.slice(0, 5);
    const hasMoreCookies = cookieKeys.length > 5;
    
    let cookiesText = `*🍪 Cookies (${cookieKeys.length})*\n`;
    cookiesText += `*Disclosing:* ${formatValue(disclosures.length > 0, 'boolean')}\n\n`;
    
    if (cookieKeys.length === 0) {
        cookiesText += '_No cookies classified_';
    } else {
        cookiePreview.forEach(key => {
            const c = cookies[key];
            cookiesText += `• \`${key}\`\n  ${c.classification} | Provider: ${c.provider || 'N/A'} | Expiry: ${c.expiry || 'N/A'}\n`;
        });
        if (hasMoreCookies) {
            cookiesText += `_...and ${cookieKeys.length - 5} more_`;
        }
    }
    
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: cookiesText
        }
    });
    
    if (cookieKeys.length > 5) {
        blocks.push({
            type: "context",
            elements: [{
                type: "mrkdwn",
                text: "💡 _Showing first 5 cookies. Use Osano dashboard for full list._"
            }]
        });
    }
    blocks.push({ type: "divider" });

    // iFrames - Collapsible
    const iframes = getValue(data, 'iframes', {});
    const iframeKeys = Object.keys(iframes);
    const iframePreview = iframeKeys.slice(0, 5);
    const hasMoreIframes = iframeKeys.length > 5;
    
    let iframesText = `*🖼️ iFrames (${iframeKeys.length})*\n`;
    iframesText += `*Blocking Mode:* ${formatValue(getValue(data, 'iframeBlocking', 'N/A'))}\n\n`;
    
    if (iframeKeys.length === 0) {
        iframesText += '_No iFrames classified_';
    } else {
        iframePreview.forEach(key => {
            iframesText += `• \`${key}\` - ${iframes[key]}\n`;
        });
        if (hasMoreIframes) {
            iframesText += `_...and ${iframeKeys.length - 5} more_`;
        }
    }
    
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: iframesText
        }
    });
    
    if (iframeKeys.length > 5) {
        blocks.push({
            type: "context",
            elements: [{
                type: "mrkdwn",
                text: "💡 _Showing first 5 iFrames. Use Osano dashboard for full list._"
            }]
        });
    }
    blocks.push({ type: "divider" });

    // IAB Vendors - Collapsible
    const vendors = getValue(data, 'iab.tcf.v2.vendors', {});
    const vendorKeys = Object.keys(vendors);
    const vendorPreview = vendorKeys.slice(0, 10);
    const hasMoreVendors = vendorKeys.length > 10;
    
    let vendorsText = `*🏢 IAB Vendors (${vendorKeys.length})*\n`;
    if (vendorKeys.length === 0) {
        vendorsText += '_No IAB vendors disclosed_';
    } else {
        vendorsText += vendorPreview.map(key => `\`${key}\``).join(', ');
        if (hasMoreVendors) {
            vendorsText += `\n_...and ${vendorKeys.length - 10} more_`;
        }
    }
    
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: vendorsText
        }
    });
    
    if (vendorKeys.length > 10) {
        blocks.push({
            type: "context",
            elements: [{
                type: "mrkdwn",
                text: "💡 _Showing first 10 vendors. Use Osano dashboard for full list._"
            }]
        });
    }

    // Footer
    blocks.push({
        type: "context",
        elements: [{
            type: "mrkdwn",
            text: "✅ _Configuration retrieved successfully_"
        }]
    });

    return blocks;
}

/**
 * Generates a detailed text report of all configuration items
 * @param {object} data - The fetched config.json
 * @returns {string} Formatted text report
 */
function generateDetailedReport(data) {
    let report = [];
    
    report.push('═══════════════════════════════════════════════════════════');
    report.push('           OSANO CONFIGURATION - DETAILED REPORT');
    report.push('═══════════════════════════════════════════════════════════\n');
    
    // Account Details
    report.push('📋 ACCOUNT DETAILS');
    report.push('─────────────────────────────────────────────────────────');
    report.push(`Account ID: ${getValue(data, 'customerId')}`);
    report.push(`Config ID: ${getValue(data, 'configId')}`);
    report.push(`Domains: ${formatValue(getValue(data, 'domains'), 'join')}\n`);
    
    // Scripts
    const scripts = getValue(data, 'scripts', {});
    const scriptKeys = Object.keys(scripts);
    report.push(`📜 SCRIPTS (${scriptKeys.length})`);
    report.push('─────────────────────────────────────────────────────────');
    if (scriptKeys.length === 0) {
        report.push('No scripts classified\n');
    } else {
        scriptKeys.forEach((key, index) => {
            report.push(`${index + 1}. ${key}`);
            report.push(`   Classification: ${scripts[key]}`);
        });
        report.push('');
    }
    
    // Cookies
    const cookies = getValue(data, 'cookies', {});
    const cookieKeys = Object.keys(cookies);
    const disclosures = getValue(data, 'disclosures', []);
    report.push(`🍪 COOKIES (${cookieKeys.length})`);
    report.push('─────────────────────────────────────────────────────────');
    report.push(`Disclosing Cookies: ${formatValue(disclosures.length > 0, 'boolean')}\n`);
    if (cookieKeys.length === 0) {
        report.push('No cookies classified\n');
    } else {
        cookieKeys.forEach((key, index) => {
            const c = cookies[key];
            report.push(`${index + 1}. ${key}`);
            report.push(`   Classification: ${c.classification}`);
            report.push(`   Provider: ${c.provider || 'N/A'}`);
            report.push(`   Expiry: ${c.expiry || 'N/A'}`);
            report.push(`   Domain: ${c.domain || 'N/A'}`);
        });
        report.push('');
    }
    
    // iFrames
    const iframes = getValue(data, 'iframes', {});
    const iframeKeys = Object.keys(iframes);
    report.push(`🖼️ IFRAMES (${iframeKeys.length})`);
    report.push('─────────────────────────────────────────────────────────');
    report.push(`Blocking Mode: ${formatValue(getValue(data, 'iframeBlocking'))}\n`);
    if (iframeKeys.length === 0) {
        report.push('No iFrames classified\n');
    } else {
        iframeKeys.forEach((key, index) => {
            report.push(`${index + 1}. ${key}`);
            report.push(`   Classification: ${iframes[key]}`);
        });
        report.push('');
    }
    
    // IAB Vendors
    const vendors = getValue(data, 'iab.tcf.v2.vendors', {});
    const vendorKeys = Object.keys(vendors);
    report.push(`🏢 IAB VENDORS (${vendorKeys.length})`);
    report.push('─────────────────────────────────────────────────────────');
    if (vendorKeys.length === 0) {
        report.push('No IAB vendors disclosed\n');
    } else {
        vendorKeys.forEach((key, index) => {
            report.push(`${index + 1}. Vendor ID: ${key}`);
        });
        report.push('');
    }
    
    report.push('═══════════════════════════════════════════════════════════');
    report.push('                    END OF REPORT');
    report.push('═══════════════════════════════════════════════════════════');
    
    return report.join('\n');
}

/**
 * Uploads a detailed report file to Slack
 * @param {object} data - The configuration data
 * @param {string} channel - The channel ID to upload to
 * @returns {Promise<string|null>} The file URL or null if upload failed
 */
async function uploadDetailedReport(data, channel) {
    const botToken = process.env.SLACK_BOT_TOKEN;
    
    if (!botToken) {
        console.error('SLACK_BOT_TOKEN not configured');
        return null;
    }
    
    try {
        const report = generateDetailedReport(data);
        const customerId = getValue(data, 'customerId', 'unknown');
        const configId = getValue(data, 'configId', 'unknown');
        const filename = `osano-config-${customerId}-${configId}.txt`;
        
        console.log(`Uploading detailed report to Slack: ${filename}`);
        
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('token', botToken);
        form.append('channels', channel);
        form.append('content', report);
        form.append('filename', filename);
        form.append('title', `📄 Osano Configuration Details - ${customerId}`);
        form.append('initial_comment', '📊 Complete configuration report with all scripts, cookies, iFrames, and vendors');
        
        const uploadResponse = await fetch('https://slack.com/api/files.upload', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });
        
        const result = await uploadResponse.json();
        
        if (result.ok) {
            console.log('File uploaded successfully');
            return result.file.permalink;
        } else {
            console.error('File upload failed:', result.error);
            return null;
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        return null;
    }
}

/**
 * Process the request asynchronously and send the result to Slack's response_url.
 * This function runs in the background after we've acknowledged the slash command.
 * @param {string} text - The text from the slash command
 * @param {string} response_url - Slack's webhook URL to send the delayed response
 * @param {string} channel_id - The channel ID where the command was run
 */
async function processRequest(text, response_url, channel_id) {
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

        // 3. Check if we should upload a detailed report
        const scripts = getValue(configData, 'scripts', {});
        const cookies = getValue(configData, 'cookies', {});
        const iframes = getValue(configData, 'iframes', {});
        const totalItems = Object.keys(scripts).length + Object.keys(cookies).length + Object.keys(iframes).length;
        
        console.log(`Configuration stats: ${Object.keys(scripts).length} scripts, ${Object.keys(cookies).length} cookies, ${Object.keys(iframes).length} iframes = ${totalItems} total items`);
        console.log(`Channel ID: ${channel_id || 'NOT PROVIDED'}`);
        console.log(`Bot token configured: ${process.env.SLACK_BOT_TOKEN ? 'YES' : 'NO'}`);
        
        let fileUrl = null;
        if (totalItems > 15) {
            if (!channel_id) {
                console.warn('Cannot upload file: channel_id not provided by Slack');
            } else if (!process.env.SLACK_BOT_TOKEN) {
                console.warn('Cannot upload file: SLACK_BOT_TOKEN not configured');
            } else {
                console.log(`Large configuration detected (${totalItems} items), uploading detailed report...`);
                fileUrl = await uploadDetailedReport(configData, channel_id);
                if (fileUrl) {
                    console.log(`File uploaded successfully: ${fileUrl}`);
                } else {
                    console.error('File upload returned null - check logs above for errors');
                }
            }
        } else {
            console.log(`Configuration is small (${totalItems} items), skipping file upload`);
        }

        // 4. Generate the Block Kit blocks
        console.log('Generating config blocks...');
        const blocks = generateConfigBlocks(configData);
        
        // Add file upload notification if successful
        if (fileUrl) {
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `📄 *Detailed Report Available*\nA complete report with all ${totalItems} items has been uploaded as a file above.`
                }
            });
        }

        // 5. Send the result back to Slack via response_url
        console.log('Sending response to Slack...');
        const slackResponse = await fetch(response_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                response_type: 'in_channel',
                blocks: blocks,
                text: '🔍 Osano Configuration Details' // Fallback text for notifications
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
 *
 * Strategy: Process the request fully and send result via response_url.
 * Slack will show a loading state while we work.
 */
exports.handler = async (event) => {
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

        // Get channel ID for file uploads
        const channel_id = body.get('channel_id');

        // 3. Process the request immediately and await completion
        await processRequest(text, response_url, channel_id);

        // 4. Return success (Slack won't show this, result goes via response_url)
        return {
            statusCode: 200,
            body: 'Processing complete'
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

