const Apify = require('apify');

const { log } = Apify.utils;

function validateInput(input) {
    if (!input) throw new Error('INPUT is missing.');

    // validate function
    const validate = (inputKey, type = 'string') => {
        const value = input[inputKey];

        if (type === 'array') {
            if (!Array.isArray(value)) {
                throw new Error(`Value of ${inputKey} should be array`);
            }
        } else if (value) {
            // eslint-disable-next-line valid-typeof
            if (typeof value !== type) {
                throw new Error(`Value of ${inputKey} should be ${type}`);
            }
        }
    };
    // check required field
    if (!input.startUrls && input.startUrls.length <= 0) {
        throw new Error('INPUT "startUrls" property is required');
    }
    // check correct types
    validate('startUrls', 'array');
    validate('maxItems', 'number');
    validate('extendOutputFunction', 'string');
    validate('proxyConfiguration', 'object');
}

function checkAndCreateUrlSource(startUrls) {
    const sources = [];

    const subcats = [
        '/products', '/new-arrivals', '/deals', '/seasonal-trending',
        '/campaigns/', '/concepts', '/selected/', '/shop-by-room', '/sale/',
    ];

    for (const { url } of startUrls) {
        // if url is the homepage
        if (url === 'https://www2.hm.com/en_us/index.html') {
            sources.push({ url, userData: { label: 'HOMEPAGE' } });
            log.info(`HOMEPAGE: ${url}`);
        } else if (url.includes('productpage') || /[0-9]{8,12}/.test(url)) {
            sources.push({ url, userData: { label: 'PRODUCT' } });
            log.info(`PRODUCT: ${url}`);
        } else if (subcats.some((el) => url.includes(el))) {
            sources.push({ url, userData: { label: 'SUBCAT' } });
            log.info(`SUBCUT: ${url}`);
        } else if (url.replace(/http(s)?:\/\//, '').match(/\//g).length <= 2) {
            sources.push({ url, userData: { label: 'MAINCAT' } });
            log.info(`MAINCUT: ${url}`);
        } else {
            // unsupported or bad formatted urls get here.
            log.warning(
                `The following url has not been added to the queue: ${url}.
                It may be due to unsupported or incorrect url. For more information, have a look at the actor documentation, "input" section.`,
            );
        }
    }
    return sources;
}

function maxItemsCheck(maxItems, itemCount) {
    if (itemCount >= maxItems) {
        log.info('Actor reached the max items limit. Crawler is going to halt...');
        log.info('Crawler Finished.');
        process.exit();
    }
}

function checkAndEval(extendOutputFunction) {
    let evaledFunc;
    try {
        // eslint-disable-next-line no-eval
        evaledFunc = eval(extendOutputFunction);
    } catch (e) {
        throw new Error(`extendOutputFunction is not a valid JavaScript! Error: ${e}`);
    }
    if (typeof evaledFunc !== 'function') {
        throw new Error('extendOutputFunction is not a function! Please fix it or use just default output!');
    }
    return evaledFunc;
}

async function applyFunction($, evaledFunc, item) {
    const isObject = (val) => typeof val === 'object' && val !== null && !Array.isArray(val);

    let userResult = {};
    try {
        userResult = await evaledFunc($);
    } catch (err) {
        log.error(`extendOutputFunction crashed! Pushing default output. Please fix your function if you want to update the output. Error: ${err}`);
    }

    if (!isObject(userResult)) {
        log.exception(new Error('extendOutputFunction must return an object!'));
        process.exit(1);
    }

    return { ...item, ...userResult };
}

module.exports = {
    validateInput,
    checkAndCreateUrlSource,
    maxItemsCheck,
    checkAndEval,
    applyFunction,
};
