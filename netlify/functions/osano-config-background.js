/**
 * Osano Config Details Bot - Background Function
 * 
 * This is a Netlify Background Function that processes the Osano config
 * and sends the result to Slack. Background functions can run for up to 15 minutes.
 * 
 * @version 2.0.0
 * @author Chris Washington
 */

const fetch = require('node-fetch');

// Regex to find the osano.js URL in a script tag or just a raw URL
const OSANO_URL_REGEX = /https?:\/\/cmp\.osano\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/osano\.js/;
const FETCH_TIMEOUT_MS = 50000; // 50 seconds

/**
 * Safely get a nested value from an object.
 */
function getValue(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    return value !== undefined ? value : defaultValue;
}

/**
 * Formats a raw value for display.
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
 */
function generateConfigSummary(data) {
    let summary = [];

    const addLine = (label, value, type) => {
        const formattedValue = formatValue(getValue(data, label, 'N/A'), type);
        summary.push(`*${value}:* ${formattedValue}`);
    };
    
    const addTitle = (title) => summary.push(`\n*${title}*`);

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
    summary.push(`*IAB US Privacy String:* (N/A)`);
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

    const scripts = getValue(data, 'scripts', {});
    const scriptKeys = Object.keys(scripts);
    addTitle(`Scripts (${scriptKeys.length})`);
    if (scriptKeys.length > 0) {
        scriptKeys.forEach(key => summary.push(`• \`${key}\` (${scripts[key]})`));
    } else {
        summary.push('No scripts classified.');
    }

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

    const iframes = getValue(data, 'iframes', {});
    const iframeKeys = Object.keys(iframes);
    addTitle(`iFrames (${iframeKeys.length})`);
    addLine('iframeBlocking', 'iFrame Blocking Mode');
    if (iframeKeys.length > 0) {
        iframeKeys.forEach(key => summary.push(`• \`${key}\` (${iframes[key]})`));
    } else {
        summary.push('No iFrames classified.');
    }

    const vendors = getValue(data, 'iab.tcf.v2.vendors', {});
    const vendorKeys = Object.keys(vendors);
    addTitle(`IAB Vendors (${vendorKeys.length})`);
    if (vendorKeys.length > 0) {
        vendorKeys.forEach(key => summary.push(`• Vendor ID: \`${key}\``));
    } else {
        summary.push('No IAB vendors disclosed.');
    }
    
    return summary.join('\n');
}

/**
 * Background function handler - processes the Osano config request
 */
exports.handler = async (event) => {
    console.log('Background function started');
    
    try {
        const { text, response_url, user_name, channel_name } = JSON.parse(event.body);
        
        console.log(`Processing request from ${user_name} in #${channel_name}: ${text}`);

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

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true })
        };

    } catch (error) {
        console.error('Error in background function:', error);
        
        const { response_url } = JSON.parse(event.body);
        const errorMessage = error.name === 'AbortError'
            ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds while fetching Osano configuration. The Osano API may be slow or unavailable. Please try again.`
            : error.message;

        try {
            console.log(`Sending error to Slack: ${errorMessage}`);
            await fetch(response_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    response_type: 'in_channel',
                    text: `:warning: *Error:* ${errorMessage}`
                })
            });
        } catch (err) {
            console.error('Failed to send error to Slack:', err);
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};