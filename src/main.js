const Apify = require('apify');
const { BASE_URL } = require('./constants');

const { log } = Apify.utils;
const {
    enqueueMainCategories,
    enqueueSubcategories,
    extractSubcatPage,
    extractProductPage,
} = require('./extractors');

const {
    validateInput,
    checkAndCreateUrlSource,
    maxItemsCheck,
    checkAndEval,
    applyFunction,
} = require('./utils');

Apify.main(async () => {
    const input = await Apify.getInput();
    validateInput(input);

    const {
        startUrls,
        maxItems = null,
        extendOutputFunction = null,
        proxyConfiguration,
    } = input;

    const sdkProxyConfiguration = await Apify.createProxyConfiguration(proxyConfiguration);
    // initialize request list from url sources
    const sources = checkAndCreateUrlSource(startUrls);
    const requestList = await Apify.openRequestList('start-list', sources);

    // open request queue
    const requestQueue = await Apify.openRequestQueue();

    // open dataset and get itemCount
    const dataset = await Apify.openDataset();
    let { itemCount } = await dataset.getInfo();

    // if exists, evaluate extendOutputFunction
    let evaledFunc;
    if (extendOutputFunction) evaledFunc = checkAndEval(extendOutputFunction);

    // crawler config
    const crawler = new Apify.CheerioCrawler({
        requestList,
        requestQueue,
        maxRequestRetries: 9, // there are blocks sometimes
        handlePageTimeoutSecs: 360,
        requestTimeoutSecs: 240,
        maxConcurrency: 20,
        proxyConfiguration: sdkProxyConfiguration,

        handlePageFunction: async ({ request, $ }) => {
            // if exists, check items limit. If limit is reached crawler will exit.
            if (maxItems) maxItemsCheck(maxItems, itemCount);

            log.info(`Processing: ${request.url}`);
            const { label } = request.userData;

            if (label === 'HOMEPAGE') {
                const totalEnqueued = await enqueueMainCategories($, requestQueue);
                log.info(`Enqueued ${totalEnqueued} main-categories from the homepage.`);
            }

            if (label === 'MAINCAT') {
                await enqueueSubcategories($, requestQueue);
                log.info(`Enqueued subcategories from ${request.url}`);
            }

            if (label === 'SUBCAT') {
                const productInfo = await extractSubcatPage($, request, sdkProxyConfiguration);
                const count = [];
                for (const obj of productInfo) {
                    await requestQueue.addRequest({
                        url: BASE_URL + obj.link,
                        userData: { label: 'PRODUCT', category: obj.category },
                    });
                    count.push(obj.link);
                }
                log.info(`Added ${(new Set(count)).size} products from ${request.url}`);
            }

            if (label === 'PRODUCT') {
                const { category } = request.userData;
                let item = await extractProductPage($, request, sdkProxyConfiguration, category);
                if (extendOutputFunction) item = await applyFunction($, evaledFunc, item);
                await dataset.pushData(item);
                itemCount++;
                log.info(`Product saved: ${item.itemId}`);
            }
        },
        handleFailedRequestFunction: async ({ request }) => {
            log.warning(`Request ${request.url} failed too many times`);
            await dataset.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
    });

    log.info('Starting crawler.');
    await crawler.run();

    log.info('Crawler Finished.');
});
